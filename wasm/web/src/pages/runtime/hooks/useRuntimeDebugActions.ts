import { useCallback, useRef } from 'react'

import { useRuntimeEditorActions, useRuntimeEditorState } from '../editor/useRuntimeEditor'
import type { RuntimeExpandedSourceLink } from '../editor/runtimeEditorReducer'
import { useRuntimeSessionActions, useRuntimeSessionState } from '../session/useRuntimeSession'

type DebugWorkerResult = {
  state?: Record<string, unknown> | null
  committed?: number
  reachedNext?: boolean
  elfSize?: number
  lineMapEntries?: number
  expandedMapEntries?: number
  disassemblyText?: string
  expandedSourceText?: string
  expandedSourceLinks?: unknown
  traceRegWrites?: unknown
}

type UseRuntimeDebugActionsArgs = {
  resolveConfigText: () => Promise<string | null>
  callDebugWorker: (
    method: string,
    payload?: Record<string, unknown>,
    transfer?: ArrayBuffer[]
  ) => Promise<DebugWorkerResult>
  setOutput: (value: string) => void
}

export const useRuntimeDebugActions = ({
  resolveConfigText,
  callDebugWorker,
  setOutput,
}: UseRuntimeDebugActionsArgs) => {
  const sessionState = useRuntimeSessionState()
  const editorState = useRuntimeEditorState()
  const { patchRuntimeSession, setRuntimeSessionField } = useRuntimeSessionActions()
  const { patchRuntimeEditor, resetRuntimeEditorDefaults } = useRuntimeEditorActions()
  const previousDebugRegsRef = useRef<{ xregs: unknown[] | null; fregs: unknown[] | null }>({
    xregs: null,
    fregs: null,
  })

  const clearPreviousDebugRegs = useCallback(() => {
    previousDebugRegsRef.current = { xregs: null, fregs: null }
  }, [])

  const normalizeExpandedSourceLinks = useCallback((value: unknown): RuntimeExpandedSourceLink[] => {
    if (!Array.isArray(value)) {
      return []
    }
    const normalized: RuntimeExpandedSourceLink[] = []
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const sourceLine = Number((item as any).sourceLine)
      const expandedLinesRaw: unknown[] = Array.isArray((item as any).expandedLines)
        ? (item as any).expandedLines
        : []
      if (!Number.isInteger(sourceLine) || sourceLine <= 0) {
        continue
      }
      const expandedLines: number[] = expandedLinesRaw
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
  }, [])

  const normalizeTraceRegWrites = useCallback((value: unknown): Array<{
    kind: 'reg' | 'mem'
    name?: string
    value: string
    access?: string
    address?: string
  }> => {
    if (!Array.isArray(value)) {
      return []
    }
    const normalized: Array<{
      kind: 'reg' | 'mem'
      name?: string
      value: string
      access?: string
      address?: string
    }> = []
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const kind = String((item as any).kind || '').trim().toLowerCase()
      if (kind === 'mem') {
        const valueText = String((item as any).value || '').trim()
        if (!valueText) {
          continue
        }
        const access = String((item as any).access || '').trim().toUpperCase()
        const address = String((item as any).address || '').trim().toLowerCase()
        normalized.push({
          kind: 'mem',
          value: valueText,
          access,
          address,
        })
        continue
      }
      const name = String((item as any).name || '').trim()
      const rawValue = String((item as any).value || '').trim()
      if (!name || !rawValue) {
        continue
      }
      normalized.push({
        kind: 'reg',
        name,
        value: rawValue,
      })
    }
    return normalized
  }, [])

  const buildTraceRegisterChanges = useCallback((args: {
    traceRegWrites: Array<{
      kind: 'reg' | 'mem'
      name?: string
      value: string
      access?: string
      address?: string
    }>
    previousXregs: unknown[] | null
    previousFregs: unknown[] | null
    nextXregs: unknown[]
    nextFregs: unknown[]
    xregAbi: unknown[]
  }) => {
    const changedXRegs = new Array(args.nextXregs.length).fill(false)
    const changedFRegs = new Array(args.nextFregs.length).fill(false)
    const changedRegLens = []
    if (!args.traceRegWrites.length) {
      return { changedXRegs, changedFRegs, changedRegLens }
    }

    const aliasToXRegIndex = new Map<string, number>()
    for (let index = 0; index < args.xregAbi.length; index += 1) {
      const alias = String(args.xregAbi[index] || '').trim().toLowerCase()
      if (alias) {
        aliasToXRegIndex.set(alias, index)
      }
    }

    const seen = new Set<string>()
    for (const write of args.traceRegWrites) {
      if (write.kind === 'mem') {
        const access = String(write.access || 'W')
        const address = String(write.address || '').trim()
        const memLabel = address ? `mem[${access},${address}]` : `mem[${access}]`
        changedRegLens.push({
          reg: memLabel,
          prev: '',
          next: String(write.value || ''),
        })
        continue
      }
      const rawName = String(write.name || '').trim()
      if (!rawName) {
        continue
      }
      const regName = rawName.toLowerCase()
      const xMatch = regName.match(/^x([0-9]|[12][0-9]|3[01])$/)
      if (xMatch) {
        const regIndex = Number(xMatch[1])
        if (!Number.isInteger(regIndex) || regIndex < 0 || regIndex >= args.nextXregs.length) {
          continue
        }
        const key = `x${regIndex}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        changedXRegs[regIndex] = true
        const alias = typeof args.xregAbi[regIndex] === 'string' ? String(args.xregAbi[regIndex]) : ''
        const prev = Array.isArray(args.previousXregs)
          ? String(args.previousXregs[regIndex] ?? write.value)
          : String(write.value)
        const next = String(args.nextXregs[regIndex] ?? write.value)
        changedRegLens.push({
          reg: `x${regIndex}`,
          alias,
          prev,
          next,
        })
        continue
      }

      const fMatch = regName.match(/^f([0-9]|[12][0-9]|3[01])$/)
      if (fMatch) {
        const regIndex = Number(fMatch[1])
        if (!Number.isInteger(regIndex) || regIndex < 0 || regIndex >= args.nextFregs.length) {
          continue
        }
        const key = `f${regIndex}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        changedFRegs[regIndex] = true
        const prev = Array.isArray(args.previousFregs)
          ? String(args.previousFregs[regIndex] ?? write.value)
          : String(write.value)
        const next = String(args.nextFregs[regIndex] ?? write.value)
        changedRegLens.push({
          reg: `f${regIndex}`,
          prev,
          next,
        })
        continue
      }

      const aliasIndex = aliasToXRegIndex.get(regName)
      if (!Number.isInteger(aliasIndex) || aliasIndex < 0 || aliasIndex >= args.nextXregs.length) {
        continue
      }
      const key = `x${aliasIndex}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      changedXRegs[aliasIndex] = true
      const alias = typeof args.xregAbi[aliasIndex] === 'string' ? String(args.xregAbi[aliasIndex]) : rawName
      const prev = Array.isArray(args.previousXregs)
        ? String(args.previousXregs[aliasIndex] ?? write.value)
        : String(write.value)
      const next = String(args.nextXregs[aliasIndex] ?? write.value)
      changedRegLens.push({
        reg: `x${aliasIndex}`,
        alias,
        prev,
        next,
      })
    }

    return { changedXRegs, changedFRegs, changedRegLens }
  }, [])

  const resetDebugDiff = useCallback(() => {
    patchRuntimeSession({
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
    })
    clearPreviousDebugRegs()
  }, [clearPreviousDebugRegs, patchRuntimeSession])

  const applyDebugState = useCallback(
    (
      state: Record<string, unknown> | null | undefined,
      options: { resetDiff?: boolean; traceRegWrites?: unknown } = {}
    ) => {
      const resetDiff = Boolean(options.resetDiff)
      if (!state || typeof state !== 'object') {
        setRuntimeSessionField('debugState', null)
        if (resetDiff) {
          resetDebugDiff()
        }
        return
      }

      const xregs = Array.isArray(state.xregs) ? state.xregs : []
      const fregs = Array.isArray(state.fregs) ? state.fregs : []
      const xregAbi = Array.isArray(state.xregAbi) ? state.xregAbi : []
      const previous = previousDebugRegsRef.current
      const traceRegWrites = normalizeTraceRegWrites(options.traceRegWrites)

      if (resetDiff || !Array.isArray(previous.xregs)) {
        patchRuntimeSession({
          changedXRegs: new Array(xregs.length).fill(false),
          changedFRegs: new Array(fregs.length).fill(false),
          changedRegLens: [],
        })
      } else {
        const traceChanges = buildTraceRegisterChanges({
          traceRegWrites,
          previousXregs: previous.xregs,
          previousFregs: previous.fregs,
          nextXregs: xregs,
          nextFregs: fregs,
          xregAbi,
        })
        patchRuntimeSession({
          changedXRegs: traceChanges.changedXRegs,
          changedFRegs: traceChanges.changedFRegs,
          changedRegLens: traceChanges.changedRegLens,
        })
      }

      previousDebugRegsRef.current = {
        xregs: xregs.slice(),
        fregs: fregs.slice(),
      }
      setRuntimeSessionField('debugState', state)
    },
    [
      buildTraceRegisterChanges,
      normalizeTraceRegWrites,
      patchRuntimeSession,
      resetDebugDiff,
      setRuntimeSessionField,
    ]
  )

  const initElfDebug = useCallback(
    async (overrideElfFile: File | null = null) => {
      const targetElfFile = overrideElfFile || sessionState.uploadElfFile
      if (!targetElfFile) {
        setRuntimeSessionField('elfRunStatus', 'Please choose an ELF file.')
        return false
      }
      const configText = await resolveConfigText()
      if (!configText) {
        setRuntimeSessionField('elfRunStatus', 'Config not available.')
        return false
      }

      const bytes = new Uint8Array(await targetElfFile.arrayBuffer())
      patchRuntimeSession({
        uploadElfFile: targetElfFile,
        debugBusy: true,
        debugReady: false,
        runtimeInputMode: 'upload',
        elfRunStatus: `Initializing ${targetElfFile.name}...`,
      })
      patchRuntimeEditor({
        uploadDisasmInput: '',
        expandedSourceLinks: [],
      })
      setOutput('')
      resetDebugDiff()

      try {
        const result = await callDebugWorker(
          'start',
          {
            configText,
            elfBytes: bytes.buffer,
            elfName: targetElfFile.name,
            traceEnabled: true,
          },
          [bytes.buffer]
        )
        applyDebugState(result.state, { resetDiff: true })
        patchRuntimeEditor({
          uploadDisasmInput:
            typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
        })
        patchRuntimeSession({
          debugReady: true,
          elfRunStatus: `Initialized: ${targetElfFile.name}`,
        })
        return true
      } catch (error) {
        patchRuntimeSession({
          debugReady: false,
          elfRunStatus: `Init failed: ${error instanceof Error ? error.message : String(error)}`,
        })
        return false
      } finally {
        setRuntimeSessionField('debugBusy', false)
      }
    },
    [
      sessionState.uploadElfFile,
      setRuntimeSessionField,
      resolveConfigText,
      patchRuntimeSession,
      patchRuntimeEditor,
      setOutput,
      resetDebugDiff,
      callDebugWorker,
      applyDebugState,
    ]
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
    patchRuntimeSession({
      runtimeInputMode: 'edit',
      debugState: null,
      debugReady: false,
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
      elfRunStatus: 'Edit mode',
    })
    patchRuntimeEditor({
      editEditorTab: 'program',
    })
    clearPreviousDebugRegs()
  }, [clearPreviousDebugRegs, patchRuntimeEditor, patchRuntimeSession])

  const buildAsmAndInitDebug = useCallback(async () => {
    const configText = await resolveConfigText()
    if (!configText) {
      setRuntimeSessionField('elfRunStatus', 'Config not available.')
      return false
    }
    if (!editorState.asmSourceInput.trim()) {
      setRuntimeSessionField('elfRunStatus', 'Assembly source is empty.')
      return false
    }
    if (!editorState.linkerScriptInput.trim()) {
      setRuntimeSessionField('elfRunStatus', 'Linker script is empty.')
      return false
    }

    patchRuntimeSession({
      debugBusy: true,
      debugReady: false,
      runtimeInputMode: 'edit',
      elfRunStatus: 'Assembling + linking in worker...',
    })
    patchRuntimeEditor({
      editEditorTab: 'program',
      expandedAsmSourceInput: '',
      expandedSourceLinks: [],
      uploadDisasmInput: '',
    })
    setOutput('')
    resetDebugDiff()

    try {
      const result = await callDebugWorker('assembleStart', {
        configText,
        asmText: editorState.asmSourceInput,
        linkScriptText: editorState.linkerScriptInput,
        gasMarch: editorState.gasMarchInput.trim() || 'rv64imac',
        gasAbi: editorState.gasAbiInput.trim() || 'lp64',
        traceEnabled: true,
      })
      applyDebugState(result.state, { resetDiff: true })
      const elfSize = Number.isFinite(result.elfSize) ? Number(result.elfSize) : 0
      const lineEntries = Number.isFinite(result.lineMapEntries)
        ? Number(result.lineMapEntries)
        : 0
      const expandedEntries = Number.isFinite(result.expandedMapEntries)
        ? Number(result.expandedMapEntries)
        : 0
      patchRuntimeEditor({
        expandedAsmSourceInput:
          typeof result.expandedSourceText === 'string' ? result.expandedSourceText : '',
        expandedSourceLinks: normalizeExpandedSourceLinks(result.expandedSourceLinks),
        uploadDisasmInput:
          typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
      })
      patchRuntimeSession({
        debugReady: true,
        elfRunStatus: `Built + initialized from assembly (${elfSize} bytes, ${lineEntries} line entries, ${expandedEntries} mapped groups).`,
      })
      return true
    } catch (error) {
      patchRuntimeSession({
        debugReady: false,
        elfRunStatus: `Build failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      return false
    } finally {
      setRuntimeSessionField('debugBusy', false)
    }
  }, [
    resolveConfigText,
    setRuntimeSessionField,
    editorState.asmSourceInput,
    editorState.linkerScriptInput,
    editorState.gasMarchInput,
    editorState.gasAbiInput,
    patchRuntimeSession,
    patchRuntimeEditor,
    setOutput,
    resetDebugDiff,
    callDebugWorker,
    applyDebugState,
    normalizeExpandedSourceLinks,
  ])

  const stepElfDebug = useCallback(
    async (steps = 1) => {
      if (!sessionState.debugReady) {
        setRuntimeSessionField('elfRunStatus', 'Debug session is not initialized.')
        return
      }
      setRuntimeSessionField('elfRunStatus', `Stepping ${Math.max(1, steps | 0)} instruction(s)...`)
      setRuntimeSessionField('debugBusy', true)
      try {
        const result = await callDebugWorker('step', { steps: Math.max(1, steps | 0) })
        applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
        const halted = Boolean((result.state as Record<string, unknown> | null)?.halted)
        const exitCode = Number.isFinite((result.state as any)?.exitCode)
          ? Number((result.state as any).exitCode)
          : 0
        if (halted) {
          setRuntimeSessionField('elfRunStatus', `Halted (exit=${exitCode})`)
        } else {
          setRuntimeSessionField(
            'elfRunStatus',
            `Stepped ${result.committed || 0} instruction(s).`
          )
        }
      } catch (error) {
        setRuntimeSessionField(
          'elfRunStatus',
          `Step failed: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setRuntimeSessionField('debugBusy', false)
      }
    },
    [sessionState.debugReady, setRuntimeSessionField, callDebugWorker, applyDebugState]
  )

  const stepElfDebugLine = useCallback(async () => {
    if (!sessionState.debugReady) {
      setRuntimeSessionField('elfRunStatus', 'Debug session is not initialized.')
      return
    }
    setRuntimeSessionField('elfRunStatus', 'Stepping to next source line...')
    setRuntimeSessionField('debugBusy', true)
    try {
      const result = await callDebugWorker('stepLine', { maxSteps: 4096 })
      applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
      const halted = Boolean((result.state as Record<string, unknown> | null)?.halted)
      const exitCode = Number.isFinite((result.state as any)?.exitCode)
        ? Number((result.state as any).exitCode)
        : 0
      if (halted) {
        setRuntimeSessionField('elfRunStatus', `Halted (exit=${exitCode})`)
      } else if (result?.reachedNext) {
        setRuntimeSessionField(
          'elfRunStatus',
          `Stepped to next line (${result.committed || 0} instruction(s)).`
        )
      } else {
        setRuntimeSessionField(
          'elfRunStatus',
          `Step line limit reached (${result.committed || 0} instruction(s)).`
        )
      }
    } catch (error) {
      setRuntimeSessionField(
        'elfRunStatus',
        `Step line failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setRuntimeSessionField('debugBusy', false)
    }
  }, [sessionState.debugReady, setRuntimeSessionField, callDebugWorker, applyDebugState])

  const runElfDebug = useCallback(async () => {
    let ready = sessionState.debugReady
    if (!ready) {
      if (sessionState.runtimeInputMode === 'upload') {
        ready = await initElfDebug()
      } else {
        ready = await buildAsmAndInitDebug()
      }
    }
    if (!ready) {
      return
    }
    patchRuntimeSession({
      debugBusy: true,
      elfRunStatus: 'Running to completion...',
    })
    try {
      const result = await callDebugWorker('run', {
        chunk: 5000,
        watchdogMs: 15000,
      })
      applyDebugState(result.state, { traceRegWrites: result.traceRegWrites })
      const exitCode = Number.isFinite((result.state as any)?.exitCode)
        ? Number((result.state as any).exitCode)
        : 0
      if (exitCode === 0) {
        const runName =
          sessionState.runtimeInputMode === 'upload'
            ? sessionState.uploadElfFile?.name || 'ELF'
            : 'assembly'
        setRuntimeSessionField('elfRunStatus', `Run finished: ${runName}`)
      } else {
        setRuntimeSessionField('elfRunStatus', `Run failed with exit code ${exitCode}`)
      }
    } catch (error) {
      setRuntimeSessionField(
        'elfRunStatus',
        `Run failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setRuntimeSessionField('debugBusy', false)
    }
  }, [
    sessionState.debugReady,
    sessionState.runtimeInputMode,
    sessionState.uploadElfFile?.name,
    initElfDebug,
    buildAsmAndInitDebug,
    patchRuntimeSession,
    callDebugWorker,
    applyDebugState,
    setRuntimeSessionField,
  ])

  const resetElfDebug = useCallback(
    async ({ preserveEditBuffers = false }: { preserveEditBuffers?: boolean } = {}) => {
      setRuntimeSessionField('debugBusy', true)
      try {
        await callDebugWorker('reset')
      } catch {
        // reset best-effort
      } finally {
        patchRuntimeSession({
          debugBusy: false,
          debugReady: false,
          debugState: null,
          elfRunStatus: 'Debug session reset.',
        })
        patchRuntimeEditor({
          uploadDisasmInput: '',
          expandedSourceLinks: [],
          ...(preserveEditBuffers ? {} : { expandedAsmSourceInput: '' }),
        })
        resetDebugDiff()
      }
    },
    [callDebugWorker, patchRuntimeSession, patchRuntimeEditor, resetDebugDiff, setRuntimeSessionField]
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
    sessionState.runtimeInputMode,
    resetElfDebug,
    patchRuntimeSession,
    resetRuntimeEditorDefaults,
    setRuntimeSessionField,
  ])

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
  }
}
