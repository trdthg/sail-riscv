import type {
  RuntimeActiveEditorTab,
  RuntimeEditEditorTab,
} from '../editorCommands'
import type { RuntimeInputMode } from '../session/runtimeSessionReducer'
import type { RuntimeEditorState } from './runtimeEditorReducer'

type DebugStateLike = {
  sourceLine?: unknown
  sourceFile?: unknown
  expandedSourceLine?: unknown
  expandedSourceOriginLine?: unknown
  lastCommittedExpandedSourceLine?: unknown
  uploadDisasmLine?: unknown
}

function asLine(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null
  }
  return numeric
}

function readDebugState(debugState: unknown): DebugStateLike {
  if (!debugState || typeof debugState !== 'object') {
    return {}
  }
  return debugState as DebugStateLike
}

const basenameLower = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parts = normalized.split(/[\\/]/)
  const last = parts[parts.length - 1] || normalized
  return last.trim().toLowerCase() || null
}

export function selectRuntimeActiveEditorTab(
  runtimeInputMode: RuntimeInputMode,
  editEditorTab: RuntimeEditEditorTab
): RuntimeActiveEditorTab {
  return runtimeInputMode === 'upload' ? 'upload-disasm' : editEditorTab
}

export function selectActiveSourceLine(debugState: unknown): number | null {
  return asLine(readDebugState(debugState).sourceLine)
}

export function selectActiveSourceFile(debugState: unknown): string | null {
  return basenameLower(readDebugState(debugState).sourceFile)
}

export function selectActiveExpandedSourceLine(debugState: unknown): number | null {
  return asLine(readDebugState(debugState).expandedSourceLine)
}

export function selectActiveExpandedSourceOriginLine(debugState: unknown): number | null {
  return asLine(readDebugState(debugState).expandedSourceOriginLine)
}

export function selectActiveLastCommittedExpandedSourceLine(debugState: unknown): number | null {
  return asLine(readDebugState(debugState).lastCommittedExpandedSourceLine)
}

export function selectActiveUploadDisasmLine(debugState: unknown): number | null {
  return asLine(readDebugState(debugState).uploadDisasmLine)
}

export function selectActiveRuntimeEditorLine(args: {
  runtimeInputMode: RuntimeInputMode
  runtimeActiveEditorTab: RuntimeActiveEditorTab
  activeSourceLine: number | null
  activeSourceFile: string | null
  activeExpandedSourceLine: number | null
  activeUploadDisasmLine: number | null
}): number | null {
  if (args.runtimeInputMode === 'upload') {
    return args.activeUploadDisasmLine
  }
  if (args.runtimeActiveEditorTab === 'expanded') {
    return args.activeExpandedSourceLine
  }
  if (args.runtimeActiveEditorTab === 'program') {
    if (args.activeSourceFile && args.activeSourceFile !== 'program.s') {
      return null
    }
    return args.activeSourceLine
  }
  return null
}

export function selectRuntimeEditorValue(args: {
  runtimeInputMode: RuntimeInputMode
  runtimeActiveEditorTab: RuntimeActiveEditorTab
  configEditorValue: string
  state: RuntimeEditorState
}): string {
  if (args.runtimeInputMode === 'upload') {
    return args.state.uploadDisasmInput || '; upload an ELF to generate disassembly'
  }
  if (args.runtimeActiveEditorTab === 'program') {
    return args.state.asmSourceInput
  }
  if (args.runtimeActiveEditorTab === 'expanded') {
    return args.state.expandedAsmSourceInput
  }
  if (args.runtimeActiveEditorTab === 'config') {
    return args.configEditorValue
  }
  return args.state.linkerScriptInput
}

export function selectRuntimeEditorLanguage(args: {
  runtimeInputMode: RuntimeInputMode
  runtimeActiveEditorTab: RuntimeActiveEditorTab
}): 'asm' | 'plaintext' {
  if (args.runtimeInputMode === 'upload') {
    return 'asm'
  }
  return args.runtimeActiveEditorTab === 'linker' || args.runtimeActiveEditorTab === 'config'
    ? 'plaintext'
    : 'asm'
}

export function selectRuntimeEditorReadOnly(args: {
  runtimeInputMode: RuntimeInputMode
  runtimeActiveEditorTab: RuntimeActiveEditorTab
}): boolean {
  return args.runtimeInputMode === 'upload' || args.runtimeActiveEditorTab === 'expanded'
}
