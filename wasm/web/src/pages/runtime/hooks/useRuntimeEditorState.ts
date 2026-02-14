import { useCallback } from 'react'

import { useRuntimeEditorActions, useRuntimeEditorSelectors } from '../editor/useRuntimeEditor'
import { useRuntimeSessionState } from '../session/useRuntimeSession'

export const useRuntimeEditorState = () => {
  const sessionState = useRuntimeSessionState()
  const editorSelectors = useRuntimeEditorSelectors()
  const editorActions = useRuntimeEditorActions()

  const handleRuntimeEditorMount = useCallback((editor: any, monaco: any) => {
    void editor
    void monaco
  }, [])

  const handleRuntimeEditorChange = useCallback(
    (value: string | undefined, event: { isFlush?: boolean } | undefined) => {
      if (event?.isFlush) {
        return
      }
      const next = value ?? ''
      if (sessionState.runtimeInputMode === 'upload') {
        return
      }
      if (editorSelectors.runtimeActiveEditorTab === 'program') {
        editorActions.setRuntimeEditorField('asmSourceInput', next)
        return
      }
      if (editorSelectors.runtimeActiveEditorTab === 'expanded') {
        return
      }
      editorActions.setRuntimeEditorField('linkerScriptInput', next)
    },
    [editorActions, editorSelectors.runtimeActiveEditorTab, sessionState.runtimeInputMode]
  )

  return {
    ...editorSelectors,
    handleRuntimeEditorMount,
    handleRuntimeEditorChange,
  }
}
