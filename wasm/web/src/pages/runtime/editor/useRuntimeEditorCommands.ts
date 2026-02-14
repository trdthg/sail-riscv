import { useContext } from 'react'

import { RuntimeEditorCommandsContext } from './runtimeEditorCommandsContext'

export function useRuntimeEditorCommands() {
  const context = useContext(RuntimeEditorCommandsContext)
  if (!context) {
    throw new Error(
      'useRuntimeEditorCommands must be used within RuntimeEditorCommandsProvider'
    )
  }
  return context
}
