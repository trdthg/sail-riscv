// =======================================================================================
// This Sail RISC-V architecture model, comprising all files and
// directories except where otherwise noted is subject the BSD
// two-clause license in the LICENSE file.
//
// SPDX-License-Identifier: BSD-2-Clause
// =======================================================================================

/*
 * Zvame utility functions: datatype decoding, element position mapping,
 * and element-level read/write for M and Acc registers.
 *
 * Covers all element types defined in Zvame-0.1:
 *   Integer:  Int4..Int128, Uint4..Uint128 (signed/unsigned)
 *   Saturated integer: Int4_Sat..Int128_Sat, Uint4_Sat..Uint128_Sat
 *   Float:    FP16, BF16, FP32, FP64, OCP_E4M3, OCP_E5M2
 *   Storage-only: any dtype where size < ame_unit_dtype_size
 */

/* AME square matrix is nlen × nlen elements (nelem = nlen² total).
   ame_nlen is a compile-time constant, so we can use it as a Sail vector size. */
type ame_row    = vector(ame_nlen, dec, bits(ame_max_dtype_size))
type ame_matrix = vector(ame_nlen, dec, ame_row)

// =========================================================================
// Datatype decoding helpers
//
// AME 32-bit dtype encoding (from spec sections 4.1 and 4.2):
//   bits[7:0]   : element size in bits
//   bit[8]      : 0 = integer, 1 = floating point
//   bit[29]     : signed (integer types)
//   bit[30]     : saturating (integer types)
//   others      : type-specific (exp_width, rounding_mode, inf, denorm for FP)
// =========================================================================

/* Extract the element size in bits from the dtype register.
   Returns 0 if the dtype is uninitialized or invalid. */
function ame_dtype_size(dtype : bits(32)) -> nat = {
  let s = unsigned(dtype[7 .. 0]);
  if s > 128 then 0 else s
}

/* Check if the dtype is a storage-only type.
   Storage-only: element size < ame_unit_dtype_size. */
function ame_is_storage_only(dtype : bits(32)) -> bool = {
  ame_dtype_size(dtype) < ame_unit_dtype_size
}

/* Check if the dtype is an integer type (bit[8] == 0). */
function ame_is_integer(dtype : bits(32)) -> bool =
  dtype[8] == 0b0

/* Check if the dtype is a floating-point type (bit[8] == 1). */
function ame_is_float(dtype : bits(32)) -> bool =
  dtype[8] == 0b1

/* Check if an integer dtype is signed (bit[30] == 1). */
function ame_is_signed(dtype : bits(32)) -> bool =
  dtype[30] == 0b1

/* Check if an integer dtype uses saturation arithmetic (bit[29] == 1). */
function ame_is_saturating(dtype : bits(32)) -> bool =
  dtype[29] == 0b1

// =========================================================================
// Register group layout computation
// =========================================================================

/* Number of M registers needed for a square of the given element size. */
function ame_nregs(element_size : nat) -> nat = {
  if element_size <= ame_unit_dtype_size then 1
  else element_size / ame_unit_dtype_size
}

/* Packing factor for storage-only types. */
function ame_pack_factor(element_size : nat) -> nat = {
  if element_size == 0 then 1
  else ame_unit_dtype_size / element_size
}

/* Total number of elements accessible through a register group. */
function ame_total_elements(dtype : bits(32)) -> nat = {
  let size = ame_dtype_size(dtype);
  if size == 0 then 0
  else if ame_is_storage_only(dtype) then
    ame_pack_factor(size) * ame_nelem
  else
    ame_nelem
}

/* Number of elements that fit in a single M register for the given dtype.
   Used by instruction preambles for loop bounds and alignment checks. */
function ame_elements_per_reg(dtype : bits(32)) -> nat = {
  let size = ame_dtype_size(dtype);
  mlen / max(1, size)
}

// =========================================================================
// Element position mapping
// =========================================================================

function ame_element_position(element_index : nat, dtype : bits(32))
  -> (nat /* reg_in_group */, nat /* bit_low */) = {
  let size = ame_dtype_size(dtype);
  if ame_is_storage_only(dtype) then {
    (0, element_index * size)
  } else {
    let bit_offset = element_index * size;
    (bit_offset / mlen, bit_offset % mlen)
  }
}

// =========================================================================
// Helpers: register index arithmetic for M register groups
// =========================================================================

function ameregidx_bits(Ameregidx(b) : ameregidx) -> bits(5) = b
function ameregidx_nat(i : ameregidx) -> nat = unsigned(ameregidx_bits(i))
function nat_to_ameregidx(n : nat) -> ameregidx = Ameregidx(to_bits(5, n % 32))
function ameregidx_add(i : ameregidx, offset : nat) -> ameregidx =
  nat_to_ameregidx(ameregidx_nat(i) + offset)

// =========================================================================
// M register element read/write
// =========================================================================

function read_m_elem(dtype : bits(32), element_index : nat,
                     base_reg : ameregidx) -> bits(ame_max_dtype_size) = {
  static_assert(ame_max_dtype_size >= 128);
  let size = ame_dtype_size(dtype);
  let (reg_in_grp, bit_low) = ame_element_position(element_index, dtype);
  let nregs = ame_nregs(size);

  assert(size > 0, "read_m_elem: dtype uninitialized");
  assert(ameregidx_nat(base_reg) % max(1, nregs) == 0,
    "read_m_elem: base register not aligned");

  let reg_idx = ameregidx_add(base_reg, reg_in_grp);
  let reg_data = M(reg_idx);

  assert(bit_low + size <= mlen, "element extends beyond register bounds");

  match size {
     4  => { let v : bits( 4) = reg_data[(bit_low +  3) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
     8  => { let v : bits( 8) = reg_data[(bit_low +  7) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    16  => { let v : bits(16) = reg_data[(bit_low + 15) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    32  => { let v : bits(32) = reg_data[(bit_low + 31) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    64  => { let v : bits(64) = reg_data[(bit_low + 63) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    128 => { let v : bits(128) = reg_data[(bit_low + 127) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

function write_m_elem(dtype : bits(32), element_index : nat,
                      base_reg : ameregidx,
                      value : bits(ame_max_dtype_size)) -> unit = {
  let size = ame_dtype_size(dtype);
  let (reg_in_grp, bit_low) = ame_element_position(element_index, dtype);
  let nregs = ame_nregs(size);

  assert(size > 0, "write_m_elem: dtype uninitialized");
  assert(ameregidx_nat(base_reg) % max(1, nregs) == 0,
    "write_m_elem: base register not aligned");

  let reg_idx = ameregidx_add(base_reg, reg_in_grp);

  assert(bit_low + size <= mlen, "element extends beyond register bounds");

  match size {
     4  => M(reg_idx) = [M(reg_idx) with (bit_low +  3) .. bit_low = value[ 3 .. 0]],
     8  => M(reg_idx) = [M(reg_idx) with (bit_low +  7) .. bit_low = value[ 7 .. 0]],
    16  => M(reg_idx) = [M(reg_idx) with (bit_low + 15) .. bit_low = value[15 .. 0]],
    32  => M(reg_idx) = [M(reg_idx) with (bit_low + 31) .. bit_low = value[31 .. 0]],
    64  => M(reg_idx) = [M(reg_idx) with (bit_low + 63) .. bit_low = value[63 .. 0]],
    128 => M(reg_idx) = [M(reg_idx) with (bit_low + 127) .. bit_low = value[127 .. 0]],
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

// =========================================================================
// Acc register element read/write
// =========================================================================

function read_acc_elem(dtype : bits(32), element_index : nat,
                       acc_reg : ameaccregidx) -> bits(ame_max_dtype_size) = {
  static_assert(ame_max_dtype_size >= 128);
  let size = ame_dtype_size(dtype);
  let total = ame_total_elements(dtype);
  let (_, bit_low) = ame_element_position(element_index, dtype);

  assert(size > 0, "read_acc_elem: dtype uninitialized");
  assert(element_index < total, "read_acc_elem: element index out of bounds");

  let acc_data = ACC(acc_reg);

  assert(bit_low + size <= acclen, "element extends beyond acc register bounds");

  match size {
     4  => zero_extend(ame_max_dtype_size, acc_data[(bit_low +  3) .. bit_low]),
     8  => zero_extend(ame_max_dtype_size, acc_data[(bit_low +  7) .. bit_low]),
    16  => zero_extend(ame_max_dtype_size, acc_data[(bit_low + 15) .. bit_low]),
    32  => zero_extend(ame_max_dtype_size, acc_data[(bit_low + 31) .. bit_low]),
    64  => zero_extend(ame_max_dtype_size, acc_data[(bit_low + 63) .. bit_low]),
    128 => zero_extend(ame_max_dtype_size, acc_data[(bit_low + 127) .. bit_low]),
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

function write_acc_elem(dtype : bits(32), element_index : nat,
                        acc_reg : ameaccregidx,
                        value : bits(ame_max_dtype_size)) -> unit = {
  let size = ame_dtype_size(dtype);
  let (_, bit_low) = ame_element_position(element_index, dtype);

  assert(size > 0, "write_acc_elem: dtype uninitialized");

  assert(bit_low + size <= acclen, "element extends beyond acc register bounds");

  match size {
     4  => ACC(acc_reg) = [ACC(acc_reg) with (bit_low +  3) .. bit_low = value[ 3 .. 0]],
     8  => ACC(acc_reg) = [ACC(acc_reg) with (bit_low +  7) .. bit_low = value[ 7 .. 0]],
    16  => ACC(acc_reg) = [ACC(acc_reg) with (bit_low + 15) .. bit_low = value[15 .. 0]],
    32  => ACC(acc_reg) = [ACC(acc_reg) with (bit_low + 31) .. bit_low = value[31 .. 0]],
    64  => ACC(acc_reg) = [ACC(acc_reg) with (bit_low + 63) .. bit_low = value[63 .. 0]],
    128 => ACC(acc_reg) = [ACC(acc_reg) with (bit_low + 127) .. bit_low = value[127 .. 0]],
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

// =========================================================================
// Row-major square access
// =========================================================================

function read_m_square_rm(dtype : bits(32), base_reg : ameregidx) -> bits(acclen) = {
  let size = ame_dtype_size(dtype);
  let nregs = ame_nregs(size);
  let max_regs = acclen / mlen;

  assert(size > 0, "read_m_square_rm: dtype uninitialized");
  assert(ameregidx_nat(base_reg) % max(1, nregs) == 0,
    "read_m_square_rm: base register not aligned");

  var result : bits(acclen) = zeros();
  foreach (r from 0 to (max_regs - 1)) {
    if r < nregs then {
      let offset = r * mlen;
      result = [result with (offset + mlen - 1) .. offset = M(ameregidx_add(base_reg, r))];
    };
  };
  result
}

function write_m_square_rm(dtype : bits(32), base_reg : ameregidx,
                           rm_data : bits(acclen)) -> unit = {
  let size = ame_dtype_size(dtype);
  let nregs = ame_nregs(size);
  let max_regs = acclen / mlen;

  assert(size > 0, "write_m_square_rm: dtype uninitialized");
  assert(ameregidx_nat(base_reg) % max(1, nregs) == 0,
    "write_m_square_rm: base register not aligned");

  foreach (r from 0 to (max_regs - 1)) {
    if r < nregs then {
      let offset = r * mlen;
      M(ameregidx_add(base_reg, r)) = rm_data[(offset + mlen - 1) .. offset];
    };
  };
}

// =========================================================================
// Row-major element extraction / insertion
//
// These operate on bits(acclen) bit-vectors (i.e. the result of
// read_m_square_rm or the input to write_m_square_rm) rather than on
// the register file directly.  This enables the efficient instruction
// pattern: read square → loop over elements in bit-vector → write square,
// minimising individual register read-modify-write operations.
// =========================================================================

/* Extract a single element from a row-major square bit-vector.
   In row-major layout element e of size s occupies bits [(e+1)*s-1 : e*s].
   Returns the element zero-extended to bits(ame_max_dtype_size). */
function extract_elem_rm(rm_data : bits(acclen), element_size : nat,
                         elem_idx : nat) -> bits(ame_max_dtype_size) = {
  static_assert(ame_max_dtype_size >= 128);
  let bit_low = elem_idx * element_size;
  assert(bit_low + element_size <= acclen, "element extends beyond square bounds");
  match element_size {
     4  => { let v : bits( 4) = rm_data[(bit_low +  3) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
     8  => { let v : bits( 8) = rm_data[(bit_low +  7) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    16  => { let v : bits(16) = rm_data[(bit_low + 15) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    32  => { let v : bits(32) = rm_data[(bit_low + 31) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    64  => { let v : bits(64) = rm_data[(bit_low + 63) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    128 => { let v : bits(128) = rm_data[(bit_low + 127) .. bit_low]; zero_extend(ame_max_dtype_size, v) },
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

/* Insert a single element into a row-major square bit-vector.
   Only the low element_size bits of value are written; the function
   returns the updated bit-vector (pure functional update). */
function insert_elem_rm(rm_data : bits(acclen), element_size : nat,
                        elem_idx : nat,
                        value : bits(ame_max_dtype_size)) -> bits(acclen) = {
  let bit_low = elem_idx * element_size;
  assert(bit_low + element_size <= acclen, "element extends beyond square bounds");
  match element_size {
     4  => [rm_data with (bit_low +  3) .. bit_low = value[ 3 .. 0]],
     8  => [rm_data with (bit_low +  7) .. bit_low = value[ 7 .. 0]],
    16  => [rm_data with (bit_low + 15) .. bit_low = value[15 .. 0]],
    32  => [rm_data with (bit_low + 31) .. bit_low = value[31 .. 0]],
    64  => [rm_data with (bit_low + 63) .. bit_low = value[63 .. 0]],
    128 => [rm_data with (bit_low + 127) .. bit_low = value[127 .. 0]],
    _   => internal_error(__FILE__, __LINE__, "unsupported element size")
  }
}

// =========================================================================
// Row-major row extraction / insertion (bit-vector level)
//
// These operate on bits(acclen) square data and extract/insert entire
// rows as vectors.  For instruction loops over rows (reductions, prefix,
// load/store), read the square once then call extract_row_rm for each row
// — avoids per-row register reads.
// =========================================================================

/* Extract row row_idx from a row-major square bit-vector.
   The row contains ame_nlen consecutive elements. */
function extract_row_rm(rm_data : bits(acclen), element_size : nat,
                        row_idx : nat) -> ame_row = {
  var row : ame_row = vector_init(zeros());
  foreach (col from 0 to (ame_nlen - 1)) {
    row[col] = extract_elem_rm(rm_data, element_size, row_idx * ame_nlen + col);
  };
  row
}

/* Insert a row into a row-major square bit-vector.
   Returns the updated bit-vector. */
function insert_row_rm(rm_data : bits(acclen), element_size : nat,
                       row_idx : nat, row : ame_row) -> bits(acclen) = {
  var result = rm_data;
  foreach (col from 0 to (ame_nlen - 1)) {
    result = insert_elem_rm(result, element_size, row_idx * ame_nlen + col, row[col]);
  };
  result
}

// =========================================================================
// M register row access (register level)
//
// Convenience wrappers that read/write a single row from/to an M register
// group.  For multi-row operations, prefer read_m_square_rm + extract_row_rm
// in a loop to avoid redundant register reads.
// =========================================================================

/* Read a single row from an M register group. */
function read_m_row_rm(dtype : bits(32), row_idx : nat,
                       base_reg : ameregidx) -> ame_row = {
  let size = ame_dtype_size(dtype);
  assert(size > 0, "read_m_row_rm: dtype uninitialized");
  let sq = read_m_square_rm(dtype, base_reg);
  extract_row_rm(sq, size, row_idx)
}

/* Write a single row to an M register group (read-modify-write). */
function write_m_row_rm(dtype : bits(32), row_idx : nat,
                        base_reg : ameregidx, row : ame_row) -> unit = {
  let size = ame_dtype_size(dtype);
  assert(size > 0, "write_m_row_rm: dtype uninitialized");
  var sq = read_m_square_rm(dtype, base_reg);
  sq = insert_row_rm(sq, size, row_idx, row);
  write_m_square_rm(dtype, base_reg, sq);
}

// =========================================================================
// M register matrix access (register level)
//
// Read an entire square from an M register group as an nlen×nlen matrix,
// or write a matrix back.  Storage-only types are rejected.
// =========================================================================

/* Read an nlen×nlen matrix from an M register group in row-major order. */
function read_m_matrix_rm(dtype : bits(32), base_reg : ameregidx) -> ame_matrix = {
  assert(not(ame_is_storage_only(dtype)), "read_m_matrix_rm: storage-only not supported");
  let sq = read_m_square_rm(dtype, base_reg);
  let size = ame_dtype_size(dtype);
  var mat : ame_matrix = vector_init(vector_init(zeros()));
  foreach (i from 0 to (ame_nlen - 1)) {
    mat[i] = extract_row_rm(sq, size, i);
  };
  mat
}

/* Write an nlen×nlen matrix to an M register group in row-major order. */
function write_m_matrix_rm(dtype : bits(32), base_reg : ameregidx,
                           mat : ame_matrix) -> unit = {
  assert(not(ame_is_storage_only(dtype)), "write_m_matrix_rm: storage-only not supported");
  let size = ame_dtype_size(dtype);
  var sq : bits(acclen) = zeros();
  foreach (i from 0 to (ame_nlen - 1)) {
    sq = insert_row_rm(sq, size, i, mat[i]);
  };
  write_m_square_rm(dtype, base_reg, sq);
}

// =========================================================================
// Acc register matrix access (register level)
//
// Acc registers hold a single nlen×nlen square.  These functions operate
// directly on the acclen-wide Acc register data, using the same row-major
// element extraction/insertion primitives.
// =========================================================================

/* Read the entire accumulator as an nlen×nlen matrix. */
function read_acc_matrix(dtype : bits(32), acc_reg : ameaccregidx) -> ame_matrix = {
  assert(not(ame_is_storage_only(dtype)), "read_acc_matrix: storage-only not supported");
  let acc_data = ACC(acc_reg);
  let size = ame_dtype_size(dtype);
  var mat : ame_matrix = vector_init(vector_init(zeros()));
  foreach (i from 0 to (ame_nlen - 1)) {
    mat[i] = extract_row_rm(acc_data, size, i);
  };
  mat
}

/* Write an nlen×nlen matrix to an accumulator register. */
function write_acc_matrix(dtype : bits(32), acc_reg : ameaccregidx,
                          mat : ame_matrix) -> unit = {
  assert(not(ame_is_storage_only(dtype)), "write_acc_matrix: storage-only not supported");
  let size = ame_dtype_size(dtype);
  var acc_data : bits(acclen) = zeros();
  foreach (i from 0 to (ame_nlen - 1)) {
    acc_data = insert_row_rm(acc_data, size, i, mat[i]);
  };
  ACC(acc_reg) = acc_data;
}
