import { createContext } from 'react'

import type {
  DispatchEditorCommand,
  RegisterEditorCapabilities,
} from '../editorCommands'

export type RuntimeEditorCommandsContextValue = {
  dispatchRuntimeEditorCommand: DispatchEditorCommand
  registerEditorCapabilities: RegisterEditorCapabilities
}

export const RuntimeEditorCommandsContext =
  createContext<RuntimeEditorCommandsContextValue | null>(null)
