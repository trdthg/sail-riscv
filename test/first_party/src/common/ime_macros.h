#ifndef SAIL_RISCV_TEST_FIRST_PARTY_IME_MACROS_H
#define SAIL_RISCV_TEST_FIRST_PARTY_IME_MACROS_H

#if __riscv_xlen == 64
#define IME_VTYPE_LAMBDA_MASK  0x7000000000000000
#define IME_VTYPE_LAMBDA_SHIFT 60
#elif __riscv_xlen == 32
#define IME_VTYPE_LAMBDA_MASK  0x70000000
#define IME_VTYPE_LAMBDA_SHIFT 28
#else
#error Unsupported XLEN for IME first-party test macros
#endif

#define IME_VTYPE_LOW_MASK     0xE00
#define IME_VTYPE_EXTRA_MASK   (IME_VTYPE_LAMBDA_MASK | IME_VTYPE_LOW_MASK)
#define IME_VTYPE_STD_MASK     0x3F
#define IME_VTYPE_CONFIG_MASK  (IME_VTYPE_EXTRA_MASK | IME_VTYPE_STD_MASK)
#define IME_VTYPE_STD_FIELDS(vsew_code, vlmul_code) \
  ((((vsew_code) & 0x7) << 3) | ((vlmul_code) & 0x7))
#define IME_VTYPE_EXTRA_FIELDS(lambda_code, altfmt_a, altfmt_b, bs) \
  ((((lambda_code) & 0x7) << IME_VTYPE_LAMBDA_SHIFT) | (((altfmt_a) & 0x1) << 9) | (((altfmt_b) & 0x1) << 10) | (((bs) & 0x1) << 11))
#define IME_VTYPE_CONFIG_FIELDS(vsew_code, vlmul_code, lambda_code, altfmt_a, altfmt_b, bs) \
  (IME_VTYPE_STD_FIELDS(vsew_code, vlmul_code) | IME_VTYPE_EXTRA_FIELDS(lambda_code, altfmt_a, altfmt_b, bs))

  .equ IME_LDYN, 0
  .equ IME_L1,   1
  .equ IME_L2,   2
  .equ IME_L4,   3
  .equ IME_L8,   4
  .equ IME_L16,  5
  .equ IME_L32,  6
  .equ IME_L64,  7

  .equ IME_VSEW_E8,   0
  .equ IME_VSEW_E16,  1
  .equ IME_VSEW_E32,  2
  .equ IME_VSEW_E64,  3

  .equ IME_VLMUL_M1,  0
  .equ IME_VLMUL_M2,  1
  .equ IME_VLMUL_M4,  2
  .equ IME_VLMUL_M8,  3

  .macro IME_ENCODE_OPV funct6, funct3, vd, vs1, vs2, vm=1
    .word ((((\funct6) & 0x3f) << 26) | (((\vm) & 0x1) << 25) | (((\vs2) & 0x1f) << 20) | (((\vs1) & 0x1f) << 15) | (((\funct3) & 0x7) << 12) | (((\vd) & 0x1f) << 7) | 0x57)
  .endm

  .macro IME_VMMACC_VV vd, vs1, vs2
    IME_ENCODE_OPV 0x38, 0x0, \vd, \vs1, \vs2, 1
  .endm

  .macro IME_VWMMACC_VV vd, vs1, vs2, vm=1
    IME_ENCODE_OPV 0x39, 0x0, \vd, \vs1, \vs2, \vm
  .endm

  .macro IME_VQWMMACC_VV vd, vs1, vs2, vm=1
    IME_ENCODE_OPV 0x3a, 0x0, \vd, \vs1, \vs2, \vm
  .endm

  .macro IME_VFMMACC_VV vd, vs1, vs2, vm=1
    IME_ENCODE_OPV 0x14, 0x1, \vd, \vs1, \vs2, \vm
  .endm

  .macro IME_VFWMMACC_VV vd, vs1, vs2, vm=1
    IME_ENCODE_OPV 0x15, 0x1, \vd, \vs1, \vs2, \vm
  .endm

  .macro IME_VFQWMMACC_VV vd, vs1, vs2, vm=1
    IME_ENCODE_OPV 0x16, 0x1, \vd, \vs1, \vs2, \vm
  .endm

  .macro IME_VFWIMMACC_VV vd, vs1, vs2
    IME_ENCODE_OPV 0x39, 0x0, \vd, \vs1, \vs2, 0
  .endm

  .macro IME_VFQWIMMACC_VV vd, vs1, vs2
    IME_ENCODE_OPV 0x3a, 0x0, \vd, \vs1, \vs2, 0
  .endm

  .macro IME_ENCODE_TILE opcode, vd_or_vs3, rs1, rs2, lambda_code=IME_LDYN, vm=1, transpose=0
    .word ((((\lambda_code) & 0x7) << 29) | (1 << 28) | (((\transpose) & 0x3) << 26) | (((\vm) & 0x1) << 25) | (((\rs2) & 0x1f) << 20) | (((\rs1) & 0x1f) << 15) | (0x7 << 12) | (((\vd_or_vs3) & 0x1f) << 7) | ((\opcode) & 0x7f))
  .endm

  .macro IME_VMTL_V vd, rs1, rs2, lambda_code=IME_LDYN, vm=1
    IME_ENCODE_TILE 0x07, \vd, \rs1, \rs2, \lambda_code, \vm, 0
  .endm

  .macro IME_VMTS_V vs3, rs1, rs2, lambda_code=IME_LDYN, vm=1
    IME_ENCODE_TILE 0x27, \vs3, \rs1, \rs2, \lambda_code, \vm, 0
  .endm

  .macro IME_VMTTL_V vd, rs1, rs2, lambda_code=IME_LDYN, vm=1
    IME_ENCODE_TILE 0x07, \vd, \rs1, \rs2, \lambda_code, \vm, 1
  .endm

  .macro IME_VMTTS_V vs3, rs1, rs2, lambda_code=IME_LDYN, vm=1
    IME_ENCODE_TILE 0x27, \vs3, \rs1, \rs2, \lambda_code, \vm, 1
  .endm

  .macro IME_WRITE_VTYPE value_reg, tmp_reg, vsew_code, vlmul_code, lambda_code=IME_LDYN, altfmt_a=0, altfmt_b=0, bs=0
    csrr \value_reg, vtype
    li \tmp_reg, ~IME_VTYPE_CONFIG_MASK
    and \value_reg, \value_reg, \tmp_reg
    li \tmp_reg, IME_VTYPE_CONFIG_FIELDS(\vsew_code, \vlmul_code, \lambda_code, \altfmt_a, \altfmt_b, \bs)
    or \value_reg, \value_reg, \tmp_reg
    csrw vtype, \value_reg
  .endm

  .macro IME_SET_VTYPE_BITS value_reg, tmp_reg, lambda_code=IME_LDYN, altfmt_a=0, altfmt_b=0, bs=0
    csrr \value_reg, vtype
    li \tmp_reg, ~IME_VTYPE_EXTRA_MASK
    and \value_reg, \value_reg, \tmp_reg
    li \tmp_reg, IME_VTYPE_EXTRA_FIELDS(\lambda_code, \altfmt_a, \altfmt_b, \bs)
    or \value_reg, \value_reg, \tmp_reg
    csrw vtype, \value_reg
  .endm

  .macro IME_LOAD_SCALE src, count
    li t0, \count
    vsetvli zero, t0, e16, m1, ta, ma
    la t1, \src
    vle16.v v0, (t1)
  .endm

  .macro TEST_VLOAD8 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e8, \lmul, ta, ma
    la t1, \label
    vle8.v v\reg, (t1)
  .endm

  .macro TEST_VLOAD16 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e16, \lmul, ta, ma
    la t1, \label
    vle16.v v\reg, (t1)
  .endm

  .macro TEST_VLOAD32 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e32, \lmul, ta, ma
    la t1, \label
    vle32.v v\reg, (t1)
  .endm

  .macro TEST_VLOAD64 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e64, \lmul, ta, ma
    la t1, \label
    vle64.v v\reg, (t1)
  .endm

  .macro TEST_VSTORE8 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e8, \lmul, ta, ma
    la t1, \label
    vse8.v v\reg, (t1)
  .endm

  .macro TEST_VSTORE16 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e16, \lmul, ta, ma
    la t1, \label
    vse16.v v\reg, (t1)
  .endm

  .macro TEST_VSTORE32 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e32, \lmul, ta, ma
    la t1, \label
    vse32.v v\reg, (t1)
  .endm

  .macro TEST_VSTORE64 avl, lmul, reg, label
    li t0, \avl
    vsetvli zero, t0, e64, \lmul, ta, ma
    la t1, \label
    vse64.v v\reg, (t1)
  .endm

#endif
