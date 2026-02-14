import { useCallback } from 'react'
import { useAtom } from 'jotai'

import { useRuntimeEditorActions, useRuntimeEditorSelectors } from '../editor/useRuntimeEditor'
import { useRuntimeSessionState } from '../session/useRuntimeSession'
import { configEditorByPathAtom, configPathAtom } from '../../../state/configAtoms'

export const useRuntimeEditorState = () => {
  const sessionState = useRuntimeSessionState()
  const editorSelectors = useRuntimeEditorSelectors()
  const editorActions = useRuntimeEditorActions()
  const [, setConfigEditorByPath] = useAtom(configEditorByPathAtom)
  const [configPath, setConfigPath] = useAtom(configPathAtom)

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
      if (editorSelectors.runtimeActiveEditorTab === 'config') {
        setConfigEditorByPath({
          path: '/config.json',
          text: next,
        })
        if (configPath !== '/config.json') {
          setConfigPath('/config.json')
        }
        return
      }
      editorActions.setRuntimeEditorField('linkerScriptInput', next)
    },
    [
      configPath,
      editorActions,
      editorSelectors.runtimeActiveEditorTab,
      sessionState.runtimeInputMode,
      setConfigEditorByPath,
      setConfigPath,
    ]
  )

  return {
    ...editorSelectors,
    handleRuntimeEditorMount,
    handleRuntimeEditorChange,
  }
}
