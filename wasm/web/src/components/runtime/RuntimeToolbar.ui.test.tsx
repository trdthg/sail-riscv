import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RuntimeToolbar } from './RuntimeToolbar.jsx'
import { RuntimeEditorProvider } from '../../pages/runtime/editor/RuntimeEditorProvider'
import {
  useRuntimeEditorActions,
  useRuntimeEditorSelectors,
} from '../../pages/runtime/editor/useRuntimeEditor'
import { RuntimeEditorCommandsProvider } from '../../pages/runtime/editor/RuntimeEditorCommandsProvider'
import { RuntimeSessionProvider } from '../../pages/runtime/session/RuntimeSessionProvider'

function ToolbarHarness() {
  return (
    <RuntimeSessionProvider>
      <RuntimeEditorProvider>
        <RuntimeEditorCommandsProvider>
          <ToolbarHarnessInner />
        </RuntimeEditorCommandsProvider>
      </RuntimeEditorProvider>
    </RuntimeSessionProvider>
  )
}

function ToolbarHarnessInner() {
  const { setRuntimeEditorField } = useRuntimeEditorActions()
  const selectors = useRuntimeEditorSelectors()

  return (
    <div>
      <button
        type="button"
        onClick={() => setRuntimeEditorField('asmSourceInput', 'addi x1, x2, 1')}
      >
        Seed Program
      </button>
      <RuntimeToolbar
        isDark={false}
        setConfigTemplatePath={() => {}}
        resetConfigFromTemplatePath={async () => true}
        configsState={{
          state: 'hasData',
          data: [{ path: '/config/rv64d_v128_e64.json', label: 'rv64d default' }],
        }}
        resolveConfigText={async () => '{}'}
        callDebugWorker={async () => ({})}
        forceStopDebugWorker={() => {}}
        setOutput={() => {}}
      />
      <pre data-testid="editor-value">{selectors.runtimeEditorValue}</pre>
    </div>
  )
}

describe('RuntimeToolbar mode switch', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps program.S content after Upload -> Edit without selecting file', async () => {
    const user = userEvent.setup()
    render(<ToolbarHarness />)

    await user.click(screen.getByRole('button', { name: 'Seed Program' }))
    expect(screen.getByTestId('editor-value').textContent).toContain('addi x1, x2, 1')

    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByTestId('editor-value').textContent).toContain('; upload an ELF to generate disassembly')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('editor-value').textContent).toContain('addi x1, x2, 1')
  })
})
