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

  .macro CHECK_ZERO32 base, offset, code
    lwu t3, \offset(\base)
    beqz t3, 1f
    FAIL \code
1:
  .endm

.global main
main:
    mv t6, ra

    li t0, MSTATUS_VS
    csrs mstatus, t0

    # vmtl.v with dynamic lambda from vtype.
    li t0, 4
    vsetvli zero, t0, e32, m1, ta, ma
    IME_SET_VTYPE_BITS t1, t2, IME_L2, 0, 0, 0
    la a0, tile_src
    li a1, 4
    IME_VMTL_V 8, 10, 11, IME_LDYN
    TEST_VSTORE32 4, m1, 8, tile_load_out

    la t0, tile_load_out
    CHECK_U32 t0, 0, 10, 11
    CHECK_U32 t0, 4, 11, 12
    CHECK_U32 t0, 8, 14, 13
    CHECK_U32 t0, 12, 15, 14

    # vmts.v with dynamic lambda from vtype.
    TEST_VLOAD32 4, m1, 8, tile_store_vec
    li t0, 4
    vsetvli zero, t0, e32, m1, ta, ma
    IME_SET_VTYPE_BITS t1, t2, IME_L2, 0, 0, 0
    la a0, tile_store_out
    li a1, 4
    IME_VMTS_V 8, 10, 11, IME_LDYN

    la t0, tile_store_out
    CHECK_U32 t0, 0, 100, 21
    CHECK_U32 t0, 4, 101, 22
    CHECK_ZERO32 t0, 8, 23
    CHECK_ZERO32 t0, 12, 24
    CHECK_U32 t0, 16, 102, 25
    CHECK_U32 t0, 20, 103, 26

    # vmttl.v with explicit lambda override.
    li t0, 4
    vsetvli zero, t0, e32, m1, ta, ma
    IME_SET_VTYPE_BITS t1, t2, IME_L1, 0, 0, 0
    la a0, tile_src
    li a1, 4
    IME_VMTTL_V 8, 10, 11, IME_L2
    TEST_VSTORE32 4, m1, 8, tile_tload_out

    la t0, tile_tload_out
    CHECK_U32 t0, 0, 10, 31
    CHECK_U32 t0, 4, 14, 32
    CHECK_U32 t0, 8, 11, 33
    CHECK_U32 t0, 12, 15, 34

    # vmtts.v with explicit lambda override.
    TEST_VLOAD32 4, m1, 8, tile_store_vec
    li t0, 4
    vsetvli zero, t0, e32, m1, ta, ma
    IME_SET_VTYPE_BITS t1, t2, IME_L1, 0, 0, 0
    la a0, tile_tstore_out
    li a1, 4
    IME_VMTTS_V 8, 10, 11, IME_L2

    la t0, tile_tstore_out
    CHECK_U32 t0, 0, 100, 41
    CHECK_U32 t0, 4, 102, 42
    CHECK_ZERO32 t0, 8, 43
    CHECK_ZERO32 t0, 12, 44
    CHECK_U32 t0, 16, 101, 45
    CHECK_U32 t0, 20, 103, 46

pass:
    li a0, 0
    mv ra, t6
    ret

fail:
    mv ra, t6
    ret

.section .data
.balign 64
tile_src:
    .word 10, 11, 12, 13, 14, 15, 16, 17
tile_store_vec:
    .word 100, 101, 102, 103

.section .bss
.balign 64
tile_load_out:
    .space 16
tile_tload_out:
    .space 16
tile_store_out:
    .space 32
tile_tstore_out:
    .space 32
