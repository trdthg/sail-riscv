// =======================================================================================
// This Sail RISC-V architecture model, comprising all files and
// directories except where otherwise noted is subject the BSD
// two-clause license in the LICENSE file.
//
// SPDX-License-Identifier: BSD-2-Clause
// =======================================================================================

// ******************************************************************************
// Integrated Matrix Extension (IME).
//
// This implementation covers the full IME mnemonic set:
//   - integer matrix MACs
//   - floating-point matrix MACs, including microscaling via v0.scale
//   - integer-input floating-point accumulate matrix MACs
//   - tile load/store and transposing tile load/store
//
// Unsupported operand-format combinations remain illegal. In particular, the
// current model supports standard FP16/FP32/FP64 accumulators plus BF16 inputs
// widened into FP32/FP64 accumulators, but does not model BF16 accumulation or
// sub-byte FP4/FP8 inputs.
// ******************************************************************************

private struct IMEGeometry = {
  widening  : int,
  lambda    : int,
  lmul      : int,
  input_eew : int,
  c_eew     : int,
  input_epr : int,
  c_epr     : int,
  k_eff     : int,
  m         : int,
  n         : int,
  mul_c     : int,
}

private struct IMEMicroscale = {
  block_size  : int,
  scale_count : int,
  scale_stride : int,
}

private struct IMETileState = {
  eew           : sew_bitsize,
  mem_width     : word_width,
  lmul          : int,
  eff_lambda    : int,
  elems_per_reg : int,
  num_elem      : int,
  start_element : int,
  linesize      : int,
  ld            : int,
}

function decode_vlambda(lam_enc : bits(3)) -> option(int) =
  match lam_enc {
    0b000 => None(),
    0b001 => Some(1),
    0b010 => Some(2),
    0b011 => Some(4),
    0b100 => Some(8),
    0b101 => Some(16),
    0b110 => Some(32),
    0b111 => Some(64),
  }

function tile_reg_idx(i : int, LMUL : int, lambda : int, elems_per_reg : int) -> int = {
  let linesize : int = lambda * LMUL;
  let line : int = if linesize == 0 then 0 else quot_round_zero(i, linesize);
  let elem_in_line : int = if linesize == 0 then 0 else rem_round_zero(i, linesize);
  let regoff : int = if lambda == 0 then 0 else quot_round_zero(elem_in_line, lambda);
  let elementoff : int = if lambda == 0 then 0 else line * lambda + rem_round_zero(elem_in_line, lambda);
  regoff * elems_per_reg + elementoff
}

function mat_A_idx(i : int, k : int, K_eff : int, LMUL : int, lambda : int, epr : int) -> int =
  tile_reg_idx(i * K_eff + k, LMUL, lambda, epr)

function mat_B_idx(k : int, j : int, K_eff : int, LMUL : int, lambda : int, epr : int) -> int =
  tile_reg_idx(j * K_eff + k, LMUL, lambda, epr)

function mat_C_idx(i : int, j : int, M : int, MUL_C : int, lambda : int, epr : int) -> int =
  tile_reg_idx(j * M + i, MUL_C, lambda, epr)

private function valid_ime_reg_group(r : vregidx, group_size : int) -> bool = {
  if group_size <= 0 then false
  else {
    rem_round_zero(unsigned(vregidx_bits(r)), group_size) == 0 &
    unsigned(vregidx_bits(r)) + group_size <= 32
  }
}

private val ime_read_single_element : forall 'sew, is_sew_bitsize('sew) . (int('sew), int, vregidx) -> bits('sew)
function ime_read_single_element(EEW, index, vrid) = {
  assert(EEW <= vlen);
  static_assert(vlen % EEW == 0);

  assert(index >= 0);
  let elem_per_reg = vlen / EEW;
  let index : nat = index;
  let reg_in_group = index / elem_per_reg;
  assert(reg_in_group < 32);

  let vrid = vrid + reg_in_group;
  let index = index % elem_per_reg;
  let offset = index * EEW;

  V(vrid)[(offset + EEW - 1) .. offset]
}

private val ime_write_single_element : forall 'sew, is_sew_bitsize('sew) . (int('sew), int, vregidx, bits('sew)) -> unit
function ime_write_single_element(EEW, index, vrid, value) = {
  assert(EEW <= vlen);
  static_assert(vlen % EEW == 0);

  assert(index >= 0);
  let elem_per_reg = vlen / EEW;
  let index : nat = index;
  let reg_in_group = index / elem_per_reg;
  assert(reg_in_group < 32);

  let vrid = vrid + reg_in_group;
  let index = index % elem_per_reg;
  let offset = index * EEW;

  V(vrid) = [V(vrid) with (offset + EEW - 1) .. offset = value]
}

private val ime_read_mem_element : forall 'width, is_mem_width('width) . (int('width), int, vregidx) -> bits(8 * 'width)
function ime_read_mem_element(WIDTH, index, vrid) =
  ime_read_single_element(WIDTH * 8, index, vrid)

private val ime_write_mem_element : forall 'width, is_mem_width('width) . (int('width), int, vregidx, bits(8 * 'width)) -> unit
function ime_write_mem_element(WIDTH, index, vrid, value) =
  ime_write_single_element(WIDTH * 8, index, vrid, value)

private function valid_ime_mul_c(mul_c : int) -> bool =
  mul_c == 1 | mul_c == 2 | mul_c == 4 | mul_c == 8 | mul_c == 16

private function ime_overlaps_v0(r : vregidx) -> bool =
  unsigned(vregidx_bits(r)) == 0

private function ime_effective_lambda(lambda_bits : bits(3)) -> option(int) =
  match decode_vlambda(lambda_bits) {
    Some(lam) => Some(lam),
    None()    => decode_vlambda(vtype[vlambda]),
  }

private function ime_geometry(widening : int, n_uses_lambda : bool) -> option(IMEGeometry) = {
  if not(valid_vtype()) | not(assert_vstart(0)) |
     not(widening == 1 | widening == 2 | widening == 4)
  then return None();

  let LMUL_pow = get_lmul_pow();
  if LMUL_pow < 0
  then return None();

  let c_eew : sew_bitsize = get_sew();
  if rem_round_zero(c_eew, widening) != 0
  then return None();

  let input_eew : int = quot_round_zero(c_eew, widening);
  if input_eew <= 0
  then return None();

  let lambda : int =
    match decode_vlambda(vtype[vlambda]) {
      Some(lam) => lam,
      None()    => return None()
    };

  let lmul : int = 2 ^ LMUL_pow;
  let input_epr : int = quot_round_zero(vlen, input_eew);
  let c_epr : int = quot_round_zero(vlen, c_eew);
  let input_group_elems : int = lmul * input_epr;
  let active_vl : int = unsigned(vl);
  let k_eff : int = lambda * widening * lmul;

  if k_eff <= 0
  then return None();

  if active_vl > input_group_elems | rem_round_zero(input_group_elems, k_eff) != 0
  then return None();

  let m : int = quot_round_zero(input_group_elems, k_eff);
  if lambda <= 0
  then return None();

  if rem_round_zero(m, lambda) != 0
  then return None();

  let mul_c : int = quot_round_zero(m, lambda);
  if not(valid_ime_mul_c(mul_c))
  then return None();

  let n_divisor : int = if n_uses_lambda then lambda else k_eff;
  if n_divisor <= 0
  then return None();

  if rem_round_zero(active_vl, n_divisor) != 0
  then return None();

  let n : int = quot_round_zero(active_vl, n_divisor);
  if n > m
  then return None();

  Some(struct {
    widening,
    lambda,
    lmul,
    input_eew,
    c_eew,
    input_epr,
    c_epr,
    k_eff,
    m,
    n,
    mul_c,
  })
}

private function ime_scale_layout(geom : IMEGeometry, widening : int) -> option(IMEMicroscale) = {
  if geom.c_eew * geom.lambda < 16
  then return None();

  let block_size : int = if vtype[bs] == 0b1 then 16 else 32;
  if vtype[bs] == 0b1 & widening * geom.lmul > geom.c_eew
  then return None();

  let scale_count : int =
    if block_size == 16
    then quot_round_zero(geom.k_eff + 15, 16)
    else quot_round_zero(geom.k_eff + 31, 32);
  let scale_stride : int = quot_round_zero(geom.lambda * geom.c_eew, 16);

  Some(struct { block_size, scale_count, scale_stride })
}

private function ime_finish_success() -> ExecutionResult = {
  set_vstart(zeros());
  RETIRE_SUCCESS
}

private function read_ime_int(EEW : int, index : int, vrid : vregidx, is_signed : bool) -> option(int) = {
  if index < 0 then None()
  else {
    match EEW {
      8  => {
        let elem : bits(8) = ime_read_single_element(8, index, vrid);
        Some(if is_signed then signed(elem) else unsigned(elem))
      },
      16 => {
        let elem : bits(16) = ime_read_single_element(16, index, vrid);
        Some(if is_signed then signed(elem) else unsigned(elem))
      },
      32 => {
        let elem : bits(32) = ime_read_single_element(32, index, vrid);
        Some(if is_signed then signed(elem) else unsigned(elem))
      },
      64 => {
        let elem : bits(64) = ime_read_single_element(64, index, vrid);
        Some(if is_signed then signed(elem) else unsigned(elem))
      },
      _  => None()
    }
  }
}

private function ime_write_int(EEW : int, index : int, vrid : vregidx, value : int) -> bool = {
  match EEW {
    8  => { ime_write_single_element(8, index, vrid, to_bits_unsafe(8, value)); true },
    16 => { ime_write_single_element(16, index, vrid, to_bits_unsafe(16, value)); true },
    32 => { ime_write_single_element(32, index, vrid, to_bits_unsafe(32, value)); true },
    64 => { ime_write_single_element(64, index, vrid, to_bits_unsafe(64, value)); true },
    _  => false
  }
}

private function ime_bf16_to_f32(v : bits(16)) -> (bits_fflags, bits(32)) = {
  let sign : bits(1) = v[15 .. 15];
  let exp : bits(8) = v[14 .. 7];
  let mant : bits(7) = v[6 .. 0];
  let is_nan = exp == ones() & mant != zeros();
  let is_inf = exp == ones() & mant == zeros();

  let fflags = if is_nan & signed(mant) >= 0 then nvFlag() else zeros();
  let value =
    if is_nan then canonical_NaN_S()
    else if is_inf then fmake_S(sign, ones(), zeros())
    else fmake_S(sign, exp, mant @ zeros(16));

  (fflags, value)
}

private function ime_bf16_to_f32_set_flags(v : bits(16)) -> bits(32) = {
  let (fflags, value) = ime_bf16_to_f32(v);
  accrue_fflags(fflags);
  value
}

private val ime_default_scale : forall 'm, 'm in {16, 32, 64}. int('m) -> bits('m)
function ime_default_scale(EEW) =
  match EEW {
    16 => 0x3c00,
    32 => 0x3f800000,
    64 => 0x3ff0000000000000,
  }

private val ime_canonical_nan : forall 'm, 'm in {16, 32, 64}. int('m) -> bits('m)
function ime_canonical_nan(EEW) =
  match EEW {
    16 => canonical_NaN_H(),
    32 => canonical_NaN_S(),
    64 => canonical_NaN_D(),
  }

private val ime_scale_to_fp : forall 'm, 'm in {16, 32, 64}. (int('m), bits(8)) -> bits('m)
function ime_scale_to_fp(EEW, scale) = {
  let exp : int = unsigned(scale);
  match EEW {
    16 => if scale == 0xff then ime_canonical_nan(16)
          else if exp > 142 then 0x7c00
          else if exp >= 113 then 0b0 @ to_bits_unsafe(5, exp - 112) @ zeros(10)
          else if exp >= 103 then 0b0 @ zeros(5) @ to_bits_unsafe(10, 2 ^ (exp - 103))
          else zeros(),
    32 => if scale == 0xff then ime_canonical_nan(32)
          else if exp == 0 then 0b0 @ zeros(8) @ to_bits_unsafe(23, 2 ^ 22)
          else 0b0 @ scale @ zeros(23),
    64 => if scale == 0xff then ime_canonical_nan(64)
          else 0b0 @ to_bits_unsafe(11, exp + 896) @ zeros(52),
  }
}

private val ime_read_fp_acc : forall 'm, 'm in {16, 32, 64}. (int('m), int, vregidx) -> bits('m)
function ime_read_fp_acc(EEW, index, vrid) =
  match EEW {
    16 => ime_read_single_element(16, index, vrid),
    32 => ime_read_single_element(32, index, vrid),
    64 => ime_read_single_element(64, index, vrid),
  }

private val ime_write_fp_acc : forall 'm, 'm in {16, 32, 64}. (int, vregidx, bits('m)) -> unit
function ime_write_fp_acc(index, vrid, value) =
  match 'm {
    16 => ime_write_single_element(16, index, vrid, value),
    32 => ime_write_single_element(32, index, vrid, value),
    64 => ime_write_single_element(64, index, vrid, value),
  }

private val ime_read_input_as_fp : forall 'm, 'm in {16, 32, 64}. (int('m), int, bits(1), int, vregidx, bits(3)) -> option(bits('m))
function ime_read_input_as_fp(EEW, input_eew, altfmt_flag, index, vrid, rm_3b) = {
  if index < 0 then None()
  else match EEW {
    16 =>
      if input_eew == 16 & altfmt_flag == 0b0
      then Some(ime_read_single_element(16, index, vrid))
      else None(),
    32 => match (input_eew, altfmt_flag) {
      (16, 0b0) => {
        let elem16 : bits(16) = ime_read_single_element(16, index, vrid);
        let (fflags, elem32) : (bits_fflags, bits(32)) = riscv_f16ToF32(rm_3b, elem16);
        accrue_fflags(fflags);
        Some(elem32)
      },
      (16, 0b1) => Some(ime_bf16_to_f32_set_flags(ime_read_single_element(16, index, vrid))),
      (32, 0b0) => Some(ime_read_single_element(32, index, vrid)),
      _         => None()
    },
    64 => match (input_eew, altfmt_flag) {
      (16, 0b0) => {
        let elem16 : bits(16) = ime_read_single_element(16, index, vrid);
        let (fflags, elem64) : (bits_fflags, bits(64)) = riscv_f16ToF64(rm_3b, elem16);
        accrue_fflags(fflags);
        Some(elem64)
      },
      (16, 0b1) => {
        let elem32 : bits(32) = ime_bf16_to_f32_set_flags(ime_read_single_element(16, index, vrid));
        let (fflags, elem64) : (bits_fflags, bits(64)) = riscv_f32ToF64(rm_3b, elem32);
        accrue_fflags(fflags);
        Some(elem64)
      },
      (32, 0b0) => {
        let elem32 : bits(32) = ime_read_single_element(32, index, vrid);
        let (fflags, elem64) : (bits_fflags, bits(64)) = riscv_f32ToF64(rm_3b, elem32);
        accrue_fflags(fflags);
        Some(elem64)
      },
      (64, 0b0) => Some(ime_read_single_element(64, index, vrid)),
      _         => None()
    }
  }
}

private val ime_int_to_fp : forall 'm, 'm in {16, 32, 64}. (int('m), int, bits(3)) -> bits('m)
function ime_int_to_fp(EEW, value, rm_3b) = {
  let value64 : bits(64) = to_bits_unsafe(64, value);
  let (fflags, result_val) : (bits_fflags, bits('m)) = match EEW {
    16 => riscv_i64ToF16(rm_3b, value64),
    32 => riscv_i64ToF32(rm_3b, value64),
    64 => riscv_i64ToF64(rm_3b, value64),
  };
  accrue_fflags(fflags);
  result_val
}

private val ime_block_scale : forall 'm, 'm in {16, 32, 64}. (int('m), int, int, int, IMEMicroscale, bool, bits(3)) -> option(bits('m))
function ime_block_scale(EEW, i, j, block, mx, microscaling, rm_3b) = {
  if not(microscaling) then Some(ime_default_scale(EEW))
  else {
    let scale_idx_A : int = i * mx.scale_stride + block;
    let scale_idx_B : int = j * mx.scale_stride + block;
    if scale_idx_A < 0 | scale_idx_B < 0
    then None()
    else {
      let pair_A : bits(16) = ime_read_single_element(16, scale_idx_A, zvreg);
      let pair_B : bits(16) = ime_read_single_element(16, scale_idx_B, zvreg);
      let scale_A : bits('m) = ime_scale_to_fp(EEW, pair_A[7 .. 0]);
      let scale_B : bits('m) = ime_scale_to_fp(EEW, pair_B[15 .. 8]);
      Some(fp_mul(rm_3b, scale_A, scale_B))
    }
  }
}

private val ime_fp_block_sum : forall 'm, 'm in {16, 32, 64}. (int('m), int, int, int, int, IMEGeometry, vregidx, vregidx, bits(3)) -> option(bits('m))
function ime_fp_block_sum(EEW, i, j, k_lo, k_hi, geom, vs1, vs2, rm_3b) = {
  var blk_acc : bits('m) = zeros();

  foreach (k from k_lo to k_hi) {
    let a_flat : int = mat_A_idx(i, k, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
    let b_flat : int = mat_B_idx(k, j, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
    let a_val : bits('m) =
      match ime_read_input_as_fp(EEW, geom.input_eew, vtype[altfmt_A], a_flat, vs1, rm_3b) {
        Some(v) => v,
        None()  => return None()
      };
    let b_val : bits('m) =
      match ime_read_input_as_fp(EEW, geom.input_eew, vtype[altfmt_B], b_flat, vs2, rm_3b) {
        Some(v) => v,
        None()  => return None()
      };
    let prod : bits('m) = fp_mul(rm_3b, a_val, b_val);
    blk_acc = fp_add(rm_3b, blk_acc, prod)
  };

  Some(blk_acc)
}

private function ime_integer_block_sum(i : int, j : int, k_lo : int, k_hi : int, geom : IMEGeometry, vs1 : vregidx, vs2 : vregidx) -> option(int) = {
  var int_sum : int = 0;

  foreach (k from k_lo to k_hi) {
    let a_flat : int = mat_A_idx(i, k, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
    let b_flat : int = mat_B_idx(k, j, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
    let a_val : int =
      match read_ime_int(geom.input_eew, a_flat, vs1, true) {
        Some(v) => v,
        None()  => return None()
      };
    let b_val : int =
      match read_ime_int(geom.input_eew, b_flat, vs2, true) {
        Some(v) => v,
        None()  => return None()
      };
    int_sum = int_sum + a_val * b_val
  };

  Some(int_sum)
}

private function execute_ime_integer_macc(vd : vregidx, vs1 : vregidx, vs2 : vregidx, widening : int) -> ExecutionResult = {
  let geom : IMEGeometry =
    match ime_geometry(widening, widening != 1) {
      Some(g) => g,
      None()  => return Illegal_Instruction()
    };

  if not(geom.input_eew == 8 | geom.input_eew == 16 | geom.input_eew == 32 | geom.input_eew == 64) |
     not(valid_ime_reg_group(vs1, geom.lmul)) |
     not(valid_ime_reg_group(vs2, geom.lmul)) |
     not(valid_ime_reg_group(vd, geom.mul_c))
  then return Illegal_Instruction();

  let signed_A : bool = vtype[altfmt_A] == 0b0;
  let signed_B : bool = vtype[altfmt_B] == 0b0;

  foreach (j from 0 to (geom.n - 1)) {
    foreach (i from 0 to (geom.m - 1)) {
      let c_flat : int = mat_C_idx(i, j, geom.m, geom.mul_c, geom.lambda, geom.c_epr);
      if c_flat < 0 then return Illegal_Instruction();
      var acc : int =
        match read_ime_int(geom.c_eew, c_flat, vd, true) {
          Some(v) => v,
          None()  => return Illegal_Instruction()
        };

      foreach (k from 0 to (geom.k_eff - 1)) {
        let a_flat : int = mat_A_idx(i, k, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
        let b_flat : int = mat_B_idx(k, j, geom.k_eff, geom.lmul, geom.lambda, geom.input_epr);
        let a_val : int =
          match read_ime_int(geom.input_eew, a_flat, vs1, signed_A) {
            Some(v) => v,
            None()  => return Illegal_Instruction()
          };
        let b_val : int =
          match read_ime_int(geom.input_eew, b_flat, vs2, signed_B) {
            Some(v) => v,
            None()  => return Illegal_Instruction()
          };
        acc = acc + a_val * b_val
      };

      if not(ime_write_int(geom.c_eew, c_flat, vd, acc))
      then return Illegal_Instruction()
    }
  };

  ime_finish_success()
}

private val execute_ime_scaled_fp_macc_body : forall 'm, 'm in {16, 32, 64}. (int('m), vregidx, vregidx, vregidx, IMEGeometry, IMEMicroscale, bool, bool, bits(3)) -> ExecutionResult
function execute_ime_scaled_fp_macc_body(EEW, vd, vs1, vs2, geom, mx, microscaling, integer_inputs, rm_3b) = {
  foreach (j from 0 to (geom.n - 1)) {
    foreach (i from 0 to (geom.m - 1)) {
      let c_flat : int = mat_C_idx(i, j, geom.m, geom.mul_c, geom.lambda, geom.c_epr);
      if c_flat < 0 then return Illegal_Instruction();
      var acc : bits('m) = ime_read_fp_acc(EEW, c_flat, vd);
      var nan_out : bool = false;

      foreach (block from 0 to (mx.scale_count - 1)) {
        if not(nan_out) then {
          let blk_scale : bits('m) =
            match ime_block_scale(EEW, i, j, block, mx, microscaling, rm_3b) {
              Some(scale) => scale,
              None()      => return Illegal_Instruction()
            };
          nan_out = f_is_NaN(blk_scale);

          if not(nan_out) then {
            let k_lo : int = block * mx.block_size;
            let k_hi : int = min((block + 1) * mx.block_size, geom.k_eff) - 1;
            let blk_acc : bits('m) =
              if integer_inputs then {
                match ime_integer_block_sum(i, j, k_lo, k_hi, geom, vs1, vs2) {
                  Some(sum) => ime_int_to_fp(EEW, sum, rm_3b),
                  None()    => return Illegal_Instruction()
                }
              } else {
                match ime_fp_block_sum(EEW, i, j, k_lo, k_hi, geom, vs1, vs2, rm_3b) {
                  Some(sum) => sum,
                  None()    => return Illegal_Instruction()
                }
              };
            acc = fp_add(rm_3b, acc, fp_mul(rm_3b, blk_scale, blk_acc))
          }
        }
      };

      let result : bits('m) = if nan_out then ime_canonical_nan(EEW) else acc;
      ime_write_fp_acc(c_flat, vd, result)
    }
  };

  ime_finish_success()
}

private function execute_ime_fp_macc(vd : vregidx, vs1 : vregidx, vs2 : vregidx, widening : int, vm : bits(1)) -> ExecutionResult = {
  let rm_3b = fcsr[FRM];
  let SEW = get_sew();

  if illegal_fp_vd_unmasked(SEW, rm_3b) | not(assert_vstart(0))
  then return Illegal_Instruction();

  let geom : IMEGeometry =
    match ime_geometry(widening, false) {
      Some(g) => g,
      None()  => return Illegal_Instruction()
    };

  if vtype[altfmt] == 0b1 |
     not(valid_ime_reg_group(vs1, geom.lmul)) |
     not(valid_ime_reg_group(vs2, geom.lmul)) |
     not(valid_ime_reg_group(vd, geom.mul_c))
  then return Illegal_Instruction();

  let microscaling : bool = vm == 0b0;
  if microscaling & (ime_overlaps_v0(vd) | ime_overlaps_v0(vs1) | ime_overlaps_v0(vs2))
  then return Illegal_Instruction();

  let mx : IMEMicroscale =
    if microscaling then {
      match ime_scale_layout(geom, widening) {
        Some(layout) => layout,
        None()       => return Illegal_Instruction()
      }
    } else struct { block_size = geom.k_eff, scale_count = 1, scale_stride = 0 };

  match geom.c_eew {
    16 => execute_ime_scaled_fp_macc_body(16, vd, vs1, vs2, geom, mx, microscaling, false, rm_3b),
    32 => execute_ime_scaled_fp_macc_body(32, vd, vs1, vs2, geom, mx, microscaling, false, rm_3b),
    64 => execute_ime_scaled_fp_macc_body(64, vd, vs1, vs2, geom, mx, microscaling, false, rm_3b),
    _  => Illegal_Instruction()
  }
}

private function execute_ime_integer_fp_macc(vd : vregidx, vs1 : vregidx, vs2 : vregidx, widening : int) -> ExecutionResult = {
  let rm_3b = fcsr[FRM];
  let SEW = get_sew();

  if illegal_fp_vd_unmasked(SEW, rm_3b) | not(assert_vstart(0))
  then return Illegal_Instruction();

  let geom : IMEGeometry =
    match ime_geometry(widening, false) {
      Some(g) => g,
      None()  => return Illegal_Instruction()
    };

  if vtype[altfmt] == 0b1 | vtype[altfmt_A] == 0b1 | vtype[altfmt_B] == 0b1 |
     not(valid_ime_reg_group(vs1, geom.lmul)) |
     not(valid_ime_reg_group(vs2, geom.lmul)) |
     not(valid_ime_reg_group(vd, geom.mul_c)) |
     ime_overlaps_v0(vd) | ime_overlaps_v0(vs1) | ime_overlaps_v0(vs2)
  then return Illegal_Instruction();

  if widening == 2 & not(geom.c_eew == 16 & geom.input_eew == 8)
  then return Illegal_Instruction();
  if widening == 4 & not(geom.c_eew == 32 & geom.input_eew == 8)
  then return Illegal_Instruction();

  let mx : IMEMicroscale =
    match ime_scale_layout(geom, widening) {
      Some(layout) => layout,
      None()       => return Illegal_Instruction()
    };

  match geom.c_eew {
    16 => execute_ime_scaled_fp_macc_body(16, vd, vs1, vs2, geom, mx, true, true, rm_3b),
    32 => execute_ime_scaled_fp_macc_body(32, vd, vs1, vs2, geom, mx, true, true, rm_3b),
    _  => Illegal_Instruction()
  }
}

private function ime_tile_mem_offset(index : int, linesize : int, LD : int, transposed : bool) -> int = {
  let line_idx : int = if linesize == 0 then 0 else quot_round_zero(index, linesize);
  let elem_idx : int = if linesize == 0 then 0 else rem_round_zero(index, linesize);
  if transposed
  then elem_idx * LD + line_idx
  else line_idx * LD + elem_idx
}

private function ime_mem_width_bytes(EEW : sew_bitsize) -> word_width =
  match EEW {
    8  => 1,
    16 => 2,
    32 => 4,
    64 => 8,
  }

private function ime_tile_setup(vr : vregidx, rs2 : regidx, lambda_bits : bits(3)) -> option(IMETileState) = {
  if not(valid_vtype())
  then return None();

  let LMUL_pow = get_lmul_pow();
  if LMUL_pow < 0
  then return None();

  let eew : sew_bitsize = get_sew();
  let mem_width : word_width = ime_mem_width_bytes(eew);
  let lmul : int = 2 ^ LMUL_pow;
  let elems_per_reg : int = quot_round_zero(vlen, eew);
  let num_elem : int = unsigned(vl);
  let start_element : int = unsigned(vstart);

  if start_element > num_elem | not(valid_ime_reg_group(vr, lmul))
  then return None();

  let eff_lambda : int =
    match ime_effective_lambda(lambda_bits) {
      Some(lam) => lam,
      None()    => return None()
    };

  var LD : int = unsigned(X(rs2));
  let linesize : int = eff_lambda * lmul;

  if LD == 0 then {
    LD = linesize
  };

  Some(struct {
    eew,
    mem_width,
    lmul,
    eff_lambda,
    elems_per_reg,
    num_elem,
    start_element,
    linesize,
    ld = LD,
  })
}

private function execute_ime_tile_load(vd : vregidx, rs1 : regidx, rs2 : regidx, lambda_bits : bits(3), vm : bits(1), transposed : bool) -> ExecutionResult = {
  let state : IMETileState =
    match ime_tile_setup(vd, rs2, lambda_bits) {
      Some(s) => s,
      None()  => return Illegal_Instruction()
    };

  if state.num_elem == 0
  then return ime_finish_success();

  let num_elem = state.num_elem;
  assert(num_elem > 0 & num_elem <= vlen);
  let num_elem_pos : range(1, vlen) = num_elem;
  let vm_val = read_vmask(num_elem_pos, vm, zvreg);

  foreach (i from 0 to (num_elem_pos - 1)) {
    if i >= state.start_element & vm_val[i] == 0b1 then {
      set_vstart(to_bits_unsafe(16, i));
      let flat_idx : int = tile_reg_idx(i, state.lmul, state.eff_lambda, state.elems_per_reg);
      if flat_idx < 0 then return Illegal_Instruction();
      let WIDTH : word_width = state.mem_width;
      let mem_off : int = ime_tile_mem_offset(i, state.linesize, state.ld, transposed);
      let mem_off_bytes : int = mem_off * WIDTH;
      match vmem_read(rs1, to_bits_unsafe(xlen, mem_off_bytes), WIDTH, Load(Data), false, false, false) {
        Ok(elem) => ime_write_mem_element(WIDTH, flat_idx, vd, elem),
        Err(e)   => return e,
      }
    }
  };

  ime_finish_success()
}

private function execute_ime_tile_store(vs3 : vregidx, rs1 : regidx, rs2 : regidx, lambda_bits : bits(3), vm : bits(1), transposed : bool) -> ExecutionResult = {
  let state : IMETileState =
    match ime_tile_setup(vs3, rs2, lambda_bits) {
      Some(s) => s,
      None()  => return Illegal_Instruction()
    };

  if state.num_elem == 0
  then return ime_finish_success();

  let num_elem = state.num_elem;
  assert(num_elem > 0 & num_elem <= vlen);
  let num_elem_pos : range(1, vlen) = num_elem;
  let vm_val = read_vmask(num_elem_pos, vm, zvreg);

  foreach (i from 0 to (num_elem_pos - 1)) {
    if i >= state.start_element & vm_val[i] == 0b1 then {
      set_vstart(to_bits_unsafe(16, i));
      let flat_idx : int = tile_reg_idx(i, state.lmul, state.eff_lambda, state.elems_per_reg);
      if flat_idx < 0 then return Illegal_Instruction();
      let WIDTH : word_width = state.mem_width;
      let mem_off : int = ime_tile_mem_offset(i, state.linesize, state.ld, transposed);
      let mem_off_bytes : int = mem_off * WIDTH;
      let data = ime_read_mem_element(WIDTH, flat_idx, vs3);
      match vmem_write(rs1, to_bits_unsafe(xlen, mem_off_bytes), WIDTH, data, Store(Data), false, false, false) {
        Ok(true)  => (),
        Ok(false) => internal_error(__FILE__, __LINE__, "store got false from vmem_write"),
        Err(e)    => return e,
      }
    }
  };

  ime_finish_success()
}

union clause instruction = IME_VMMACC_VV : (vregidx, vregidx, vregidx)

mapping clause encdec = IME_VMMACC_VV(vs2, vs1, vd)
  <-> 0b111000 @ 0b1 @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b000 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VMMACC_VV(vs2, vs1, vd) =
  execute_ime_integer_macc(vd, vs1, vs2, 1)

union clause instruction = IME_VWMMACC_VV : (vregidx, vregidx, vregidx)

mapping clause encdec = IME_VWMMACC_VV(vs2, vs1, vd)
  <-> 0b111001 @ 0b1 @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b000 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VWMMACC_VV(vs2, vs1, vd) =
  execute_ime_integer_macc(vd, vs1, vs2, 2)

union clause instruction = IME_VQWMMACC_VV : (vregidx, vregidx, vregidx)

mapping clause encdec = IME_VQWMMACC_VV(vs2, vs1, vd)
  <-> 0b111010 @ 0b1 @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b000 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VQWMMACC_VV(vs2, vs1, vd) =
  execute_ime_integer_macc(vd, vs1, vs2, 4)

union clause instruction = IME_VFMMACC_VV : (bits(1), vregidx, vregidx, vregidx)

mapping clause encdec = IME_VFMMACC_VV(vm, vs2, vs1, vd)
  <-> 0b010100 @ vm @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b001 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VFMMACC_VV(vm, vs2, vs1, vd) =
  execute_ime_fp_macc(vd, vs1, vs2, 1, vm)

union clause instruction = IME_VFWMMACC_VV : (bits(1), vregidx, vregidx, vregidx)

mapping clause encdec = IME_VFWMMACC_VV(vm, vs2, vs1, vd)
  <-> 0b010101 @ vm @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b001 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VFWMMACC_VV(vm, vs2, vs1, vd) =
  execute_ime_fp_macc(vd, vs1, vs2, 2, vm)

union clause instruction = IME_VFQWMMACC_VV : (bits(1), vregidx, vregidx, vregidx)

mapping clause encdec = IME_VFQWMMACC_VV(vm, vs2, vs1, vd)
  <-> 0b010110 @ vm @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b001 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VFQWMMACC_VV(vm, vs2, vs1, vd) =
  execute_ime_fp_macc(vd, vs1, vs2, 4, vm)

union clause instruction = IME_VFWIMMACC_VV : (vregidx, vregidx, vregidx)

mapping clause encdec = IME_VFWIMMACC_VV(vs2, vs1, vd)
  <-> 0b111001 @ 0b0 @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b000 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VFWIMMACC_VV(vs2, vs1, vd) =
  execute_ime_integer_fp_macc(vd, vs1, vs2, 2)

union clause instruction = IME_VFQWIMMACC_VV : (vregidx, vregidx, vregidx)

mapping clause encdec = IME_VFQWIMMACC_VV(vs2, vs1, vd)
  <-> 0b111010 @ 0b0 @ encdec_vreg(vs2) @ encdec_vreg(vs1) @ 0b000 @ encdec_vreg(vd) @ 0b1010111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VFQWIMMACC_VV(vs2, vs1, vd) =
  execute_ime_integer_fp_macc(vd, vs1, vs2, 4)

union clause instruction = IME_VMTL_V : (bits(3), bits(1), regidx, regidx, vregidx)

mapping clause encdec = IME_VMTL_V(lambda_bits, vm, rs2, rs1, vd)
  <-> lambda_bits @ 0b1 @ 0b00 @ vm @ encdec_reg(rs2) @ encdec_reg(rs1) @ 0b111 @ encdec_vreg(vd) @ 0b0000111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VMTL_V(lambda_bits, vm, rs2, rs1, vd) =
  execute_ime_tile_load(vd, rs1, rs2, lambda_bits, vm, false)

union clause instruction = IME_VMTS_V : (bits(3), bits(1), regidx, regidx, vregidx)

mapping clause encdec = IME_VMTS_V(lambda_bits, vm, rs2, rs1, vs3)
  <-> lambda_bits @ 0b1 @ 0b00 @ vm @ encdec_reg(rs2) @ encdec_reg(rs1) @ 0b111 @ encdec_vreg(vs3) @ 0b0100111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VMTS_V(lambda_bits, vm, rs2, rs1, vs3) =
  execute_ime_tile_store(vs3, rs1, rs2, lambda_bits, vm, false)

union clause instruction = IME_VMTTL_V : (bits(3), bits(1), regidx, regidx, vregidx)

mapping clause encdec = IME_VMTTL_V(lambda_bits, vm, rs2, rs1, vd)
  <-> lambda_bits @ 0b1 @ 0b01 @ vm @ encdec_reg(rs2) @ encdec_reg(rs1) @ 0b111 @ encdec_vreg(vd) @ 0b0000111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VMTTL_V(lambda_bits, vm, rs2, rs1, vd) =
  execute_ime_tile_load(vd, rs1, rs2, lambda_bits, vm, true)

union clause instruction = IME_VMTTS_V : (bits(3), bits(1), regidx, regidx, vregidx)

mapping clause encdec = IME_VMTTS_V(lambda_bits, vm, rs2, rs1, vs3)
  <-> lambda_bits @ 0b1 @ 0b01 @ vm @ encdec_reg(rs2) @ encdec_reg(rs1) @ 0b111 @ encdec_vreg(vs3) @ 0b0100111
  when currentlyEnabled(Ext_Zve32x)

function clause execute IME_VMTTS_V(lambda_bits, vm, rs2, rs1, vs3) =
  execute_ime_tile_store(vs3, rs1, rs2, lambda_bits, vm, true)
