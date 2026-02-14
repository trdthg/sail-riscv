import type { RuntimeExpandedSourceLink } from '../editor/runtimeEditorReducer'
import type { RuntimeChangedRegLens } from '../session/runtimeSessionReducer'
import {
  buildTraceRegisterChanges,
  normalizeTraceRegWrites,
} from './traceWrites'

export type RuntimeRegisterSnapshot = {
  xregs: unknown[] | null
  fregs: unknown[] | null
}

export type ProjectDebugStateResult = {
  debugState: Record<string, unknown> | null
  changedXRegs: boolean[]
  changedFRegs: boolean[]
  changedRegLens: RuntimeChangedRegLens[]
  nextSnapshot: RuntimeRegisterSnapshot
}

type ProjectDebugStateArgs = {
  state: Record<string, unknown> | null | undefined
  previousSnapshot: RuntimeRegisterSnapshot
  resetDiff?: boolean
  traceRegWrites?: unknown
}

export function normalizeExpandedSourceLinks(value: unknown): RuntimeExpandedSourceLink[] {
  if (!Array.isArray(value)) {
    return []
  }
  const normalized: RuntimeExpandedSourceLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const sourceLine = Number((item as { sourceLine?: unknown }).sourceLine)
    const expandedLinesRaw = Array.isArray((item as { expandedLines?: unknown }).expandedLines)
      ? ((item as { expandedLines: unknown[] }).expandedLines || [])
      : []
    if (!Number.isInteger(sourceLine) || sourceLine <= 0) {
      continue
    }
    const expandedLines = expandedLinesRaw
      .map((line) => Number(line))
      .filter((line): line is number => Number.isInteger(line) && line > 0)
    if (!expandedLines.length) {
      continue
    }
    normalized.push({
      sourceLine,
      expandedLines: Array.from(new Set(expandedLines)).sort((left, right) => left - right),
    })
  }
  return normalized.sort((left, right) => left.sourceLine - right.sourceLine)
}

export function projectDebugState(args: ProjectDebugStateArgs): ProjectDebugStateResult {
  if (!args.state || typeof args.state !== 'object') {
    return {
      debugState: null,
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
      nextSnapshot: { xregs: null, fregs: null },
    }
  }

  const xregs = Array.isArray(args.state.xregs) ? args.state.xregs : []
  const fregs = Array.isArray(args.state.fregs) ? args.state.fregs : []
  const xregAbi = Array.isArray(args.state.xregAbi) ? args.state.xregAbi : []
  const resetDiff = Boolean(args.resetDiff)

  if (resetDiff || !Array.isArray(args.previousSnapshot.xregs)) {
    return {
      debugState: args.state,
      changedXRegs: new Array(xregs.length).fill(false),
      changedFRegs: new Array(fregs.length).fill(false),
      changedRegLens: [],
      nextSnapshot: {
        xregs: xregs.slice(),
        fregs: fregs.slice(),
      },
    }
  }

  const traceRegWrites = normalizeTraceRegWrites(args.traceRegWrites)
  const traceChanges = buildTraceRegisterChanges({
    traceRegWrites,
    previousXregs: args.previousSnapshot.xregs,
    previousFregs: args.previousSnapshot.fregs,
    nextXregs: xregs,
    nextFregs: fregs,
    xregAbi,
  })

  return {
    debugState: args.state,
    changedXRegs: traceChanges.changedXRegs,
    changedFRegs: traceChanges.changedFRegs,
    changedRegLens: traceChanges.changedRegLens,
    nextSnapshot: {
      xregs: xregs.slice(),
      fregs: fregs.slice(),
    },
  }
}
