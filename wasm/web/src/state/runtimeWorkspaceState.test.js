import test from 'node:test';
import assert from 'node:assert/strict';

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

  assert.equal(backToEdit.asmSourceInput, 'addi x1, x2, 1');
  assert.notEqual(backToEdit.asmSourceInput, '; upload an ELF to generate disassembly');
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
  assert.notEqual(reset.asmSourceInput, 'li a0, 1');
  assert.notEqual(reset.linkerScriptInput, 'ENTRY(foo)');
  assert.equal(reset.gasMarchInput, 'rv64imac');
  assert.equal(reset.gasAbiInput, 'lp64');
  assert.equal(reset.uploadDisasmInput, '');
});
