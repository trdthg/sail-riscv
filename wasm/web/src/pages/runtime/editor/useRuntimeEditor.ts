import { useContext, useMemo } from 'react'
import { useAtom } from 'jotai'

import {
  isRuntimeEditEditorTab,
  type RuntimeActiveEditorTab,
} from '../editorCommands'
import { useRuntimeSessionState } from '../session/useRuntimeSession'
import {
  selectActiveExpandedSourceOriginLine,
  selectActiveExpandedSourceLine,
  selectActiveSourceFile,
  selectActiveLastCommittedExpandedSourceLine,
  selectActiveRuntimeEditorLine,
  selectActiveSourceLine,
  selectActiveUploadDisasmLine,
  selectRuntimeActiveEditorTab,
  selectRuntimeEditorLanguage,
  selectRuntimeEditorReadOnly,
  selectRuntimeEditorValue,
} from './runtimeEditorSelectors'
import { RuntimeEditorContext } from './runtimeEditorContext'
import type { RuntimeEditorState } from './runtimeEditorReducer'
import { configEditorAtom } from '../../../state/configAtoms'

function useRuntimeEditorContext() {
  const context = useContext(RuntimeEditorContext)
  if (!context) {
    throw new Error('RuntimeEditor hooks must be used within RuntimeEditorProvider')
  }
  return context
}

export function useRuntimeEditorState() {
  return useRuntimeEditorContext().state
}

export function useRuntimeEditorActions() {
  const { dispatch } = useRuntimeEditorContext()
  return useMemo(
    () => ({
      setRuntimeEditorField<K extends keyof RuntimeEditorState>(
        field: K,
        value: RuntimeEditorState[K]
      ) {
        dispatch({
          type: 'runtime-editor/set-field',
          field,
          value,
        })
      },
      patchRuntimeEditor(payload: Partial<RuntimeEditorState>) {
        dispatch({
          type: 'runtime-editor/patch',
          payload,
        })
      },
      resetRuntimeEditorDefaults() {
        dispatch({
          type: 'runtime-editor/reset-edit-defaults',
        })
      },
      setRuntimeEditorTab(tab: string) {
        if (!isRuntimeEditEditorTab(tab)) {
          return
        }
        dispatch({
          type: 'runtime-editor/set-field',
          field: 'editEditorTab',
          value: tab,
        })
      },
    }),
    [dispatch]
  )
}

export function useRuntimeEditorSelectors() {
  const editorState = useRuntimeEditorState()
  const sessionState = useRuntimeSessionState()
  const [configEditor] = useAtom(configEditorAtom)
  return useMemo(() => {
    const runtimeActiveEditorTab = selectRuntimeActiveEditorTab(
      sessionState.runtimeInputMode,
      editorState.editEditorTab
    )
    const activeSourceLine = selectActiveSourceLine(sessionState.debugState)
    const activeSourceFile = selectActiveSourceFile(sessionState.debugState)
    const activeExpandedSourceLine = selectActiveExpandedSourceLine(sessionState.debugState)
    const activeExpandedSourceOriginLine = selectActiveExpandedSourceOriginLine(
      sessionState.debugState
    )
    const activeLastCommittedExpandedSourceLine = selectActiveLastCommittedExpandedSourceLine(
      sessionState.debugState
    )
    const activeUploadDisasmLine = selectActiveUploadDisasmLine(sessionState.debugState)
    const activeRuntimeEditorLine = selectActiveRuntimeEditorLine({
      runtimeInputMode: sessionState.runtimeInputMode,
      runtimeActiveEditorTab,
      activeSourceLine,
      activeSourceFile,
      activeExpandedSourceLine,
      activeUploadDisasmLine,
    })
    const runtimeEditorValue = selectRuntimeEditorValue({
      runtimeInputMode: sessionState.runtimeInputMode,
      runtimeActiveEditorTab,
      configEditorValue: configEditor,
      state: editorState,
    })
    const runtimeEditorLanguage = selectRuntimeEditorLanguage({
      runtimeInputMode: sessionState.runtimeInputMode,
      runtimeActiveEditorTab,
    })
    const runtimeEditorReadOnly = selectRuntimeEditorReadOnly({
      runtimeInputMode: sessionState.runtimeInputMode,
      runtimeActiveEditorTab,
    })
    return {
      runtimeActiveEditorTab: runtimeActiveEditorTab as RuntimeActiveEditorTab,
      activeSourceFile,
      activeSourceLine,
      activeExpandedSourceLine,
      activeExpandedSourceOriginLine,
      activeLastCommittedExpandedSourceLine,
      activeUploadDisasmLine,
      activeRuntimeEditorLine,
      runtimeEditorValue,
      runtimeEditorLanguage,
      runtimeEditorReadOnly,
    }
  }, [configEditor, editorState, sessionState.debugState, sessionState.runtimeInputMode])
}
