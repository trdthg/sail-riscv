export type DebugWorkerState = Record<string, unknown> | null

export type DebugTraceRegWrite =
  | {
      kind: 'reg'
      name: string
      value: string
    }
  | {
      kind: 'mem'
      access?: string
      address?: string
      value: string
    }

export type DebugWorkerMethod =
  | 'start'
  | 'assembleStart'
  | 'step'
  | 'stepLine'
  | 'run'
  | 'reset'
  | 'state'

type StartRequest = {
  configText: string
  elfBytes: ArrayBuffer
  elfName?: string
  traceEnabled?: boolean
}

type AssembleStartRequest = {
  configText: string
  asmText: string
  linkScriptText: string
  gasMarch?: string
  gasAbi?: string
  traceEnabled?: boolean
}

type StepRequest = {
  steps: number
}

type StepLineRequest = {
  maxSteps: number
}

type RunRequest = {
  chunk?: number
  watchdogMs?: number
}

type WorkerBaseResponse = {
  state?: DebugWorkerState
  committed?: number
  disassemblyText?: string
  expandedSourceText?: string
  expandedSourceLinks?: unknown
  lineMapEntries?: number
  expandedMapEntries?: number
  elfSize?: number
  traceRegWrites?: DebugTraceRegWrite[]
  reachedNext?: boolean
}

export type DebugWorkerRequestMap = {
  start: StartRequest
  assembleStart: AssembleStartRequest
  step: StepRequest
  stepLine: StepLineRequest
  run: RunRequest
  reset: Record<string, never>
  state: Record<string, never>
}

export type DebugWorkerResponseMap = {
  start: WorkerBaseResponse
  assembleStart: WorkerBaseResponse
  step: WorkerBaseResponse
  stepLine: WorkerBaseResponse
  run: WorkerBaseResponse
  reset: WorkerBaseResponse
  state: WorkerBaseResponse
}

export type CallDebugWorker = <M extends DebugWorkerMethod>(
  method: M,
  payload?: DebugWorkerRequestMap[M],
  transfer?: ArrayBuffer[]
) => Promise<DebugWorkerResponseMap[M]>
