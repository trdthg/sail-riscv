import { test, expect } from 'vitest';

import {
  runtimeWorkspaceInitialState,
  runtimeWorkspaceReducer,
} from './runtimeWorkspaceState.js';

test('switching upload -> edit keeps program.S content', () => {
  const withCustomProgram = runtimeWorkspaceReducer(runtimeWorkspaceInitialState, {
    type: 'setField',
    field: 'asmSourceInput',
    value: 'addi x1, x2, 1',
  });

  const toUpload = runtimeWorkspaceReducer(withCustomProgram, {
    type: 'patch',
    payload: {
      runtimeInputMode: 'upload',
      editEditorTab: 'program',
      uploadDisasmInput: '',
    },
  });

  const backToEdit = runtimeWorkspaceReducer(toUpload, {
    type: 'patch',
    payload: {
      runtimeInputMode: 'edit',
      editEditorTab: 'program',
      debugState: null,
      debugReady: false,
      changedXRegs: [],
      changedFRegs: [],
      elfRunStatus: 'Edit mode',
    },
  });

  expect(backToEdit.asmSourceInput).toBe('addi x1, x2, 1');
  expect(backToEdit.asmSourceInput).not.toBe('; upload an ELF to generate disassembly');
});

test('resetEditDefaults resets program/linker to defaults', () => {
  const dirty = runtimeWorkspaceReducer(runtimeWorkspaceInitialState, {
    type: 'patch',
    payload: {
      asmSourceInput: 'li a0, 1',
      linkerScriptInput: 'ENTRY(foo)',
      gasMarchInput: 'rv32im',
      gasAbiInput: 'ilp32',
      uploadDisasmInput: 'disasm',
    },
  });

  const reset = runtimeWorkspaceReducer(dirty, { type: 'resetEditDefaults' });
  expect(reset.asmSourceInput).not.toBe('li a0, 1');
  expect(reset.linkerScriptInput).not.toBe('ENTRY(foo)');
  expect(reset.gasMarchInput).toBe('rv64imac');
  expect(reset.gasAbiInput).toBe('lp64');
  expect(reset.uploadDisasmInput).toBe('');
});
