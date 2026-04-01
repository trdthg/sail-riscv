#include "common/encoding.h"
#include "common/ime_macros.h"

  .macro FAIL code
    li a0, \code
    j fail
  .endm

  .macro CHECK_U16 base, offset, expected, code
    lhu t3, \offset(\base)
    li t4, \expected
    beq t3, t4, 1f
    FAIL \code
1:
  .endm

  .macro CHECK_U32 base, offset, expected, code
    lwu t3, \offset(\base)
    li t4, \expected
    beq t3, t4, 1f
    FAIL \code
1:
  .endm

  .macro CHECK_U64 base, offset, expected, code
    ld t3, \offset(\base)
    li t4, \expected
    beq t3, t4, 1f
    FAIL \code
1:
  .endm

  .macro IME_SET_OP avl, input_sew, input_lmul, vsew_code, vlmul_code, lambda_code
    li t0, \avl
    vsetvli zero, t0, \input_sew, \input_lmul, ta, ma
    IME_WRITE_VTYPE t1, t2, \vsew_code, \vlmul_code, \lambda_code, 0, 0, 0
  .endm

.global main
main:
    mv t6, ra

    li t0, MSTATUS_VS | MSTATUS_FS
    csrs mstatus, t0
    csrwi fcsr, 0

    # vfmmacc.vv: fp32 inputs and accumulator, lambda=2, vl=2
    TEST_VLOAD32 16, m2, 16, vfmmacc_c
    TEST_VLOAD32 8, m1, 1, vfmmacc_a
    TEST_VLOAD32 8, m1, 2, vfmmacc_b
    IME_SET_OP 2, e32, m1, IME_VSEW_E32, IME_VLMUL_M1, IME_L2
    IME_VFMMACC_VV 16, 1, 2
    TEST_VSTORE32 16, m2, 16, vfmmacc_out

    la t0, vfmmacc_out
    CHECK_U32 t0, 0, 0x41400000, 41
    CHECK_U32 t0, 4, 0x42080000, 42
    CHECK_U32 t0, 32, 0x42600000, 43
    CHECK_U32 t0, 36, 0x429c0000, 44

    # vfwmmacc.vv: fp32 inputs, fp64 accumulator, lambda=2, vl=4
    TEST_VLOAD64 4, m1, 16, vfwmmacc_c
    TEST_VLOAD32 8, m1, 1, vfwmmacc_a
    TEST_VLOAD32 8, m1, 2, vfwmmacc_b
    IME_SET_OP 4, e32, m1, IME_VSEW_E64, IME_VLMUL_M1, IME_L2
    IME_VFWMMACC_VV 16, 1, 2
    TEST_VSTORE64 4, m1, 16, vfwmmacc_out

    la t0, vfwmmacc_out
    CHECK_U64 t0, 0, 0x4044000000000000, 51
    CHECK_U64 t0, 8, 0x4056800000000000, 52

    # vfqwmmacc.vv: fp16 inputs, fp64 accumulator, lambda=2, vl=8
    TEST_VLOAD64 4, m1, 16, vfqwmmacc_c
    TEST_VLOAD16 16, m1, 1, vfqwmmacc_a
    TEST_VLOAD16 16, m1, 2, vfqwmmacc_b
    IME_SET_OP 8, e16, m1, IME_VSEW_E64, IME_VLMUL_M1, IME_L2
    IME_VFQWMMACC_VV 16, 1, 2
    TEST_VSTORE64 4, m1, 16, vfqwmmacc_out

    la t0, vfqwmmacc_out
    CHECK_U64 t0, 0, 0x4073000000000000, 61
    CHECK_U64 t0, 8, 0x4085a00000000000, 62

    # vfwimmacc.vv: int8 inputs, fp16 accumulator, lambda=4, vl=8
    TEST_VLOAD16 16, m1, 16, vfwimmacc_c
    TEST_VLOAD8 32, m1, 1, vfwimmacc_a
    TEST_VLOAD8 32, m1, 2, vfwimmacc_b
    IME_LOAD_SCALE ime_scale_ones, 16
    IME_SET_OP 8, e8, m1, IME_VSEW_E16, IME_VLMUL_M1, IME_L4
    IME_VFWIMMACC_VV 16, 1, 2
    TEST_VSTORE16 16, m1, 16, vfwimmacc_out

    la t0, vfwimmacc_out
    CHECK_U16 t0, 0, 0x50a0, 71
    CHECK_U16 t0, 2, 0x5660, 72
    CHECK_U16 t0, 4, 0x5938, 73
    CHECK_U16 t0, 6, 0x5b40, 74

    # vfqwimmacc.vv: int8 inputs, fp32 accumulator, lambda=2, vl=8
    TEST_VLOAD32 16, m2, 16, vfqwimmacc_c
    TEST_VLOAD8 32, m1, 1, vfqwimmacc_a
    TEST_VLOAD8 32, m1, 2, vfqwimmacc_b
    IME_LOAD_SCALE ime_scale_ones, 16
    IME_SET_OP 8, e8, m1, IME_VSEW_E32, IME_VLMUL_M1, IME_L2
    IME_VFQWIMMACC_VV 16, 1, 2
    TEST_VSTORE32 16, m2, 16, vfqwimmacc_out

    la t0, vfqwimmacc_out
    CHECK_U32 t0, 0, 0x42140000, 81
    CHECK_U32 t0, 4, 0x42cc0000, 82
    CHECK_U32 t0, 32, 0x43270000, 83
    CHECK_U32 t0, 36, 0x43680000, 84

pass:
    li a0, 0
    mv ra, t6
    ret

fail:
    mv ra, t6
    ret

.section .data
.balign 64
vfmmacc_a:
    .word 0x3f800000, 0x40000000, 0x40400000, 0x40800000
    .word 0x40a00000, 0x40c00000, 0x40e00000, 0x41000000
vfmmacc_b:
    .word 0x41200000, 0x3f000000, 0, 0, 0, 0, 0, 0
vfmmacc_c:
    .word 0x3f800000, 0x40000000, 0, 0, 0, 0, 0, 0
    .word 0x40400000, 0x40800000, 0, 0, 0, 0, 0, 0

.balign 64
vfwmmacc_a:
    .word 0x3f800000, 0x40000000, 0x40400000, 0x40800000
    .word 0x40a00000, 0x40c00000, 0x40e00000, 0x41000000
vfwmmacc_b:
    .word 0x3f800000, 0x40000000, 0x40400000, 0x40800000
    .word 0, 0, 0, 0
vfwmmacc_c:
    .dword 0x4024000000000000, 0x4034000000000000, 0, 0

.balign 64
vfqwmmacc_a:
    .half 0x3c00, 0x4000, 0x4200, 0x4400, 0x4500, 0x4600, 0x4700, 0x4800
    .half 0x4880, 0x4900, 0x4980, 0x4a00, 0x4a80, 0x4b00, 0x4b80, 0x4c00
vfqwmmacc_b:
    .half 0x3c00, 0x4000, 0x4200, 0x4400, 0x4500, 0x4600, 0x4700, 0x4800
    .half 0, 0, 0, 0, 0, 0, 0, 0
vfqwmmacc_c:
    .dword 0x4059000000000000, 0x4069000000000000, 0, 0

.balign 64
vfwimmacc_a:
    .byte 1, 2, 3, 4, 5, 6, 7, 8
    .byte 9, 10, 11, 12, 13, 14, 15, 16
    .byte 17, 18, 19, 20, 21, 22, 23, 24
    .byte 25, 26, 27, 28, 29, 30, 31, 32
vfwimmacc_b:
    .byte 1, 1, 1, 1, 1, 1, 1, 1
    .byte 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0
vfwimmacc_c:
    .half 0x3c00, 0x4000, 0x4200, 0x4400
    .half 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0

.balign 64
vfqwimmacc_a:
    .byte 1, 2, 3, 4, 5, 6, 7, 8
    .byte 9, 10, 11, 12, 13, 14, 15, 16
    .byte 17, 18, 19, 20, 21, 22, 23, 24
    .byte 25, 26, 27, 28, 29, 30, 31, 32
vfqwimmacc_b:
    .byte 1, 1, 1, 1, 1, 1, 1, 1
    .byte 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0
vfqwimmacc_c:
    .word 0x3f800000, 0x40000000, 0, 0, 0, 0, 0, 0
    .word 0x40400000, 0x40800000, 0, 0, 0, 0, 0, 0

.balign 64
ime_scale_ones:
    .half 0x7f7f, 0x7f7f, 0x7f7f, 0x7f7f
    .half 0x7f7f, 0x7f7f, 0x7f7f, 0x7f7f
    .half 0x7f7f, 0x7f7f, 0x7f7f, 0x7f7f
    .half 0x7f7f, 0x7f7f, 0x7f7f, 0x7f7f

.section .bss
.balign 64
vfmmacc_out:
    .space 64
vfwmmacc_out:
    .space 32
vfqwmmacc_out:
    .space 32
vfwimmacc_out:
    .space 32
vfqwimmacc_out:
    .space 64
