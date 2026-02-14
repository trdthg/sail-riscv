import { useRef } from 'react'

import {
  createFocusLineCommand,
  createOpenTabCommand,
} from '../../pages/runtime/editorCommands'
import { useRuntimeEditorActions, useRuntimeEditorSelectors, useRuntimeEditorState } from '../../pages/runtime/editor/useRuntimeEditor'
import { useRuntimeEditorCommands } from '../../pages/runtime/editor/useRuntimeEditorCommands'
import { useRuntimeDebugActions } from '../../pages/runtime/hooks/useRuntimeDebugActions'
import { useRuntimeSessionActions, useRuntimeSessionState } from '../../pages/runtime/session/useRuntimeSession'

export function RuntimeToolbar({
  isDark,
  setConfigTemplatePath,
  resetConfigFromTemplatePath,
  configsState,
  resolveConfigText,
  callDebugWorker,
  forceStopDebugWorker,
  setOutput,
}) {
  const sessionState = useRuntimeSessionState()
  const editorState = useRuntimeEditorState()
  const editorSelectors = useRuntimeEditorSelectors()
  const { setRuntimeSessionField } = useRuntimeSessionActions()
  const { setRuntimeEditorField } = useRuntimeEditorActions()
  const { dispatchRuntimeEditorCommand } = useRuntimeEditorCommands()
  const {
    onUploadElf,
    switchToEditMode,
    buildAsmAndInitDebug,
    stepElfDebug,
    stepElfDebugLine,
    runElfDebug,
    onToolbarReset,
    forceStopDebug,
  } = useRuntimeDebugActions({
    resolveConfigText,
    callDebugWorker,
    forceStopDebugWorker,
    setOutput,
  })

  const topBarClass = isDark ? 'border-b border-slate-700 bg-slate-800' : 'border-b border-slate-200 bg-slate-50'
  const topBarAltClass = isDark ? 'border-b border-slate-700 bg-slate-800/80' : 'border-b border-slate-200 bg-slate-50/90'
  const controlLabelClass = isDark ? 'text-[11px] font-medium text-slate-300' : 'text-[11px] font-medium text-slate-700'
  const controlInputClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500'
    : 'rounded border border-slate-300 bg-white text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400'
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400'
  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'
  const uploadInputRef = useRef(null)

  const hasExpandedSource = Boolean(
    editorState.expandedAsmSourceInput && editorState.expandedAsmSourceInput.trim()
  )
  const uploadDisasmLines = editorState.uploadDisasmInput
    ? editorState.uploadDisasmInput.split('\n').length
    : 0
  const canInitFromCurrentMode = sessionState.runtimeInputMode === 'upload'
    ? Boolean(sessionState.uploadElfFile)
    : Boolean(editorState.asmSourceInput.trim())

  const openUploadPicker = () => {
    uploadInputRef.current?.click()
  }

  const openEditorTab = (tab) => {
    dispatchRuntimeEditorCommand(createOpenTabCommand(tab))
  }

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept=".elf,application/octet-stream"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          if (file) {
            onUploadElf(file)
            setRuntimeSessionField('runtimeInputMode', 'upload')
            openEditorTab('upload-disasm')
          }
          event.target.value = ''
        }}
      />
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarClass}`}>
        <span className={controlLabelClass}>Mode</span>
        <div className={`inline-flex rounded-md border p-0.5 ${isDark ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}>
          <button
            type="button"
            onClick={switchToEditMode}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${sessionState.runtimeInputMode === 'edit' ? tabActiveClass : tabInactiveClass}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setRuntimeSessionField('runtimeInputMode', 'upload')
              openEditorTab('upload-disasm')
            }}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${sessionState.runtimeInputMode === 'upload' ? tabActiveClass : tabInactiveClass}`}
          >
            Upload
          </button>
        </div>
        <label className={controlLabelClass}>
          Reset Config
          <select
            defaultValue=""
            onChange={async (event) => {
              const nextPath = event.target.value
              if (!nextPath) {
                return
              }
              setConfigTemplatePath(nextPath)
              await resetConfigFromTemplatePath(nextPath)
              event.target.value = ''
            }}
            disabled={configsState.state !== 'hasData'}
            className={`ml-2 h-8 px-2 text-[11px] ${controlInputClass}`}
          >
            <option value="">Reset Config</option>
            {configsState.state === 'hasData' && configsState.data.map((cfg) => (
              <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
            ))}
            {configsState.state === 'loading' && <option value="">Loading configs...</option>}
            {configsState.state === 'hasError' && <option value="">Failed to load configs</option>}
          </select>
        </label>
        {sessionState.uploadElfFile && (
          <span className={`inline-flex max-w-[280px] items-center truncate rounded px-2 py-1 text-[11px] font-mono ${
            isDark ? 'border border-slate-600 bg-slate-900 text-slate-300' : 'border border-slate-300 bg-white text-slate-700'
          }`}>
            {sessionState.debugBusy && sessionState.runtimeInputMode === 'upload' && (
              <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            <span className="truncate">{sessionState.uploadElfFile.name}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onToolbarReset}
          disabled={sessionState.debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Reset
        </button>
        <span className={`ml-auto rounded px-2 py-1 text-[11px] font-mono ${isDark ? 'border border-slate-600 bg-slate-900 text-slate-300' : 'border border-slate-300 bg-white text-slate-700'}`}>
          {editorSelectors.activeRuntimeEditorLine ? (
            <button
              type="button"
              onClick={() => {
                const command = createFocusLineCommand(editorSelectors.activeRuntimeEditorLine)
                if (command) {
                  dispatchRuntimeEditorCommand(command)
                }
              }}
              className="font-mono hover:underline"
            >
              {`line ${editorSelectors.activeRuntimeEditorLine}`}
            </button>
          ) : 'line -'}
        </span>
      </div>

      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarAltClass}`}>
        {sessionState.runtimeInputMode === 'edit' && (
          <>
            <label className={controlLabelClass}>
              -march
              <input
                value={editorState.gasMarchInput}
                onChange={(event) => setRuntimeEditorField('gasMarchInput', event.target.value)}
                className={`ml-2 h-8 w-28 px-2 font-mono text-[11px] ${controlInputClass}`}
              />
            </label>
            <label className={controlLabelClass}>
              -mabi
              <input
                value={editorState.gasAbiInput}
                onChange={(event) => setRuntimeEditorField('gasAbiInput', event.target.value)}
                className={`ml-2 h-8 w-16 px-2 font-mono text-[11px] ${controlInputClass}`}
              />
            </label>
            <button
              type="button"
              onClick={buildAsmAndInitDebug}
              disabled={sessionState.debugBusy}
              className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Build + Init
            </button>
          </>
        )}
        {sessionState.runtimeInputMode === 'upload' && (
          <button
            type="button"
            onClick={openUploadPicker}
            disabled={sessionState.debugBusy}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {sessionState.uploadElfFile ? 'Replace ELF' : 'Choose ELF'}
          </button>
        )}
        <button
          type="button"
          onClick={() => stepElfDebug(1)}
          disabled={!sessionState.debugReady || sessionState.debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Step
        </button>
        <button
          type="button"
          onClick={stepElfDebugLine}
          disabled={!sessionState.debugReady || sessionState.debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Next Line
        </button>
        <input
          type="number"
          min="1"
          step="1"
          value={sessionState.stepBatchInput}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, '')
            setRuntimeSessionField('stepBatchInput', next)
          }}
          className={`h-8 w-16 px-2 text-center text-[11px] font-semibold ${controlInputClass}`}
        />
        <button
          type="button"
          onClick={() => {
            const parsed = Number.parseInt(sessionState.stepBatchInput, 10)
            stepElfDebug(Number.isFinite(parsed) && parsed > 0 ? parsed : 1)
          }}
          disabled={!sessionState.debugReady || sessionState.debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Step ×N
        </button>
        <button
          type="button"
          onClick={runElfDebug}
          disabled={sessionState.debugBusy || (!sessionState.debugReady && !canInitFromCurrentMode)}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Run
        </button>
        <button
          type="button"
          onClick={forceStopDebug}
          disabled={!sessionState.debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Force Stop
        </button>
      </div>

      <div className={`flex items-center px-2 py-1.5 ${topBarClass}`}>
        {sessionState.runtimeInputMode === 'edit' ? (
          <>
            <button
              type="button"
              onClick={() => openEditorTab('program')}
              className={`rounded px-3 py-1 text-xs font-medium ${editorSelectors.runtimeActiveEditorTab === 'program' ? tabActiveClass : tabInactiveClass}`}
            >
              program.S
            </button>
            <button
              type="button"
              onClick={() => openEditorTab('config')}
              className={`ml-1 rounded px-3 py-1 text-xs font-medium ${editorSelectors.runtimeActiveEditorTab === 'config' ? tabActiveClass : tabInactiveClass}`}
            >
              config.json
            </button>
            <button
              type="button"
              onClick={() => openEditorTab('linker')}
              className={`ml-1 rounded px-3 py-1 text-xs font-medium ${editorSelectors.runtimeActiveEditorTab === 'linker' ? tabActiveClass : tabInactiveClass}`}
            >
              link.ld
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => openEditorTab('upload-disasm')}
            className={`rounded px-3 py-1 text-xs font-medium ${editorSelectors.runtimeActiveEditorTab === 'upload-disasm' ? tabActiveClass : tabInactiveClass}`}
          >
            disasm.S
          </button>
        )}
        <span className={`ml-auto text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {sessionState.runtimeInputMode === 'upload'
            ? (sessionState.uploadElfFile
              ? `ELF: ${sessionState.uploadElfFile.name}${uploadDisasmLines > 0 ? ` (${uploadDisasmLines} lines)` : ''}`
              : 'Upload an ELF to inspect')
            : editorState.editEditorTab === 'linker' && sessionState.debugReady
              ? 'link.ld editing mode'
              : editorState.editEditorTab === 'config'
                ? 'config.json editing mode'
              : hasExpandedSource && editorSelectors.activeExpandedSourceLine
                ? `objdump line ${editorSelectors.activeExpandedSourceLine}`
                : ''}
        </span>
      </div>
    </>
  )
}
