import { useCallback, useReducer } from 'react';

export const DEFAULT_DEBUG_ASM_SOURCE = `.section .bss.mmio.htif
.balign 8
.global tohost
tohost:
  .zero 8
.balign 8
.global fromhost
fromhost:
  .zero 8

.macro htif_putc value
  li a0, \\value
  sw a0, 0(t0)
  li a0, 0x01010000
  sw a0, 4(t0)
.endm

.section .text
.global _start
_start:
  la t0, tohost
  htif_putc 'H'
  htif_putc 'e'
  htif_putc 'l'
  htif_putc 'l'
  htif_putc 'o'
  htif_putc ','
  htif_putc ' '
  htif_putc 'S'
  htif_putc 'a'
  htif_putc 'i'
  htif_putc 'l'
  htif_putc '!'
  htif_putc 10

  li a0, 0
  slli a0, a0, 1
  ori a0, a0, 1
1:
  sw a0, 0(t0)
  sw zero, 4(t0)
  j 1b
`;

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
`;

export const runtimeWorkspaceInitialState = {
  uploadElfFile: null,
  elfRunStatus: '',
  debugReady: false,
  debugBusy: false,
  debugState: null,
  changedXRegs: [],
  changedFRegs: [],
  registerView: 'x',
  stepBatchInput: '10',
  runtimeLogTab: 'status',
  runtimeInputMode: 'edit',
  editEditorTab: 'program',
  asmSourceInput: DEFAULT_DEBUG_ASM_SOURCE,
  expandedAsmSourceInput: '',
  uploadDisasmInput: '',
  linkerScriptInput: DEFAULT_DEBUG_LINKER_SCRIPT,
  gasMarchInput: 'rv64imac',
  gasAbiInput: 'lp64',
};

export const runtimeWorkspaceReducer = (state, action) => {
  switch (action.type) {
    case 'setField':
      if (state[action.field] === action.value) {
        return state;
      }
      return {
        ...state,
        [action.field]: action.value,
      };
    case 'patch':
      return {
        ...state,
        ...action.payload,
      };
    case 'resetEditDefaults':
      return {
        ...state,
        asmSourceInput: DEFAULT_DEBUG_ASM_SOURCE,
        linkerScriptInput: DEFAULT_DEBUG_LINKER_SCRIPT,
        gasMarchInput: 'rv64imac',
        gasAbiInput: 'lp64',
        editEditorTab: 'program',
        uploadElfFile: null,
        uploadDisasmInput: '',
      };
    default:
      return state;
  }
};

export const useRuntimeWorkspaceState = () => {
  const [state, dispatch] = useReducer(runtimeWorkspaceReducer, runtimeWorkspaceInitialState);

  const setRuntimeField = useCallback((field, value) => {
    dispatch({ type: 'setField', field, value });
  }, []);

  const patchRuntimeState = useCallback((payload) => {
    dispatch({ type: 'patch', payload });
  }, []);

  const resetEditDefaults = useCallback(() => {
    dispatch({ type: 'resetEditDefaults' });
  }, []);

  return {
    state,
    setRuntimeField,
    patchRuntimeState,
    resetEditDefaults,
  };
};
