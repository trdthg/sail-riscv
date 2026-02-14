import { useCallback, useMemo, useRef } from 'react'
import type { PropsWithChildren } from 'react'

import {
  runtimeEditorCommandTypes,
  toRuntimeEditorCommand,
  type DispatchEditorCommand,
  type RegisterEditorCapabilities,
  type RuntimeEditorCapabilities,
} from '../editorCommands'
import { isRuntimeEditEditorTab } from '../editorCommands'
import { RuntimeEditorCommandsContext } from './runtimeEditorCommandsContext'
import { useRuntimeEditorActions } from './useRuntimeEditor'

export function RuntimeEditorCommandsProvider({ children }: PropsWithChildren) {
  const capabilitiesRef = useRef<RuntimeEditorCapabilities | null>(null)
  const { setRuntimeEditorTab } = useRuntimeEditorActions()

  const registerEditorCapabilities = useCallback<RegisterEditorCapabilities>((capabilities) => {
    capabilitiesRef.current = capabilities
  }, [])

  const dispatchRuntimeEditorCommand = useCallback<DispatchEditorCommand>((command) => {
    const parsedCommand = toRuntimeEditorCommand(command)
    if (!parsedCommand) {
      return
    }

    if (parsedCommand.type === runtimeEditorCommandTypes.openTab) {
      if (isRuntimeEditEditorTab(parsedCommand.tab)) {
        setRuntimeEditorTab(parsedCommand.tab)
      }
      capabilitiesRef.current?.setSecondaryTab(parsedCommand.tab)
      return
    }
    if (parsedCommand.type === runtimeEditorCommandTypes.focusLine) {
      capabilitiesRef.current?.focusPrimaryLine(parsedCommand.line)
      return
    }
    if (parsedCommand.type === runtimeEditorCommandTypes.setSplitMode) {
      capabilitiesRef.current?.setSplitMode(parsedCommand.enabled)
    }
  }, [setRuntimeEditorTab])

  const contextValue = useMemo(
    () => ({
      dispatchRuntimeEditorCommand,
      registerEditorCapabilities,
    }),
    [dispatchRuntimeEditorCommand, registerEditorCapabilities]
  )

  return (
    <RuntimeEditorCommandsContext.Provider value={contextValue}>
      {children}
    </RuntimeEditorCommandsContext.Provider>
  )
}
