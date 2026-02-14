import type {
  RuntimeChangedRegLens,
  RuntimeRegisterView,
  RuntimeSessionState,
} from './runtimeSessionReducer'

export type DebugRegisterRow = {
  key: string
  name: string
  alias?: string
  value: string
  changed: boolean
}

export function buildRegisterDiffFlags(
  previous: unknown[] | null | undefined,
  next: unknown[]
): boolean[] {
  if (!Array.isArray(previous)) {
    return new Array(next.length).fill(false)
  }
  return next.map((value, index) => previous[index] !== value)
}

export function buildChangedRegLens(args: {
  previous: unknown[] | null | undefined
  next: unknown[]
  aliases?: unknown[] | null | undefined
  limit?: number
}): RuntimeChangedRegLens[] {
  const previous = Array.isArray(args.previous) ? args.previous : null
  if (!previous) {
    return []
  }
  const aliases = Array.isArray(args.aliases) ? args.aliases : []
  const limit = Number.isInteger(args.limit) && Number(args.limit) > 0 ? Number(args.limit) : 6
  const result: RuntimeChangedRegLens[] = []
  for (let index = 0; index < args.next.length; index += 1) {
    if (previous[index] === args.next[index]) {
      continue
    }
    result.push({
      reg: `x${index}`,
      alias: typeof aliases[index] === 'string' ? String(aliases[index]) : '',
      prev: String(previous[index]),
      next: String(args.next[index]),
    })
    if (result.length >= limit) {
      break
    }
  }
  return result
}

type DebugStateLike = {
  xregs?: unknown[]
  fregs?: unknown[]
  xregAbi?: unknown[]
}

function readDebugState(state: RuntimeSessionState): DebugStateLike {
  if (!state.debugState || typeof state.debugState !== 'object') {
    return {}
  }
  return state.debugState as DebugStateLike
}

export function selectDebugRegisterRows(
  state: RuntimeSessionState,
  registerView: RuntimeRegisterView = state.registerView
): DebugRegisterRow[] {
  const debugState = readDebugState(state)
  if (registerView === 'f') {
    const fregs = Array.isArray(debugState.fregs) ? debugState.fregs : []
    return fregs.map((value, index) => ({
      key: `f${index}`,
      name: `f${index}`,
      value: String(value),
      changed: Boolean(state.changedFRegs[index]),
    }))
  }
  const xregs = Array.isArray(debugState.xregs) ? debugState.xregs : []
  const abi = Array.isArray(debugState.xregAbi) ? debugState.xregAbi : []
  return xregs.map((value, index) => ({
    key: `x${index}`,
    name: `x${index}`,
    alias: typeof abi[index] === 'string' ? abi[index] : '',
    value: String(value),
    changed: Boolean(state.changedXRegs[index]),
  }))
}
