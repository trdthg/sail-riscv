import { useContext, useMemo } from 'react'

import { RuntimeSessionContext } from './runtimeSessionContext'
import {
  patchRuntimeSession,
  resetRuntimeSessionDebug,
  setRuntimeSessionField,
} from './runtimeSessionActions'
import { selectDebugRegisterRows } from './runtimeSessionSelectors'
import type {
  RuntimeRegisterView,
  RuntimeSessionState,
} from './runtimeSessionReducer'

function useRuntimeSessionContext() {
  const context = useContext(RuntimeSessionContext)
  if (!context) {
    throw new Error('RuntimeSession hooks must be used within RuntimeSessionProvider')
  }
  return context
}

export function useRuntimeSessionState() {
  return useRuntimeSessionContext().state
}

export function useRuntimeSessionActions() {
  const { dispatch } = useRuntimeSessionContext()
  return useMemo(
    () => ({
      setRuntimeSessionField<K extends keyof RuntimeSessionState>(
        field: K,
        value: RuntimeSessionState[K]
      ) {
        dispatch(setRuntimeSessionField(field, value))
      },
      patchRuntimeSession(payload: Partial<RuntimeSessionState>) {
        dispatch(patchRuntimeSession(payload))
      },
      resetRuntimeSessionDebug() {
        dispatch(resetRuntimeSessionDebug())
      },
    }),
    [dispatch]
  )
}

export function useRuntimeSessionSelectors() {
  const state = useRuntimeSessionState()
  return useMemo(
    () => ({
      debugRegisterRows(registerView: RuntimeRegisterView = state.registerView) {
        return selectDebugRegisterRows(state, registerView)
      },
    }),
    [state]
  )
}
