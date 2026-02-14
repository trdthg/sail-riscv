export const runtimeInputModes = ['edit', 'upload'] as const
export const runtimeRegisterViews = ['x', 'f'] as const
export const runtimeLogTabs = ['status', 'build', 'program', 'summary', 'trace'] as const

export type RuntimeInputMode = (typeof runtimeInputModes)[number]
export type RuntimeRegisterView = (typeof runtimeRegisterViews)[number]
export type RuntimeLogTab = (typeof runtimeLogTabs)[number]

export type RuntimeChangedRegLens = {
  reg: string
  alias?: string
  prev: string
  next: string
}

export type RuntimeSessionState = {
  uploadElfFile: File | null
  elfRunStatus: string
  debugReady: boolean
  debugBusy: boolean
  debugState: Record<string, unknown> | null
  changedXRegs: boolean[]
  changedFRegs: boolean[]
  changedRegLens: RuntimeChangedRegLens[]
  registerView: RuntimeRegisterView
  stepBatchInput: string
  runtimeLogTab: RuntimeLogTab
  runtimeInputMode: RuntimeInputMode
}

export type RuntimeSessionAction =
  | {
      type: 'runtime-session/set-field'
      field: keyof RuntimeSessionState
      value: RuntimeSessionState[keyof RuntimeSessionState]
    }
  | {
      type: 'runtime-session/patch'
      payload: Partial<RuntimeSessionState>
    }
  | {
      type: 'runtime-session/reset-debug'
    }

export const runtimeSessionInitialState: RuntimeSessionState = {
  uploadElfFile: null,
  elfRunStatus: '',
  debugReady: false,
  debugBusy: false,
  debugState: null,
  changedXRegs: [],
  changedFRegs: [],
  changedRegLens: [],
  registerView: 'x',
  stepBatchInput: '10',
  runtimeLogTab: 'status',
  runtimeInputMode: 'edit',
}

export function runtimeSessionReducer(
  state: RuntimeSessionState,
  action: RuntimeSessionAction
): RuntimeSessionState {
  if (action.type === 'runtime-session/set-field') {
    if (state[action.field] === action.value) {
      return state
    }
    return {
      ...state,
      [action.field]: action.value,
    }
  }
  if (action.type === 'runtime-session/patch') {
    return {
      ...state,
      ...action.payload,
    }
  }
  if (action.type === 'runtime-session/reset-debug') {
    return {
      ...state,
      debugReady: false,
      debugBusy: false,
      debugState: null,
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
      stepBatchInput: '10',
    }
  }
  return state
}
