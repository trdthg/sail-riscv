import { describe, expect, it } from 'vitest'

import {
  selectActiveExpandedSourceOriginLine,
  selectActiveRuntimeEditorLine,
  selectRuntimeActiveEditorTab,
  selectRuntimeEditorLanguage,
  selectRuntimeEditorReadOnly,
  selectRuntimeEditorValue,
} from './runtimeEditorSelectors'
import { runtimeEditorInitialState } from './runtimeEditorReducer'

describe('runtimeEditorSelectors', () => {
  it('derives active tab from mode', () => {
    expect(selectRuntimeActiveEditorTab('edit', 'program')).toBe('program')
    expect(selectRuntimeActiveEditorTab('upload', 'program')).toBe('upload-disasm')
  })

  it('derives runtime editor mode for link.ld and upload disasm', () => {
    expect(
      selectRuntimeEditorLanguage({
        runtimeInputMode: 'edit',
        runtimeActiveEditorTab: 'linker',
      })
    ).toBe('plaintext')
    expect(
      selectRuntimeEditorReadOnly({
        runtimeInputMode: 'upload',
        runtimeActiveEditorTab: 'upload-disasm',
      })
    ).toBe(true)
  })

  it('selects editor value by mode/tab', () => {
    const state = {
      ...runtimeEditorInitialState,
      asmSourceInput: 'addi x1, x2, 1',
      uploadDisasmInput: '0000: addi x1, x2, 1',
      linkerScriptInput: 'ENTRY(_start)',
    }
    expect(
      selectRuntimeEditorValue({
        runtimeInputMode: 'edit',
        runtimeActiveEditorTab: 'program',
        state,
      })
    ).toBe('addi x1, x2, 1')
    expect(
      selectRuntimeEditorValue({
        runtimeInputMode: 'upload',
        runtimeActiveEditorTab: 'upload-disasm',
        state,
      })
    ).toContain('0000: addi x1, x2, 1')
  })

  it('selects active runtime line based on mode/tab', () => {
    expect(
      selectActiveRuntimeEditorLine({
        runtimeInputMode: 'edit',
        runtimeActiveEditorTab: 'program',
        activeSourceLine: 12,
        activeExpandedSourceLine: 41,
        activeUploadDisasmLine: 7,
      })
    ).toBe(12)
    expect(
      selectActiveRuntimeEditorLine({
        runtimeInputMode: 'edit',
        runtimeActiveEditorTab: 'expanded',
        activeSourceLine: 12,
        activeExpandedSourceLine: 41,
        activeUploadDisasmLine: 7,
      })
    ).toBe(41)
    expect(
      selectActiveRuntimeEditorLine({
        runtimeInputMode: 'upload',
        runtimeActiveEditorTab: 'upload-disasm',
        activeSourceLine: 12,
        activeExpandedSourceLine: 41,
        activeUploadDisasmLine: 7,
      })
    ).toBe(7)
    expect(
      selectActiveRuntimeEditorLine({
        runtimeInputMode: 'edit',
        runtimeActiveEditorTab: 'linker',
        activeSourceLine: 12,
        activeExpandedSourceLine: 41,
        activeUploadDisasmLine: 7,
      })
    ).toBeNull()
  })

  it('reads expanded source origin line from debug state', () => {
    expect(selectActiveExpandedSourceOriginLine({ expandedSourceOriginLine: 33 })).toBe(33)
    expect(selectActiveExpandedSourceOriginLine({ expandedSourceOriginLine: 'bad' })).toBeNull()
  })
})
