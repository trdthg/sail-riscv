import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RuntimeToolbar } from './RuntimeToolbar.jsx';
import { useRuntimeWorkspaceState } from '../../state/runtimeWorkspaceState.js';

function ToolbarHarness({ onUploadElf = () => {} }) {
  const { state, setRuntimeField, patchRuntimeState } = useRuntimeWorkspaceState();
  const runtimeActiveEditorTab = state.runtimeInputMode === 'upload' ? 'upload-disasm' : state.editEditorTab;
  const runtimeEditorValue = state.runtimeInputMode === 'upload'
    ? (state.uploadDisasmInput || '; upload an ELF to generate disassembly')
    : runtimeActiveEditorTab === 'program'
      ? state.asmSourceInput
      : runtimeActiveEditorTab === 'expanded'
        ? state.expandedAsmSourceInput
        : state.linkerScriptInput;

  const setRuntimeInputMode = (value) => setRuntimeField('runtimeInputMode', value);
  const setActiveEditorTab = (tab) => {
    if (['program', 'expanded', 'linker'].includes(tab)) {
      setRuntimeField('editEditorTab', tab);
    }
  };
  const onSwitchToEdit = () => {
    patchRuntimeState({
      runtimeInputMode: 'edit',
      editEditorTab: 'program',
      debugState: null,
      debugReady: false,
      changedXRegs: [],
      changedFRegs: [],
      elfRunStatus: 'Edit mode',
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setRuntimeField('asmSourceInput', 'addi x1, x2, 1')}
      >
        Seed Program
      </button>
      <RuntimeToolbar
        isDark={false}
        configPath="/config.json"
        setConfigPath={() => {}}
        configsState={{
          state: 'hasData',
          data: [{ path: '/config.json', label: 'runtime config' }],
        }}
        runtimeInputMode={state.runtimeInputMode}
        setRuntimeInputMode={setRuntimeInputMode}
        onSwitchToEdit={onSwitchToEdit}
        gasMarchInput={state.gasMarchInput}
        setGasMarchInput={(value) => setRuntimeField('gasMarchInput', value)}
        gasAbiInput={state.gasAbiInput}
        setGasAbiInput={(value) => setRuntimeField('gasAbiInput', value)}
        buildAsmAndInitDebug={() => {}}
        debugBusy={Boolean(state.debugBusy)}
        activeSourceLine={null}
        onUploadElf={onUploadElf}
        elfFile={state.uploadElfFile}
        stepElfDebug={() => {}}
        debugReady={Boolean(state.debugReady)}
        stepBatchInput={state.stepBatchInput}
        setStepBatchInput={(value) => setRuntimeField('stepBatchInput', value)}
        runElfDebug={() => {}}
        onToolbarReset={() => {}}
        asmSourceInput={state.asmSourceInput}
        activeEditorTab={runtimeActiveEditorTab}
        setActiveEditorTab={setActiveEditorTab}
        expandedAsmSourceInput={state.expandedAsmSourceInput}
        activeExpandedSourceLine={null}
        uploadDisasmInput={state.uploadDisasmInput}
      />
      <pre data-testid="editor-value">{runtimeEditorValue}</pre>
    </div>
  );
}

describe('RuntimeToolbar mode switch', () => {
  it('keeps program.S content after Upload -> Edit without selecting file', async () => {
    const user = userEvent.setup();
    const onUploadElf = vi.fn();
    render(<ToolbarHarness onUploadElf={onUploadElf} />);

    await user.click(screen.getByRole('button', { name: 'Seed Program' }));
    expect(screen.getByTestId('editor-value').textContent).toContain('addi x1, x2, 1');

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUploadElf).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-value').textContent).toContain('; upload an ELF to generate disassembly');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('editor-value').textContent).toContain('addi x1, x2, 1');
  });
});
