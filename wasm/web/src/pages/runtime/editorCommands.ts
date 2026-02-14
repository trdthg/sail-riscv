export const runtimeEditorTabs = ['program', 'config', 'expanded', 'linker', 'upload-disasm'] as const
export const runtimeEditEditorTabs = ['program', 'config', 'expanded', 'linker'] as const

export const runtimeEditorCommandTypes = {
  openTab: 'open-tab',
  focusLine: 'focus-line',
  setSplitMode: 'set-split-mode',
} as const

export type RuntimeEditorTab = (typeof runtimeEditorTabs)[number]
export type RuntimeEditEditorTab = (typeof runtimeEditEditorTabs)[number]
export type RuntimeActiveEditorTab = RuntimeEditEditorTab | 'upload-disasm'

export type RuntimeEditorCommand =
  | { type: typeof runtimeEditorCommandTypes.openTab; tab: RuntimeEditorTab }
  | { type: typeof runtimeEditorCommandTypes.focusLine; line: number }
  | { type: typeof runtimeEditorCommandTypes.setSplitMode; enabled: boolean }

export type RuntimeEditorCapabilities = {
  focusPrimaryLine: (lineNumber: number) => void
  replacePrimaryContent: (nextValue: string) => void
  setSplitMode: (enabled: boolean) => void
  setSecondaryTab: (tab: RuntimeEditorTab) => void
}

export type DispatchEditorCommand = (command: RuntimeEditorCommand) => void
export type RegisterEditorCapabilities = (
  capabilities: RuntimeEditorCapabilities | null
) => void

const runtimeEditorTabSet = new Set<string>(runtimeEditorTabs)
const runtimeEditEditorTabSet = new Set<string>(runtimeEditEditorTabs)

export function isRuntimeEditorTab(value: unknown): value is RuntimeEditorTab {
  return typeof value === 'string' && runtimeEditorTabSet.has(value)
}

export function isRuntimeEditEditorTab(value: unknown): value is RuntimeEditEditorTab {
  return typeof value === 'string' && runtimeEditEditorTabSet.has(value)
}

export function createOpenTabCommand(tab: RuntimeEditorTab): RuntimeEditorCommand {
  return { type: runtimeEditorCommandTypes.openTab, tab }
}

export function createFocusLineCommand(line: number): RuntimeEditorCommand | null {
  if (!Number.isInteger(line) || line <= 0) {
    return null
  }
  return { type: runtimeEditorCommandTypes.focusLine, line }
}

export function createSetSplitModeCommand(enabled: boolean): RuntimeEditorCommand {
  return { type: runtimeEditorCommandTypes.setSplitMode, enabled: Boolean(enabled) }
}

export function toRuntimeEditorCommand(value: unknown): RuntimeEditorCommand | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const command = value as Record<string, unknown>
  if (command.type === runtimeEditorCommandTypes.openTab) {
    return isRuntimeEditorTab(command.tab)
      ? { type: runtimeEditorCommandTypes.openTab, tab: command.tab }
      : null
  }
  if (command.type === runtimeEditorCommandTypes.focusLine) {
    const line = Number(command.line)
    return Number.isInteger(line) && line > 0
      ? { type: runtimeEditorCommandTypes.focusLine, line }
      : null
  }
  if (command.type === runtimeEditorCommandTypes.setSplitMode) {
    if (typeof command.enabled !== 'boolean') {
      return null
    }
    return { type: runtimeEditorCommandTypes.setSplitMode, enabled: command.enabled }
  }
  return null
}
