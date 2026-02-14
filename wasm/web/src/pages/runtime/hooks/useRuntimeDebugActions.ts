import { useCallback, useMemo, useRef } from 'react'

import { useRuntimeEditorActions, useRuntimeEditorState } from '../editor/useRuntimeEditor'
import { useRuntimeSessionActions, useRuntimeSessionState } from '../session/useRuntimeSession'
import { projectDebugState } from '../services/debugStateProjector'
import {
  buildAsmAndInitDebugOperation,
  initElfDebugOperation,
  resetDebugOperation,
  runDebugOperation,
  stepDebugOperation,
  stepLineDebugOperation,
} from '../services/debugOperations'
import type { CallDebugWorker, DebugWorkerState } from '../services/debugWorkerTypes'
import { createClearDebugDiffPatch, createSwitchToEditPatch } from '../services/sessionTransitions'

type UseRuntimeDebugActionsArgs = {
  resolveConfigText: () => Promise<string | null>
  callDebugWorker: CallDebugWorker
  forceStopDebugWorker: (reason?: string) => void
  setOutput: (value: string) => void
}

type ApplyDebugStateOptions = {
  resetDiff?: boolean
  traceRegWrites?: unknown
}

const EMPTY_SNAPSHOT = { xregs: null, fregs: null }

export const useRuntimeDebugActions = ({
  resolveConfigText,
  callDebugWorker,
  forceStopDebugWorker,
  setOutput,
}: UseRuntimeDebugActionsArgs) => {
  const sessionState = useRuntimeSessionState()
  const editorState = useRuntimeEditorState()
  const { patchRuntimeSession, setRuntimeSessionField } = useRuntimeSessionActions()
  const { patchRuntimeEditor, resetRuntimeEditorDefaults } = useRuntimeEditorActions()
  const previousDebugRegsRef = useRef(EMPTY_SNAPSHOT)

  const clearPreviousDebugRegs = useCallback(() => {
    previousDebugRegsRef.current = EMPTY_SNAPSHOT
  }, [])

  const resetDebugDiff = useCallback(() => {
    patchRuntimeSession(createClearDebugDiffPatch())
    clearPreviousDebugRegs()
  }, [clearPreviousDebugRegs, patchRuntimeSession])

  const applyDebugState = useCallback(
    (state: DebugWorkerState | undefined, options: ApplyDebugStateOptions = {}) => {
      const projected = projectDebugState({
        state,
        previousSnapshot: previousDebugRegsRef.current,
        resetDiff: options.resetDiff,
        traceRegWrites: options.traceRegWrites,
      })
      previousDebugRegsRef.current = projected.nextSnapshot
      patchRuntimeSession({
        debugState: projected.debugState,
        changedXRegs: projected.changedXRegs,
        changedFRegs: projected.changedFRegs,
        changedRegLens: projected.changedRegLens,
      })
    },
    [patchRuntimeSession]
  )

  const operationEnv = useMemo(
    () => ({
      callDebugWorker,
      patchRuntimeSession,
      setRuntimeSessionField,
      patchRuntimeEditor,
      applyDebugState,
      resetDebugDiff,
      setOutput,
    }),
    [
      applyDebugState,
      callDebugWorker,
      patchRuntimeEditor,
      patchRuntimeSession,
      resetDebugDiff,
      setOutput,
      setRuntimeSessionField,
    ]
  )

  const initElfDebug = useCallback(
    async (overrideElfFile: File | null = null) =>
      initElfDebugOperation(operationEnv, {
        resolveConfigText,
        uploadElfFile: sessionState.uploadElfFile,
        overrideElfFile,
      }),
    [operationEnv, resolveConfigText, sessionState.uploadElfFile]
  )

  const onUploadElf = useCallback(
    (file: File | null) => {
      if (!file) {
        return
      }
      patchRuntimeSession({
        runtimeInputMode: 'upload',
        uploadElfFile: file,
      })
      void initElfDebug(file)
    },
    [initElfDebug, patchRuntimeSession]
  )

  const switchToEditMode = useCallback(() => {
    patchRuntimeSession(createSwitchToEditPatch())
    patchRuntimeEditor({ editEditorTab: 'program' })
    clearPreviousDebugRegs()
  }, [clearPreviousDebugRegs, patchRuntimeEditor, patchRuntimeSession])

  const buildAsmAndInitDebug = useCallback(
    async () =>
      buildAsmAndInitDebugOperation(operationEnv, {
        resolveConfigText,
        editorState,
      }),
    [editorState, operationEnv, resolveConfigText]
  )

  const stepElfDebug = useCallback(
    async (steps = 1) =>
      stepDebugOperation(operationEnv, {
        debugReady: sessionState.debugReady,
        steps,
      }),
    [operationEnv, sessionState.debugReady]
  )

  const stepElfDebugLine = useCallback(
    async () =>
      stepLineDebugOperation(operationEnv, {
        debugReady: sessionState.debugReady,
        maxSteps: 4096,
      }),
    [operationEnv, sessionState.debugReady]
  )

  const runElfDebug = useCallback(
    async () =>
      runDebugOperation(operationEnv, {
        ensureReady: async () => {
          if (sessionState.debugReady) {
            return true
          }
          return sessionState.runtimeInputMode === 'upload'
            ? initElfDebug()
            : buildAsmAndInitDebug()
        },
        context: {
          runtimeInputMode: sessionState.runtimeInputMode,
          uploadElfName: sessionState.uploadElfFile?.name,
        },
      }),
    [
      buildAsmAndInitDebug,
      initElfDebug,
      operationEnv,
      sessionState.debugReady,
      sessionState.runtimeInputMode,
      sessionState.uploadElfFile?.name,
    ]
  )

  const resetElfDebug = useCallback(
    async ({ preserveEditBuffers = false }: { preserveEditBuffers?: boolean } = {}) =>
      resetDebugOperation(operationEnv, { preserveEditBuffers }),
    [operationEnv]
  )

  const onToolbarReset = useCallback(async () => {
    if (sessionState.runtimeInputMode === 'upload') {
      await resetElfDebug({ preserveEditBuffers: true })
      patchRuntimeSession({
        uploadElfFile: null,
        elfRunStatus: 'Upload cleared.',
      })
      return
    }
    resetRuntimeEditorDefaults()
    setRuntimeSessionField('elfRunStatus', 'Edit defaults restored.')
  }, [
    patchRuntimeSession,
    resetElfDebug,
    resetRuntimeEditorDefaults,
    sessionState.runtimeInputMode,
    setRuntimeSessionField,
  ])

  const forceStopDebug = useCallback(() => {
    forceStopDebugWorker('Execution force-stopped by user.')
    patchRuntimeSession({
      debugBusy: false,
      debugReady: false,
      debugState: null,
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
      elfRunStatus: 'Execution force-stopped. Rebuild + Init to continue.',
    })
    clearPreviousDebugRegs()
  }, [clearPreviousDebugRegs, forceStopDebugWorker, patchRuntimeSession])

  return {
    initElfDebug,
    onUploadElf,
    switchToEditMode,
    buildAsmAndInitDebug,
    stepElfDebug,
    stepElfDebugLine,
    runElfDebug,
    resetElfDebug,
    onToolbarReset,
    forceStopDebug,
  }
}
