import type { RuntimeEditEditorTab } from '../editorCommands'

export const DEFAULT_DEBUG_ASM_SOURCE = `.section .rodata
hello_str:
  .asciz "Hello, Sail!\\n"

.section .bss.mmio.htif
.balign 8
.global tohost
tohost: .zero 8
.balign 8
.global fromhost
fromhost: .zero 8

.macro print_reg reg
  la t0, tohost
  sw \\reg, 0(t0)
  li t3, 0x01010000
  sw t3, 4(t0)
.endm

.macro exit reg
  la t0, tohost
exit_loop_\\@:
  sw \\reg, 0(t0)
  sw zero, 4(t0)
  j exit_loop_\\@
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
.global _start
_start:
  .option push
  .option norelax
  la gp, __global_pointer$
  .option pop
  la t1, hello_str
  print_string t1, t2

  li a0, 1
  exit a0
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
