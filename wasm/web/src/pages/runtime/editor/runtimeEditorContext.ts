import { createContext } from 'react'
import type { Dispatch } from 'react'

import type { RuntimeEditorAction, RuntimeEditorState } from './runtimeEditorReducer'

export type RuntimeEditorContextValue = {
  state: RuntimeEditorState
  dispatch: Dispatch<RuntimeEditorAction>
}

export const RuntimeEditorContext = createContext<RuntimeEditorContextValue | null>(null)
