import type { RuntimeEditorState } from '../editor/runtimeEditorReducer'
import type { RuntimeSessionState } from '../session/runtimeSessionReducer'
import type { DebugWorkerState, CallDebugWorker } from './debugWorkerTypes'
import { normalizeExpandedSourceLinks } from './debugStateProjector'
import {
  createAssembleInitPatch,
  createResetSessionPatch,
  createUploadInitPatch,
} from './sessionTransitions'
import {
  formatFailureStatus,
  formatHaltedStatus,
  formatRunStatus,
  formatSteppedStatus,
  formatStepLineLimitStatus,
  formatStepLineReachedStatus,
  readExitCode,
  readHalted,
} from './statusText'

type RuntimeSessionSetField = <K extends keyof RuntimeSessionState>(
  field: K,
  value: RuntimeSessionState[K]
) => void

type DebugOperationEnv = {
  callDebugWorker: CallDebugWorker
  patchRuntimeSession: (payload: Partial<RuntimeSessionState>) => void
  setRuntimeSessionField: RuntimeSessionSetField
  patchRuntimeEditor: (payload: Partial<RuntimeEditorState>) => void
  applyDebugState: (
    state: DebugWorkerState | undefined,
    options?: { resetDiff?: boolean; traceRegWrites?: unknown }
  ) => void
  resetDebugDiff: () => void
  setOutput: (value: string) => void
}

type RunContext = {
  runtimeInputMode: RuntimeSessionState['runtimeInputMode']
  uploadElfName?: string
}

export async function initElfDebugOperation(
  env: DebugOperationEnv,
  args: {
    resolveConfigText: () => Promise<string | null>
    uploadElfFile: File | null
    overrideElfFile?: File | null
  }
): Promise<boolean> {
  const targetElfFile = args.overrideElfFile || args.uploadElfFile
  if (!targetElfFile) {
    env.setRuntimeSessionField('elfRunStatus', 'Please choose an ELF file.')
    return false
  }
  const configText = await args.resolveConfigText()
  if (!configText) {
    env.setRuntimeSessionField('elfRunStatus', 'Config not available.')
    return false
  }

  const bytes = new Uint8Array(await targetElfFile.arrayBuffer())
  env.patchRuntimeSession(createUploadInitPatch(targetElfFile))
  env.patchRuntimeEditor({
    uploadDisasmInput: '',
    expandedSourceLinks: [],
  })
  env.setOutput('')
  env.resetDebugDiff()

  try {
    const result = await env.callDebugWorker(
      'start',
      {
        configText,
        elfBytes: bytes.buffer,
        elfName: targetElfFile.name,
        traceEnabled: true,
      },
      [bytes.buffer]
    )
    env.applyDebugState(result.state, { resetDiff: true })
    env.patchRuntimeEditor({
      uploadDisasmInput: typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
    })
    env.patchRuntimeSession({
      debugReady: true,
      elfRunStatus: `Initialized: ${targetElfFile.name}`,
    })
    return true
  } catch (error) {
    env.patchRuntimeSession({
      debugReady: false,
      elfRunStatus: formatFailureStatus('Init failed', error),
    })
    return false
  } finally {
    env.setRuntimeSessionField('debugBusy', false)
  }
}

export async function buildAsmAndInitDebugOperation(
  env: DebugOperationEnv,
  args: {
    resolveConfigText: () => Promise<string | null>
    editorState: RuntimeEditorState
  }
): Promise<boolean> {
  const configText = await args.resolveConfigText()
  if (!configText) {
    env.setRuntimeSessionField('elfRunStatus', 'Config not available.')
    return false
  }
  if (!args.editorState.asmSourceInput.trim()) {
    env.setRuntimeSessionField('elfRunStatus', 'Assembly source is empty.')
    return false
  }
  if (!args.editorState.linkerScriptInput.trim()) {
    env.setRuntimeSessionField('elfRunStatus', 'Linker script is empty.')
    return false
  }

  env.patchRuntimeSession(createAssembleInitPatch())
  env.patchRuntimeEditor({
    editEditorTab: 'program',
    expandedAsmSourceInput: '',
    expandedSourceLinks: [],
    uploadDisasmInput: '',
  })
  env.setOutput('')
  env.resetDebugDiff()

  try {
    const result = await env.callDebugWorker('assembleStart', {
      configText,
      asmText: args.editorState.asmSourceInput,
      linkScriptText: args.editorState.linkerScriptInput,
      gasMarch: args.editorState.gasMarchInput.trim() || 'rv64imac',
      gasAbi: args.editorState.gasAbiInput.trim() || 'lp64',
      traceEnabled: true,
    })
    env.applyDebugState(result.state, { resetDiff: true })
    const elfSize = Number.isFinite(result.elfSize) ? Number(result.elfSize) : 0
    const lineEntries = Number.isFinite(result.lineMapEntries) ? Number(result.lineMapEntries) : 0
    const expandedEntries = Number.isFinite(result.expandedMapEntries)
      ? Number(result.expandedMapEntries)
      : 0
    env.patchRuntimeEditor({
      expandedAsmSourceInput:
        typeof result.expandedSourceText === 'string' ? result.expandedSourceText : '',
      expandedSourceLinks: normalizeExpandedSourceLinks(result.expandedSourceLinks),
      uploadDisasmInput: typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
    })
    env.patchRuntimeSession({
      debugReady: true,
      elfRunStatus: `Built + initialized from assembly (${elfSize} bytes, ${lineEntries} line entries, ${expandedEntries} mapped groups).`,
    })
    return true
  } catch (error) {
    env.patchRuntimeSession({
      debugReady: false,
      elfRunStatus: formatFailureStatus('Build failed', error),
    })
    return false
  } finally {
    env.setRuntimeSessionField('debugBusy', false)
  }
}

export async function stepDebugOperation(
  env: DebugOperationEnv,
  args: { debugReady: boolean; steps: number }
) {
  if (!args.debugReady) {
    env.setRuntimeSessionField('elfRunStatus', 'Debug session is not initialized.')
    return
  }
  const boundedSteps = Math.max(1, args.steps | 0)
  env.setRuntimeSessionField('elfRunStatus', `Stepping ${boundedSteps} instruction(s)...`)
  env.setRuntimeSessionField('debugBusy', true)
  try {
    const result = await env.callDebugWorker('step', { steps: boundedSteps })
    env.applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
    env.setRuntimeSessionField(
      'elfRunStatus',
      readHalted(result.state) ? formatHaltedStatus(result.state) : formatSteppedStatus(result.committed)
    )
  } catch (error) {
    env.setRuntimeSessionField('elfRunStatus', formatFailureStatus('Step failed', error))
  } finally {
    env.setRuntimeSessionField('debugBusy', false)
  }
}

export async function stepLineDebugOperation(
  env: DebugOperationEnv,
  args: { debugReady: boolean; maxSteps: number }
) {
  if (!args.debugReady) {
    env.setRuntimeSessionField('elfRunStatus', 'Debug session is not initialized.')
    return
  }
  env.setRuntimeSessionField('elfRunStatus', 'Stepping to next source line...')
  env.setRuntimeSessionField('debugBusy', true)
  try {
    const result = await env.callDebugWorker('stepLine', { maxSteps: args.maxSteps })
    env.applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
    if (readHalted(result.state)) {
      env.setRuntimeSessionField('elfRunStatus', formatHaltedStatus(result.state))
    } else if (result.reachedNext) {
      env.setRuntimeSessionField('elfRunStatus', formatStepLineReachedStatus(result.committed))
    } else {
      env.setRuntimeSessionField('elfRunStatus', formatStepLineLimitStatus(result.committed))
    }
  } catch (error) {
    env.setRuntimeSessionField('elfRunStatus', formatFailureStatus('Step line failed', error))
  } finally {
    env.setRuntimeSessionField('debugBusy', false)
  }
}

export async function runDebugOperation(
  env: DebugOperationEnv,
  args: {
    ensureReady: () => Promise<boolean>
    context: RunContext
  }
) {
  const ready = await args.ensureReady()
  if (!ready) {
    return
  }

  env.patchRuntimeSession({
    debugBusy: true,
    elfRunStatus: 'Running to completion...',
  })
  try {
    const result = await env.callDebugWorker('run', { chunk: 5000, watchdogMs: 15000 })
    env.applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
    const runName =
      args.context.runtimeInputMode === 'upload' ? args.context.uploadElfName || 'ELF' : 'assembly'
    env.setRuntimeSessionField(
      'elfRunStatus',
      formatRunStatus({ exitCode: readExitCode(result.state), runName })
    )
  } catch (error) {
    env.setRuntimeSessionField('elfRunStatus', formatFailureStatus('Run failed', error))
  } finally {
    env.setRuntimeSessionField('debugBusy', false)
  }
}

export async function resetDebugOperation(
  env: DebugOperationEnv,
  args: { preserveEditBuffers?: boolean } = {}
) {
  env.setRuntimeSessionField('debugBusy', true)
  try {
    await env.callDebugWorker('reset')
  } catch {
    // best effort
  } finally {
    env.patchRuntimeSession(createResetSessionPatch())
    env.patchRuntimeEditor({
      uploadDisasmInput: '',
      expandedSourceLinks: [],
      ...(args.preserveEditBuffers ? {} : { expandedAsmSourceInput: '' }),
    })
    env.resetDebugDiff()
  }
}
