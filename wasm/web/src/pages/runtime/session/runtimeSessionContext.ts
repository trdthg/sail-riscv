import { createContext } from 'react'
import type { Dispatch } from 'react'

import type {
  RuntimeSessionAction,
  RuntimeSessionState,
} from './runtimeSessionReducer'

export type RuntimeSessionContextValue = {
  state: RuntimeSessionState
  dispatch: Dispatch<RuntimeSessionAction>
}

export const RuntimeSessionContext = createContext<RuntimeSessionContextValue | null>(null)
