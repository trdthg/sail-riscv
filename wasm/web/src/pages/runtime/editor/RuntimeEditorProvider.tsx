import { useMemo, useReducer } from 'react'
import type { PropsWithChildren } from 'react'

import {
  runtimeEditorInitialState,
  runtimeEditorReducer,
  type RuntimeEditorState,
} from './runtimeEditorReducer'
import { RuntimeEditorContext } from './runtimeEditorContext'

type RuntimeEditorProviderProps = PropsWithChildren<{
  initialState?: Partial<RuntimeEditorState>
}>

export function RuntimeEditorProvider({
  children,
  initialState,
}: RuntimeEditorProviderProps) {
  const [state, dispatch] = useReducer(
    runtimeEditorReducer,
    initialState
      ? {
          ...runtimeEditorInitialState,
          ...initialState,
        }
      : runtimeEditorInitialState
  )

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
    }),
    [state]
  )

  return (
    <RuntimeEditorContext.Provider value={contextValue}>
      {children}
    </RuntimeEditorContext.Provider>
  )
}
