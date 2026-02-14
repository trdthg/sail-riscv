import { describe, expect, it } from 'vitest'

import {
  createFocusLineCommand,
  createOpenTabCommand,
  createSetSplitModeCommand,
  isRuntimeEditEditorTab,
  isRuntimeEditorTab,
  runtimeEditorCommandTypes,
  toRuntimeEditorCommand,
} from './editorCommands'

describe('runtime editor commands', () => {
  it('accepts known tabs', () => {
    expect(isRuntimeEditorTab('program')).toBe(true)
    expect(isRuntimeEditorTab('config')).toBe(true)
    expect(isRuntimeEditorTab('upload-disasm')).toBe(true)
    expect(isRuntimeEditorTab('unknown')).toBe(false)
    expect(isRuntimeEditEditorTab('program')).toBe(true)
    expect(isRuntimeEditEditorTab('config')).toBe(true)
    expect(isRuntimeEditEditorTab('upload-disasm')).toBe(false)
  })

  it('creates and parses open-tab command', () => {
    const command = createOpenTabCommand('expanded')
    expect(command).toEqual({
      type: runtimeEditorCommandTypes.openTab,
      tab: 'expanded',
    })
    expect(toRuntimeEditorCommand(command)).toEqual(command)
  })

  it('creates and validates focus-line command', () => {
    expect(createFocusLineCommand(12)).toEqual({
      type: runtimeEditorCommandTypes.focusLine,
      line: 12,
    })
    expect(createFocusLineCommand(0)).toBeNull()
    expect(toRuntimeEditorCommand({ type: runtimeEditorCommandTypes.focusLine, line: 7 })).toEqual({
      type: runtimeEditorCommandTypes.focusLine,
      line: 7,
    })
    expect(toRuntimeEditorCommand({ type: runtimeEditorCommandTypes.focusLine, line: -1 })).toBeNull()
  })

  it('creates and parses split-mode command', () => {
    const command = createSetSplitModeCommand(true)
    expect(command).toEqual({
      type: runtimeEditorCommandTypes.setSplitMode,
      enabled: true,
    })
    expect(toRuntimeEditorCommand(command)).toEqual(command)
    expect(toRuntimeEditorCommand({ type: runtimeEditorCommandTypes.setSplitMode, enabled: 'true' })).toBeNull()
  })

  it('rejects malformed commands', () => {
    expect(toRuntimeEditorCommand(null)).toBeNull()
    expect(toRuntimeEditorCommand({})).toBeNull()
    expect(toRuntimeEditorCommand({ type: runtimeEditorCommandTypes.openTab, tab: 'invalid' })).toBeNull()
  })
})
