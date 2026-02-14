import type { RuntimeSessionAction, RuntimeSessionState } from './runtimeSessionReducer'

export function setRuntimeSessionField<K extends keyof RuntimeSessionState>(
  field: K,
  value: RuntimeSessionState[K]
): RuntimeSessionAction {
  return {
    type: 'runtime-session/set-field',
    field,
    value,
  }
}

export function patchRuntimeSession(
  payload: Partial<RuntimeSessionState>
): RuntimeSessionAction {
  return {
    type: 'runtime-session/patch',
    payload,
  }
}

export function resetRuntimeSessionDebug(): RuntimeSessionAction {
  return {
    type: 'runtime-session/reset-debug',
  }
}
