// =======================================================================================
// This Sail RISC-V architecture model, comprising all files and
// directories except where otherwise noted is subject the BSD
// two-clause license in the LICENSE file.
//
// SPDX-License-Identifier: BSD-2-Clause
// =======================================================================================

// ****************************************************************
// Virtual memory address translation and memory protection,
// including PTWs (Page Table Walks) and TLBs (Translation Look-aside Buffers)
// Supported VM modes: Sv32, Sv39, Sv48, Sv57

// The code below implements the steps in the "Virtual Address
// Translation Process" (abbreviated here to VATP) section of the
// Privileged Architecture specification.  Code locations
// corresponding to these steps are marked in the comments.

// STYLE NOTES:
//   PRIVATE items are used only within this VM code.
//   PUBLIC  items are invoked from other parts of sail-riscv.

// TLB NOTE:
// TLBs are not part of the RISC-V architecture specification.
// However, we model a simple TLB so that
// (1) we can meaningfully test SFENCE.VMA which is a no-op without TLBs;
// (2) we can greatly speed up simulation speed
//     (e.g., from 10s of minutes to few minutes for Linux boot)
// The TLB implementation is in a separate file: vmem_tlb.sail
// The code in this file is structured and commented so you can easily
// ignore TLB functionality at first reading.

struct PTW_Output('v : Int), is_xv_mode('v) = {
  ppn     : ppn_bits('v),
  pte     : pte_bits('v),
  pteAddr : physaddr,
  level   : level_range('v),
  global  : bool,
}

// PRIVATE
type PTW_Result('v : Int), is_xv_mode('v) = result((PTW_Output('v), ext_ptw), (PTW_Error, ext_ptw))

// ****************************************************************
// Page Table Walk (PTW)

// Write a Page Table Entry.
function write_pte forall 'n, 'n in {4, 8} . (
  paddr    : physaddr,
  pte_size : int('n),
  pte      : bits('n * 8),
) -> MemoryOpResult(bool) =
  mem_write_value_priv(paddr, pte_size, pte, Supervisor, false, false, false)

// Read a Page Table Entry.
function read_pte forall 'n, 'n in {4, 8} . (
  paddr    : physaddr,
  pte_size : int('n),
) -> MemoryOpResult(bits(8 * 'n)) =
  mem_read_priv(Read(Data), Supervisor, paddr, pte_size, false, false, false)

// ****************************************************************

type hvirtaddr = bits(64)

type TR_Result('paddr : Type, 'failure : Type) = result(('paddr, ext_ptw), ('failure, ext_ptw))

val translate_stage : (
  hvirtaddr,                   // virtual address
  AccessType(ext_access_type), // Read/Write/ReadWrite/Execute
  Privilege,                   // Machine/Supervisor/User
  AddressTranslationStage,     // S/VS/G
  ext_ptw,                     // ext_ptw
) -> TR_Result(physaddr, PTW_Error)

// PRIVATE
// 'v is the virtual address size.
val pt_walk : forall 'v, is_xv_mode('v) . (
  int('v),                      // Sv32, Sv39, Sv48, Sv57
  vpn_bits('v),                 // Virtual Page Number
  AccessType(ext_access_type),  // Read/Write/ReadWrite/InstructionFetch
  Privilege,                    // User/Supervisor/Machine
  AddressTranslationStage,
  bool,                         // mstatus.MXR
  bool,                         // do_sum
  ppn_bits('v),                 // Base PPN (`a` in the spec).
  level_range('v),              // Tree level for this recursive call (`i` in the spec).
  bool,                         // global translation,
  ext_ptw                       // ext_ptw
) -> PTW_Result('v)

// Steps 2-8 of the VATP.
function pt_walk(
  sv_width,
  vpn,
  ac,
  priv,
  stage,
  mxr,
  do_sum,
  pt_base,
  level,
  global,
  ext_ptw,
) = {
  // Extract the PPN component for this level; 10 bits on Sv32, otherwise 9.
  print_log("pt_walk::begin");

  let 'vpn_i_size = if 'v == 32 | 'v == 34 then 10 else 9;
  let 'log_pte_size_bytes = if 'v == 32 | 'v == 34 then 2 else 3;
  // FIXME: improve this, mabe change virtaddr and phyaddr type constraints?
  let pte_addr : bits(64) = 
    if 'v - 3 == (level + 1) * vpn_i_size - 1
    then zero_extend(pt_base @ vpn['v - 1 .. level * vpn_i_size] @ zeros('log_pte_size_bytes))
    else zero_extend(pt_base @ vpn[(level + 1) * vpn_i_size - 1 .. level * vpn_i_size] @ zeros('log_pte_size_bytes));

  // Address of PTE in page table. This is 34 bits for Sv32, otherwise 56 bits.


  // Convert to a physical address (34 bits for RV32, 64 bits to RV64).
  // The assertion is required so Sail knows that we can't have a
  // pte_addr of 56 bits and physaddr of 34 bits (because you can't
  // use Sv39+ on RV32).
  assert(sv_width == 32 | xlen == 64);

  // print_bits("before read_pte", );
  // Read this-level PTE from mem (Step 2 of VATP)

  let pte_phys_addr : physaddrbits = match stage {
    Stage_VS => {
      print_log("pt_walk::Stage_VS");
      match translate_stage(zero_extend(pte_addr), Read(Data), User, Stage_G, ext_ptw) {
        Ok(pte_pa, ext_ptw) => bits_of(pte_pa)[(physaddrbits_len - 1) .. 0],
        Err(f, ext_ptw)  => return Err(PTW_Implicit(ptw_implicit_error(f), zero_extend(pte_addr), Read(Data)), ext_ptw),
      }
    },
    _  => {
      print_log("pt_walk::Stage_Other");
      pte_addr[(physaddrbits_len - 1) .. 0]
    }
  };

  let pte_addr = Physaddr(pte_phys_addr);

  print_log("pt_walk::read_pte::begin");
  match read_pte(pte_addr, 2 ^ log_pte_size_bytes) {
    Err(e)  => {
      print_log("pt_walk::read_pte Err = " ^ to_str(e));
      Err(PTW_Access(), ext_ptw)
    },
    Ok(pte) => {
      print_log("pt_walk::read_pte Ok");
      let pte_flags = Mk_PTE_Flags(pte[7 .. 0]);
      let pte_ext   = ext_bits_of_PTE(pte);

      if pte_is_invalid(pte_flags, pte_ext) then
        // Step 3 of VATP.
        Err(PTW_Invalid_PTE(), ext_ptw)
      else {
        // Step 4 of VATP.
        let ppn = PPN_of_PTE(pte); // 22 or 44.
        let global = global | (pte_flags[G] == 0b1);
        if pte_is_non_leaf(pte_flags) then {
          // Non-Leaf PTE
          if level > 0 then
            // follow the pointer to walk next level (i.e., go to Step 2)
            pt_walk(sv_width, vpn, ac, priv, stage, mxr, do_sum, ppn, level - 1, global, ext_ptw)
          else
            // level 0 PTE, but contains a pointer instead of a leaf
            Err(PTW_Invalid_PTE(), ext_ptw)
        } else {
          // Leaf PTE (Step 5 of VATP).
          let ppn_size_bits = if 'v == 32 | 'v == 34 then 10 else 9;
          if level > 0 then {
            // Check for misaligned superpage.
            let low_bits = ppn_size_bits * level;
            if   ppn[low_bits - 1 .. 0] != zeros()
            then return Err(PTW_Misaligned(), ext_ptw);
          };
          // Steps 6, 7 (TODO: shadow stack protection), 8 of VATP.
          match check_PTE_permission(ac, priv, mxr, do_sum, pte_flags, pte_ext, ext_ptw) {
            PTE_Check_Failure(ext_ptw, ext_ptw_fail) =>
              Err(ext_get_ptw_error(ext_ptw_fail), ext_ptw),
            PTE_Check_Success(ext_ptw) => {
              let ppn = if level > 0 then {
                // Compose final PA in superpage:
                // Superpage PPN @ lower VPNs @ page-offset
                let low_bits = ppn_size_bits * level;
                ppn[length(ppn) - 1 .. low_bits] @ vpn[low_bits - 1 .. 0]
              } else {
                ppn
              };
              Ok(struct {ppn=ppn, pte=pte, pteAddr=pte_addr, level=level, global=global}, ext_ptw)
            }
          }
        }
      }
    }
  }
}

// ****************************************************************
// Architectural SATP CSR

// PUBLIC: see also zicsr_insts.sail and other CSR-related files
register satp : xlenbits
mapping clause csr_name_map = 0x180  <-> "satp"
function clause is_CSR_accessible(0x180, priv, _) = currentlyEnabled(Ext_S) & not(priv == Supervisor & mstatus[TVM] == 0b1)
function clause read_CSR(0x180) = satp
function clause write_CSR(0x180, value) = { satp = legalize_satp(architecture(cur_privilege), satp, value); Ok(satp) }

// ----------------
// Fields of SATP

// ASID is 9b in Sv32, 16b in Sv39/Sv48/Sv57
// PRIVATE
val xsatp_to_asid : forall 'n, 'n in {32, 64}. bits('n) -> bits(if 'n == 32 then 9 else 16)
function xsatp_to_asid(satp_val) =
  if 'n == 32 then Mk_Satp32(satp_val)[Asid] else Mk_Satp64(satp_val)[Asid]

// PRIVATE
val hgatp_to_mode : forall 'n, 'n in {32, 64}. bits('n) -> bits(if 'n == 32 then 1 else 4)
function hgatp_to_mode(satp_val) =
  if 'n == 32 then Mk_Hgatp32(satp_val)[Mode] else Mk_Hgatp64(satp_val)[Mode]

// VMID is 7b in Sv32x4, 14b in Sv39x4/Sv48x4/Sv57x4: we use 14b for both
// PRIVATE
function hgatp_to_vmid forall 'n, 'n in {32, 64}. (hgatp_val : bits('n)) -> bits(if 'n == 32 then 7 else 14) = {
   if 'n == 32 then Mk_Hgatp32(hgatp_val)[Vmid] else Mk_Hgatp64(hgatp_val)[Vmid]
}

// PRIVATE
val satp_to_ppn : forall 'n, 'n in {32, 64}. bits('n) -> bits(if 'n == 32 then 22 else 44)
function satp_to_ppn(satp_val) =
  if 'n == 32 then Mk_Satp32(satp_val)[PPN] else Mk_Satp64(satp_val)[PPN]

// Result is 64b to cover both RV32 and RV64 addresses
// PRIVATE
function hgatp_to_ppn forall 'n, 'n in {32, 64}. (hgatp_val : bits('n)) -> bits(if 'n == 32 then 22 else 44) = {
  if 'n == 32 then Mk_Hgatp32(hgatp_val)[PPN] else Mk_Hgatp64(hgatp_val)[PPN]
  // ppn << pagesize_bits
}

// PRIVATE
register hgatp : xlenbits

type vmidbits = bits(14)

mapping clause csr_name_map = 0x680  <-> "hgatp"

function clause is_CSR_accessible(0x680, _, _) = currentlyEnabled(Ext_H) // hgatp

function clause read_CSR(0x680) = hgatp


// See riscv_hext_regs.sail for legalize_hgatp{32,64}().
// WARNING: those functions legalize Mode but not VMID?
// PUBLIC: invoked from writeCSR() to fixup WARL fields
function legalize_hgatp(a : Architecture,
                       o : xlenbits,        // previous value of hgatp
                       v : xlenbits)        // proposed new value of hgatp
                      -> xlenbits = {       // new legal value of hgatp
  if sizeof(xlen) == 32 then {
    // The slice and extend ops below are no-ops when xlen==32,
    // but appease the type-checker when xlen==64 (when this code is not executed!)
    let o32      : bits(32) = o[31 .. 0];
    let v32      : bits(32) = v[31 .. 0];
    let new_hgatp : bits(32) = legalize_hgatp32(a, o32, v32);
    zero_extend(new_hgatp);
  } else if sizeof(xlen) == 64 then {
    // The extend and truncate ops below are no-ops when xlen==64,
    // but appease the type-checker when xlen==32 (when this code is not executed!)
    let o64      : bits(64) = zero_extend(o);
    let v64      : bits(64) = zero_extend(v);
    let new_hgatp : bits(64) = legalize_hgatp64(a, o64, v64);
    truncate(new_hgatp, sizeof(xlen))
  } else
    internal_error(__FILE__, __LINE__, "Unsupported xlen")
}

function clause write_CSR(0x680, value) = { hgatp = legalize_hgatp(architecture(cur_privilege), hgatp, value); Ok(hgatp) }

// ----------------
// Fields of HGATP

// ****************************************************************
// Applicable address translation mode

// Compute address translation mode from SATP/HGATP register
// PRIVATE
function translationMode(priv : Privilege, stage : AddressTranslationStage) -> XATPMode = {
  // For S- & G-stage, translation mode is based on mstatus.SXL
  // For VS-stage, translation mode is based on hstatus.VSXL
  let arch : Architecture = match stage {
    Stage_VS => architecture_bits(get_hstatus_VSXL(hstatus)),
    _        => architecture_bits(mstatus[SXL]),
  };

  let mode = if priv == Machine then
            Some(Bare)
          else match (stage, arch, xlen) {
            (Stage_S,  RV32,  _) => satpMode_of_bits(RV32, zero_extend(Mk_Satp32(satp[31 .. 0])[Mode])),
            (Stage_S,  RV64, 64) => satpMode_of_bits(RV64, Mk_Satp64(satp)[Mode]),
            (Stage_VS, RV32,  _) => satpMode_of_bits(RV32, zero_extend(Mk_Satp32(vsatp[31 .. 0])[Mode])),
            (Stage_VS, RV64, 64) => satpMode_of_bits(RV64, Mk_Satp64(vsatp)[Mode]),
  
            (Stage_G,  RV32,  _) => hgatp64Mode_of_bits(RV32, zero_extend(Mk_Hgatp32(hgatp[31 .. 0])[Mode])),
            (Stage_G,  RV64, 64) => hgatp64Mode_of_bits(RV64, Mk_Hgatp64(hgatp)[Mode]),
            (_, _, _)                  => internal_error(__FILE__, __LINE__, "unsupported address translation arch")
          };

  match mode {
      Some(m) => m,
      None()  => internal_error(__FILE__, __LINE__, "invalid translation mode in xatp")
  }
}

// ****************************************************************
// VA to PA translation

// Result of address translation

// This function can be ignored on first reading since TLBs are not
// part of RISC-V architecture spec (see TLB NOTE above).
// PRIVATE: translate on TLB hit, and maintenance of PTE in TLB
function translate_TLB_hit forall 'v, is_xv_mode('v) . (
  sv_width  : int('v),
  asid      : xxidbits,
  vpn       : vpn_bits('v),
  ac        : AccessType(ext_access_type),
  priv      : Privilege,
  stage     : AddressTranslationStage,
  mxr       : bool,
  do_sum    : bool,
  ext_ptw   : ext_ptw,
  tlb_index : tlb_index_range,
  ent       : TLB_Entry,
) -> TR_Result(ppn_bits('v), PTW_Error) = {

  let pte_size  = if sv_width == 32 | sv_width == 34 then 4 else 8;
  let pte       = tlb_get_pte(pte_size, ent);  // Step 2 of VATP.
  let ext_pte   = ext_bits_of_PTE(pte);
  let pte_flags = Mk_PTE_Flags(pte[7 .. 0]);
  let pte_check = check_PTE_permission(ac, priv, mxr, do_sum, pte_flags,
                                       ext_pte, ext_ptw);

  match pte_check {
    PTE_Check_Failure(ext_ptw, ext_ptw_fail) =>
      Err(ext_get_ptw_error(ext_ptw_fail), ext_ptw),
    PTE_Check_Success(ext_ptw) =>
      match update_PTE_Bits(pte, ac) {
        None()     => Ok(tlb_get_ppn(sv_width, ent, vpn), ext_ptw),
        Some(pte') =>
          // Step 9 of VATP. See platform.sail.
          if not(plat_enable_dirty_update) then
            // pte needs dirty/accessed update but that is not enabled
            Err(PTW_PTE_Update(), ext_ptw)
          else {
            // Writeback the PTE (which has new A/D bits)
            write_TLB(tlb_index, tlb_set_pte(ent, pte'), stage);
            
            let pteAddr = bits_of_physaddr(ent.pteAddr);
            let pte_phys_addr : physaddrbits = match stage {
              Stage_VS => match translate_stage(zero_extend(pteAddr), Write(Data), User, Stage_G, ext_ptw) {
                            Ok(pte_pa, ext_ptw) => (bits_of(pte_pa))[(sizeof(physaddrbits_len) - 1) .. 0],
                            Err(f, ext_ptw) => return Err(PTW_Implicit(ptw_implicit_error(f), zero_extend(pteAddr), Write(Data)), ext_ptw),
                          },
              _  => pteAddr[(physaddrbits_len - 1) .. 0],
            };

            let pdra = Physaddr(pte_phys_addr);
            match write_pte(pdra, pte_size, pte') {
              Ok(_)  => (),
              Err(e) => internal_error(__FILE__, __LINE__,
                                       "invalid physical address in TLB")
            };
            Ok(tlb_get_ppn(sv_width, ent, vpn), ext_ptw)
          }
      }
  }
}

// PRIVATE: translate on TLB miss (do a page-table walk)
function translate_TLB_miss forall 'v, is_xv_mode('v) . (
  sv_width : int('v),
  asid     : xxidbits,
  base_ppn : ppn_bits('v),
  vpn      : vpn_bits('v),
  ac       : AccessType(ext_access_type),
  priv     : Privilege,
  stage    : AddressTranslationStage,
  mxr      : bool,
  do_sum   : bool,
  ext_ptw  : ext_ptw,
) -> TR_Result(ppn_bits('v), PTW_Error) = {
  let initial_level = if 'v == 32 | 'v == 34 then 1 else (if 'v == 39 | 'v == 41 then 2 else (if 'v == 48 | 'v == 50 then 3 else 4));
  print_log("translate_TLB_miss::begin");

  // Step 2 of VATP occurs in pt_walk().
  let 'pte_size = if sv_width == 32 | sv_width == 34 then 4 else 8;
  let ptw_result = pt_walk(sv_width, vpn, ac, priv, stage, mxr, do_sum,
                           base_ppn, initial_level, false, ext_ptw);
  match ptw_result {
    Err(f, ext_ptw) => {
      print_log("translate_TLB_miss::Err: ");
      Err(f, ext_ptw)
    },
    Ok(struct {ppn, pte, pteAddr, level, global}, ext_ptw) => {
      print_log("translate_TLB_miss::Ok: ");
      let ext_pte = ext_bits_of_PTE(pte);
      // Without TLBs, this 'match' expression can be replaced simply
      // by: 'Ok(ppn, ext_ptw)'    (see TLB NOTE above)
      match update_PTE_Bits(pte, ac) {
        None() => {
          print_log("translate_TLB_miss::None: ");
          add_to_TLB(sv_width, asid, stage, vpn, ppn, pte, pteAddr, level, global);
          Ok(ppn, ext_ptw)
        },
        Some(pte) => {
          print_log("translate_TLB_miss::Some: ");
          // Step 9 of VATP. See platform.sail.
          if not(plat_enable_dirty_update) then
            // pte needs dirty/accessed update but that is not enabled
            Err(PTW_PTE_Update(), ext_ptw)
          else {

            let pteAddr = bits_of(pteAddr);
            let mode = translationMode(priv, stage);
            let pte_phys_addr : physaddrbits = match stage {
              Stage_VS => match translate_stage(zero_extend(pteAddr), Write(Data), User, Stage_G, ext_ptw) {
                            Ok(pte_pa, ext_ptw) => (bits_of(pte_pa))[(sizeof(physaddrbits_len) - 1) .. 0],
                            Err(f, ext_ptw) => return Err(PTW_Implicit(ptw_implicit_error(f), zero_extend(pteAddr), Write(Data)), ext_ptw),
                          },
              _  => pteAddr[(physaddrbits_len - 1) .. 0],
            };
            // Writeback the PTE (which has new A/D bits)
            let pdra = Physaddr(pte_phys_addr);
            match write_pte(pdra, pte_size, pte) {
              Ok(_) => {
                add_to_TLB(sv_width, asid, stage, vpn, ppn, pte, Physaddr(pteAddr), level, global);
                Ok(ppn, ext_ptw)
              },
              Err(e) =>
                Err(PTW_Access(), ext_ptw)
            }
          }
        }
      }
    }
  }
}

// Mapping the SATPMode to the width integer. Note there is also SvBare
// and it's an error to call this with SvBare.
mapping satp_mode_width : XATPMode <-> {32, 39, 48, 57} = {
  Sv32   <-> 32,
  Sv39   <-> 39,
  Sv48   <-> 48,
  Sv57   <-> 57,
}
mapping hgatp_mode_width : XATPMode <-> {34, 41, 50, 59} = {
  Sv32x4 <-> 34,
  Sv39x4 <-> 41,
  Sv48x4 <-> 50,
  Sv57x4 <-> 59,
}
mapping xatp_mode_width : XATPMode <-> {32, 39, 48, 57, 34, 41, 50, 59} = {
  Sv32   <-> 32,
  Sv39   <-> 39,
  Sv48   <-> 48,
  Sv57   <-> 57,
  Sv32x4 <-> 34,
  Sv39x4 <-> 41,
  Sv48x4 <-> 50,
  Sv57x4 <-> 59,
}

// PRIVATE
function translate forall 'v, is_xv_mode('v) . (
  stage    : AddressTranslationStage,
  sv_width : int('v),
  asid     : xxidbits,
  base_ppn : ppn_bits('v),
  vpn      : vpn_bits('v),
  ac       : AccessType(ext_access_type),
  priv     : Privilege,
  mxr      : bool,
  do_sum   : bool,
  ext_ptw  : ext_ptw,
) -> TR_Result(ppn_bits('v), PTW_Error) = {
  // On first reading, assume lookup_TLB returns None(), since TLBs
  // are not part of RISC-V archticture spec (see TLB NOTE above)
  match lookup_TLB(sv_width, asid, vpn, stage) {
    Some(index, ent) => {
      print_log("translate::lookup_TLB::Some");
      translate_TLB_hit(sv_width, asid, vpn, ac, priv, stage,
                                          mxr, do_sum, ext_ptw, index, ent)
    },
    None()           => {
      print_log("translate::lookup_TLB::Some");
      translate_TLB_miss(sv_width, asid, base_ppn, vpn, ac, priv, stage,
                                           mxr, do_sum, ext_ptw)
    },
  }
}

// SATP is represented in the model as an XLEN register (xlenbits), but it's
// actually SXLEN. That means if we are using Sv39 (which is only available when
// SXLEN is 32), then it must be a 32 bit register.
function get_satp forall 'v, is_sv_mode('v). (
  sv_width : int('v)
) -> bits(if 'v == 32 then 32 else 64) = {
  // Cannot use Sv39+ on RV32.
  assert('v == 32 | xlen == 64);
  if sv_width == 32 then satp[31 .. 0] else satp
}

function get_vsatp forall 'v, is_sv_mode('v). (
  sv_width : int('v)
) -> bits(if 'v == 32 then 32 else 64) = {
  // Cannot use Sv39+ on RV32.
  assert('v == 32 | xlen == 64);
  if sv_width == 32 then vsatp[31 .. 0] else vsatp
}

function get_hgatp forall 'v, is_svx4_mode('v). (
  sv_width : int('v)
) -> bits(if 'v == 34 then 32 else 64) = {
  // Cannot use Sv39x4+ on RV32.
  assert('v == 34 | xlen == 64);
  if sv_width == 34 then hgatp[31 .. 0] else hgatp
}


// PRIVATE: perform address translation for a specific stage
// Note: translate_stage is used for translation of implicit accesses during page walk
//       => 'val' declaration should occur before 'function' definition of pt_walk,
//          the 'function' definition of translate_stage is further down in this file
// Translate VA -> PA (S-stage), VA -> GPA (VS-stage) or GPA -> SPA(G-stage)
function translate_stage(
  vAddr    : hvirtaddr,                    // virtual address
  ac       : AccessType(ext_access_type), // Read/Write/ReadWrite/Execute
  priv     : Privilege,                   // Machine/Supervisor/User
  stage    : AddressTranslationStage,     // S/VS/G
  ext_ptw  : ext_ptw,                     // ext_ptw
) -> TR_Result(physaddr, PTW_Error) = {
  let mode = translationMode(priv, stage);
  match stage {
    Stage_S => {
      // Sv39 -> 39, etc.
      let sv_width = satp_mode_width(mode);
      // For Sv32 on RV64, satp is 32 bits (SXLEN), not XLEN.
      let satp_sxlen = get_satp(sv_width);
      // Cannot use Sv39+ on RV32.
      assert(sv_width == 32 | xlen == 64);
      let svAddr = vAddr[sv_width - 1 .. 0];
      if vAddr != sign_extend(svAddr) then {
        // translationException(ac, stage, PTW_Invalid_Addr())
        return Err(PTW_Invalid_Addr(), init_ext_ptw);
      };

      let mxr    : bool     = mstatus[MXR] == 0b1;
      let do_sum : bool     = mstatus[SUM] == 0b1;
      let asid              = xsatp_to_asid(satp);

      // let ptb    : bits(64) = satp_to_PT_base(satp);
      let satp_sxlen = get_satp(sv_width);
      let base_ppn = satp_to_ppn(satp_sxlen);
      let res = translate(Stage_S,
                sv_width,
                zero_extend(asid),
                base_ppn, // ptb
                svAddr[sv_width - 1 .. pagesize_bits],
                ac,
                priv,
                mxr,
                do_sum,
                ext_ptw);
      
      // Fixup result PA or exception
      match res {
        Ok(ppn, ext_ptw) => {
          // Step 10 of VATP.
          // Append the page offset. This is now a 34 or 56 bit address.
          let paddr = ppn @ vAddr[pagesize_bits - 1 .. 0];

          print_bits("translate_stage::Stage_S::Ok: ", paddr);
          // On RV64 paddr can be 34 or 56 bits, so we zero extend to 64.
          // On RV32 paddr can only be 34 bits. Sail knows this due to
          // the assertion above.
          Ok(Physaddr(zero_extend(paddr)), ext_ptw)
        },
        Err(f, ext_ptw)  => {
          print_log("translate_stage::Stage_S::Err: " ^ to_str(f));
          Err(f, ext_ptw)
        }
      }
    },
    Stage_VS => {
      let sv_width = satp_mode_width(mode);
      // For Sv32 on RV64, satp is 32 bits (SXLEN), not XLEN.
      let vsatp_sxlen = get_vsatp(sv_width);
      // Cannot use Sv39+ on RV32.
      assert(sv_width == 32 | xlen == 64);
      let svAddr = vAddr[sv_width - 1 .. 0];
      if vAddr != sign_extend(svAddr) then {
        return Err(PTW_Invalid_Addr(), init_ext_ptw);
      };

      let mxr    : bool     = mstatus[MXR] == 0b1 | vsstatus[MXR] == 0b1; // HS-level MXR overwrites VS-stage page protections
      let do_sum : bool     = vsstatus[SUM] == 0b1;
      let asid              = xsatp_to_asid(vsatp);
      // let ptb    : bits(64) = satp_to_PT_base(vsatp);
      let base_ppn          = satp_to_ppn(vsatp_sxlen);
      let res = translate(Stage_VS,
                sv_width,
                zero_extend(asid),
                base_ppn, // ptb
                svAddr[sv_width - 1 .. pagesize_bits],
                ac,
                priv,
                mxr,
                do_sum,
                ext_ptw);
      // Fixup result PA or exception
      match res {
        Ok(ppn, ext_ptw) => {
          // Step 10 of VATP.
          // Append the page offset. This is now a 34 or 56 bit address.
          let paddr = ppn @ vAddr[pagesize_bits - 1 .. 0];
          print_bits("translate_stage::Stage_VS::Ok: ", paddr);

          // On RV64 paddr can be 34 or 56 bits, so we zero extend to 64.
          // On RV32 paddr can only be 34 bits. Sail knows this due to
          // the assertion above.
          Ok(Physaddr(zero_extend(paddr)), ext_ptw)
        },
        Err(f, ext_ptw)  => {
          print_log("translate_stage::Stage_VS::Err: " ^ to_str(f));
          Err(f, ext_ptw)
        }
      }
    },
    Stage_G => {
      let sv_width = hgatp_mode_width(mode);
      // For Sv32 on RV64, satp is 32 bits (SXLEN), not XLEN.
      let hgatp_sxlen = get_hgatp(sv_width);
      // Cannot use Sv39+ on RV32.
      assert(sv_width == 32 | xlen == 64);
      let svAddr = vAddr[sv_width - 1 .. 0];
      if vAddr != sign_extend(svAddr) then {
        return Err(PTW_Invalid_Addr(), init_ext_ptw);
      };

      let mxr    : bool     = mstatus[MXR] == 0b1;
      let do_sum : bool     = mstatus[SUM] == 0b1;
      let vmid   : bits(16) = zero_extend(hgatp_to_vmid(hgatp));
      let ptb               = hgatp_to_ppn(hgatp_sxlen);
      let res = translate(Stage_G,
                sv_width,
                (vmid),
                ptb,
                svAddr[sv_width - 1 .. pagesize_bits],
                ac,
                User,                 // All G-stage memory accesses are considered User-level
                mxr,
                do_sum,
                ext_ptw);
      // Fixup result PA or exception
      match res {
        Ok(ppn, ext_ptw) => {
          // Step 10 of VATP.
          // Append the page offset. This is now a 34 or 56 bit address.
          let paddr = ppn @ vAddr[pagesize_bits - 1 .. 0];

          print_bits("translate_stage::Stage_G::Ok: ", paddr);
          // On RV64 paddr can be 34 or 56 bits, so we zero extend to 64.
          // On RV32 paddr can only be 34 bits. Sail knows this due to
          // the assertion above.
          Ok(Physaddr(zero_extend(paddr)), ext_ptw)
        },
        Err(f, ext_ptw)  => {
          print_log("translate_stage::Stage_G::Err: " ^ to_str(f));
          Err(f, ext_ptw)
        }
      }
    },
  }
}
  

// PUBLIC
/*! Result of Address Translation (AT) */
// union TR_Result('paddr : Type, 'exception : Type, 'context : Type) = {
//   TR_Address : ('paddr, ext_ptw),
//   TR_Failure : ('exception, 'context, ext_ptw)
// }

// Addr-translation function for specific privilege & virtualization mode
// PUBLIC: invoked from HLV, HSV and HLVX

// Top-level addr-translation function
function translateAddr_pv(
  vAddr : virtaddr,
  ac    : AccessType(ext_access_type),
  priv     : Privilege
) -> TR_Result(physaddr, (ExceptionType, ExceptionContext)) = {

  let start_is_virt = privLevel_is_virtual(priv);
  let stage = if start_is_virt then {
    Stage_VS
  } else {
    Stage_S
  };
  let mode = translationMode(priv, stage);

  print_bits("translateAddr::vAddr: ", bits_of(vAddr));
  print_log ("translateAddr::stage: " ^ to_str(stage));
  print_log ("translateAddr::mode : " ^ to_str(mode));

  if mode == Bare then return Ok(Physaddr(zero_extend(bits_of(vAddr))), init_ext_ptw);

  let vAddr = zero_extend(64, bits_of(vAddr));

  let res = translate_stage(vAddr, ac, priv, stage, init_ext_ptw);

  if start_is_virt then {
    match res {
      Ok(gpa, _) => {
        print_log("VS-stage success");
        match translate_stage(zero_extend(bits_of(gpa)), ac, priv, Stage_G, init_ext_ptw) {
          Ok(spa, ext_ptw) => {
            print_log("G-stage success");
            Ok(spa, ext_ptw)
          },
          Err(f, ext_ptw) => {
            print_log("G-stage success");
            Err((
                  translationException(ac, Stage_G, f),
                  {translationExcContext(f, vAddr, true) with excinfo2 = Some(truncate(bits_of(gpa) >> 2, xlen))}
                ), ext_ptw)
          }
        }
      },
      Err(f, ext_ptw) => {
        print_log("VS-stage failed");
        Err((translationException(ac, Stage_G, f), translationExcContext(f, vAddr, true)), ext_ptw)
      }
    }
  } else {
    match res {
      Ok(a, ext_ptw) => Ok(a, ext_ptw),
      Err(f, ext_ptw) => Err((translationException(ac, stage, f), translationExcContext(f, vAddr, false)), ext_ptw)
    }
  }
}

// PUBLIC: invoked from instr-fetch and load/store/amo
function translateAddr(
  vAddr : virtaddr,
  ac    : AccessType(ext_access_type),
) -> TR_Result(physaddr, (ExceptionType, ExceptionContext)) = {

  // Effective privilege takes into account mstatus.PRV, mstatus.MPP
  // See sys_regs.sail for effectivePrivilege() and cur_privilege
  let effPriv = effectivePrivilege(ac, mstatus, cur_privilege);
  translateAddr_pv(vAddr, ac, effPriv)
}

// ****************************************************************
// Initialize Virtual Memory state

// PUBLIC: invoked from init_model()
function reset_vmem() -> unit = reset_TLB()

// ****************************************************************
