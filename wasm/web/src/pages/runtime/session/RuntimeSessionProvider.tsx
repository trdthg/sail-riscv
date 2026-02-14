import { useMemo, useReducer } from 'react'
import type { PropsWithChildren } from 'react'

import {
  runtimeSessionInitialState,
  runtimeSessionReducer,
  type RuntimeSessionState,
} from './runtimeSessionReducer'
import { RuntimeSessionContext } from './runtimeSessionContext'

type RuntimeSessionProviderProps = PropsWithChildren<{
  initialState?: Partial<RuntimeSessionState>
}>

export function RuntimeSessionProvider({
  children,
  initialState,
}: RuntimeSessionProviderProps) {
  const [state, dispatch] = useReducer(
    runtimeSessionReducer,
    initialState
      ? {
          ...runtimeSessionInitialState,
          ...initialState,
        }
      : runtimeSessionInitialState
  )

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
    }),
    [state]
  )

  return (
    <RuntimeSessionContext.Provider value={contextValue}>
      {children}
    </RuntimeSessionContext.Provider>
  )
}
