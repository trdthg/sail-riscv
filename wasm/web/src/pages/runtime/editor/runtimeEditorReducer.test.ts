import { describe, expect, it } from 'vitest'

import {
  runtimeEditorInitialState,
  runtimeEditorReducer,
} from './runtimeEditorReducer'

describe('runtimeEditorReducer', () => {
  it('updates source buffer through patch', () => {
    const next = runtimeEditorReducer(runtimeEditorInitialState, {
      type: 'runtime-editor/patch',
      payload: {
        asmSourceInput: 'addi x1, x2, 1',
        gasMarchInput: 'rv64gc',
      },
    })
    expect(next.asmSourceInput).toBe('addi x1, x2, 1')
    expect(next.gasMarchInput).toBe('rv64gc')
  })

  it('restores edit defaults on reset', () => {
    const dirty = runtimeEditorReducer(runtimeEditorInitialState, {
      type: 'runtime-editor/patch',
      payload: {
        editEditorTab: 'linker',
        asmSourceInput: 'li a0, 1',
        linkerScriptInput: 'ENTRY(foo)',
        expandedAsmSourceInput: 'expanded',
        expandedSourceLinks: [{ sourceLine: 12, expandedLines: [18, 19] }],
        uploadDisasmInput: 'disasm',
      },
    })
    const reset = runtimeEditorReducer(dirty, {
      type: 'runtime-editor/reset-edit-defaults',
    })
    expect(reset.editEditorTab).toBe('program')
    expect(reset.asmSourceInput).toBe(runtimeEditorInitialState.asmSourceInput)
    expect(reset.linkerScriptInput).toBe(runtimeEditorInitialState.linkerScriptInput)
    expect(reset.expandedAsmSourceInput).toBe('')
    expect(reset.expandedSourceLinks).toEqual([])
    expect(reset.uploadDisasmInput).toBe('')
  })
})
