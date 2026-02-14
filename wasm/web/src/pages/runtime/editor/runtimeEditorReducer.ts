import type { RuntimeEditEditorTab } from '../editorCommands'

export const DEFAULT_DEBUG_ASM_SOURCE = `.section .rodata
hello_str:
  .asciz "Hello, Sail!\\n"

.macro print_reg reg
  mv a0, \\reg
  call htif_putc
.endm

.macro htif_putc imm
  li t3, \\imm
  print_reg t3
.endm

.macro print_string ptr_reg tmp_reg
1:
  lbu \\tmp_reg, 0(\\ptr_reg)
  beqz \\tmp_reg, 2f
  addi \\ptr_reg, \\ptr_reg, 1
  print_reg \\tmp_reg
  j 1b
2:
.endm

.section .text
.global main
main:
  la t1, hello_str
  print_string t1, t2
  li a0, 0
  ret
`

export const DEFAULT_DEBUG_CRT0_SOURCE = `.section .text
.global _start
_start:
  j reset_handler

init_pmp:
  csrr s1, mtvec
  la t0, 1f
  csrw mtvec, t0
  li t0, -1
  csrw pmpaddr0, t0
  li t0, 0x1f
  csrw pmpcfg0, t0
  sfence.vma
.balign 64
1:
  csrw mtvec, s1
  csrw mcause, x0
  ret

.p2align 6
.global trap_handler
trap_handler:
  li a0, 1001
  tail htif_exit

.global reset_handler
reset_handler:
  .irp i, 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31
    li x\\i, 0
  .endr

  call init_pmp
  la t0, trap_handler
  csrw mtvec, t0

  la sp, _stack
  .option push
  .option norelax
  la gp, __global_pointer$
  .option pop

  addi sp, sp, -8
  sw zero, 0(sp)
  sw zero, 4(sp)

  call main
  tail htif_exit

.section .bss.mmio.htif
.balign 8
.global tohost
tohost: .zero 8
.balign 8
.global fromhost
fromhost: .zero 8

.section .text
.global htif_exit
htif_exit:
  la t0, tohost
  sll a0, a0, 1
  or a0, a0, 1
1:
  sw a0, 0(t0)
  sw zero, 4(t0)
  j 1b

.global htif_putc
htif_putc:
  la t0, tohost
  sw a0, 0(t0)
  li a0, 0x01010000
  sw a0, 4(t0)
  ret
`

export const DEFAULT_DEBUG_LINKER_SCRIPT = `OUTPUT_ARCH("riscv")
ENTRY(_start)
__STACK_SIZE = 0x2000;

MEMORY {
  if_clint (wa) : org = 0x2000000, len = 768k
  if_htif (wa)  : org = 0x20c0000, len = 512k
  if_ram (wxa)  : org = 0x80000000, len = 512m
}

SECTIONS {
  . = ORIGIN(if_ram);
  .stack ALIGN(16) (NOLOAD) : {
    _stack_end = .;
    . += __STACK_SIZE;
    . = ALIGN(16);
    _stack = .;
  } >if_ram
  __global_pointer$ = .;
  .text : { *(.text) } >if_ram
  .data : { *(.data) } >if_ram
  .rodata : { *(.rodata) } >if_ram
  .bss (NOLOAD) : { *(.bss) } >if_ram
  .sbss : { *(.sbss .sbss.* .gnu.linkonce.sb.*) *(.scommon) } >if_ram
  .tdata : { *(.tdata) } >if_ram
  .tbss : { *(.tbss) } >if_ram
  .bss.mmio.htif : { *(.bss.mmio.htif) } >if_htif
}
`

export type RuntimeEditorState = {
  editEditorTab: RuntimeEditEditorTab
  asmSourceInput: string
  crt0SourceInput: string
  expandedAsmSourceInput: string
  expandedSourceLinks: RuntimeExpandedSourceLink[]
  uploadDisasmInput: string
  linkerScriptInput: string
  gasMarchInput: string
  gasAbiInput: string
}

export type RuntimeExpandedSourceLink = {
  sourceLine: number
  expandedLines: number[]
}

export type RuntimeEditorAction =
  | {
      type: 'runtime-editor/set-field'
      field: keyof RuntimeEditorState
      value: RuntimeEditorState[keyof RuntimeEditorState]
    }
  | {
      type: 'runtime-editor/patch'
      payload: Partial<RuntimeEditorState>
    }
  | {
      type: 'runtime-editor/reset-edit-defaults'
    }

export const runtimeEditorInitialState: RuntimeEditorState = {
  editEditorTab: 'program',
  asmSourceInput: DEFAULT_DEBUG_ASM_SOURCE,
  crt0SourceInput: DEFAULT_DEBUG_CRT0_SOURCE,
  expandedAsmSourceInput: '',
  expandedSourceLinks: [],
  uploadDisasmInput: '',
  linkerScriptInput: DEFAULT_DEBUG_LINKER_SCRIPT,
  gasMarchInput: 'rv64imac',
  gasAbiInput: 'lp64',
}

export function runtimeEditorReducer(
  state: RuntimeEditorState,
  action: RuntimeEditorAction
): RuntimeEditorState {
  if (action.type === 'runtime-editor/set-field') {
    if (state[action.field] === action.value) {
      return state
    }
    return {
      ...state,
      [action.field]: action.value,
    }
  }
  if (action.type === 'runtime-editor/patch') {
    return {
      ...state,
      ...action.payload,
    }
  }
  if (action.type === 'runtime-editor/reset-edit-defaults') {
    return {
      ...state,
      editEditorTab: 'program',
      asmSourceInput: DEFAULT_DEBUG_ASM_SOURCE,
      crt0SourceInput: DEFAULT_DEBUG_CRT0_SOURCE,
      expandedAsmSourceInput: '',
      expandedSourceLinks: [],
      uploadDisasmInput: '',
      linkerScriptInput: DEFAULT_DEBUG_LINKER_SCRIPT,
      gasMarchInput: 'rv64imac',
      gasAbiInput: 'lp64',
    }
  }
  return state
}
