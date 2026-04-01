#include "common/encoding.h"
#include "common/ime_macros.h"

  .macro FAIL code
    li a0, \code
    j fail
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

    li t0, MSTATUS_VS
    csrs mstatus, t0

    # vmmacc.vv: sew=32, lambda=2, vl=2
    TEST_VLOAD32 16, m2, 16, vmmacc_c
    TEST_VLOAD32 8, m1, 1, vmmacc_a
    TEST_VLOAD32 8, m1, 2, vmmacc_b
    IME_SET_OP 2, e32, m1, IME_VSEW_E32, IME_VLMUL_M1, IME_L2
    IME_VMMACC_VV 16, 1, 2
    TEST_VSTORE32 16, m2, 16, vmmacc_out

    la t0, vmmacc_out
    CHECK_U32 t0, 0, 23, 11
    CHECK_U32 t0, 4, 49, 12
    CHECK_U32 t0, 32, 75, 13
    CHECK_U32 t0, 36, 101, 14

    # vwmmacc.vv: sew=32, input_eew=16, lambda=2, vl=2
    TEST_VLOAD32 16, m2, 16, vwmmacc_c
    TEST_VLOAD16 16, m1, 1, vwmmacc_a
    TEST_VLOAD16 16, m1, 2, vwmmacc_b
    IME_SET_OP 2, e16, m1, IME_VSEW_E32, IME_VLMUL_M1, IME_L2
    IME_VWMMACC_VV 16, 1, 2
    TEST_VSTORE32 16, m2, 16, vwmmacc_out

    la t0, vwmmacc_out
    CHECK_U32 t0, 0, 130, 21
    CHECK_U32 t0, 4, 270, 22
    CHECK_U32 t0, 32, 410, 23
    CHECK_U32 t0, 36, 550, 24

    # vqwmmacc.vv: sew=64, input_eew=16, lambda=2, vl=2
    TEST_VLOAD64 4, m1, 16, vqwmmacc_c
    TEST_VLOAD16 16, m1, 1, vqwmmacc_a
    TEST_VLOAD16 16, m1, 2, vqwmmacc_b
    IME_SET_OP 2, e16, m1, IME_VSEW_E64, IME_VLMUL_M1, IME_L2
    IME_VQWMMACC_VV 16, 1, 2
    TEST_VSTORE64 4, m1, 16, vqwmmacc_out

    la t0, vqwmmacc_out
    CHECK_U64 t0, 0, 1204, 31
    CHECK_U64 t0, 8, 2492, 32

pass:
    li a0, 0
    mv ra, t6
    ret

fail:
    mv ra, t6
    ret

.section .data
.balign 64
vmmacc_a:
    .word 1, 2, 3, 4, 5, 6, 7, 8
vmmacc_b:
    .word 3, 5, 0, 0, 0, 0, 0, 0
vmmacc_c:
    .word 10, 20, 0, 0, 0, 0, 0, 0, 30, 40, 0, 0, 0, 0, 0, 0

.balign 64
vwmmacc_a:
    .half 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
vwmmacc_b:
    .half 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
vwmmacc_c:
    .word 100, 200, 0, 0, 0, 0, 0, 0, 300, 400, 0, 0, 0, 0, 0, 0

.balign 64
vqwmmacc_a:
    .half 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
vqwmmacc_b:
    .half 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0
vqwmmacc_c:
    .dword 1000, 2000, 0, 0

.section .bss
.balign 64
vmmacc_out:
    .space 64
vwmmacc_out:
    .space 64
vqwmmacc_out:
    .space 32
