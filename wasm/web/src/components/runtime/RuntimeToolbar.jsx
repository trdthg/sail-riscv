import { useRef } from 'react';

export function RuntimeToolbar({
  isDark,
  configPath,
  setConfigPath,
  configsState,
  runtimeInputMode,
  setRuntimeInputMode,
  gasMarchInput,
  setGasMarchInput,
  gasAbiInput,
  setGasAbiInput,
  buildAsmAndInitDebug,
  debugBusy,
  activeSourceLine,
  onUploadElf,
  elfFile,
  stepElfDebug,
  debugReady,
  stepBatchInput,
  setStepBatchInput,
  runElfDebug,
  onToolbarReset,
  asmSourceInput,
  activeEditorTab,
  setActiveEditorTab,
  expandedAsmSourceInput,
  activeExpandedSourceLine,
  uploadDisasmInput,
}) {
  const topBarClass = isDark ? 'border-b border-slate-700 bg-slate-800' : 'border-b border-slate-200 bg-slate-50';
  const topBarAltClass = isDark ? 'border-b border-slate-700 bg-slate-800/80' : 'border-b border-slate-200 bg-slate-50/90';
  const controlLabelClass = isDark ? 'text-[11px] font-medium text-slate-300' : 'text-[11px] font-medium text-slate-700';
  const controlInputClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500'
    : 'rounded border border-slate-300 bg-white text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400';
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400';
  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white';
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200';
  const uploadInputRef = useRef(null);

  const hasExpandedSource = Boolean(expandedAsmSourceInput && expandedAsmSourceInput.trim());
  const uploadDisasmLines = uploadDisasmInput ? uploadDisasmInput.split('\n').length : 0;
  const canInitFromCurrentMode = runtimeInputMode === 'upload'
    ? Boolean(elfFile)
    : Boolean(elfFile || asmSourceInput.trim());

  const openUploadPicker = () => {
    setRuntimeInputMode('upload');
    setActiveEditorTab('upload-disasm');
    uploadInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept=".elf,application/octet-stream"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (file) {
            onUploadElf(file);
            setRuntimeInputMode('upload');
            setActiveEditorTab('upload-disasm');
          }
          event.target.value = '';
        }}
      />
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarClass}`}>
        <span className={controlLabelClass}>Mode</span>
        <div className={`inline-flex rounded-md border p-0.5 ${isDark ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}>
          <button
            type="button"
            onClick={() => {
              setRuntimeInputMode('edit');
              setActiveEditorTab('program');
            }}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${runtimeInputMode === 'edit' ? tabActiveClass : tabInactiveClass}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={openUploadPicker}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${runtimeInputMode === 'upload' ? tabActiveClass : tabInactiveClass}`}
          >
            Upload
          </button>
        </div>
        <label className={controlLabelClass}>
          Config
          <select
            value={configPath}
            onChange={(event) => setConfigPath(event.target.value)}
            disabled={configsState.state !== 'hasData'}
            className={`ml-2 h-8 px-2 text-[11px] ${controlInputClass}`}
          >
            <option value="/config.json">runtime config (edited)</option>
            {configsState.state === 'hasData' && configsState.data.map((cfg) => (
              <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
            ))}
            {configsState.state === 'loading' && <option value="">Loading configs...</option>}
            {configsState.state === 'hasError' && <option value="">Failed to load configs</option>}
          </select>
        </label>
        {elfFile && (
          <span className={`inline-flex max-w-[280px] items-center truncate rounded px-2 py-1 text-[11px] font-mono ${
            isDark ? 'border border-slate-600 bg-slate-900 text-slate-300' : 'border border-slate-300 bg-white text-slate-700'
          }`}>
            {debugBusy && runtimeInputMode === 'upload' && (
              <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            <span className="truncate">{elfFile.name}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onToolbarReset}
          disabled={debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Reset
        </button>
        <span className={`ml-auto rounded px-2 py-1 text-[11px] font-mono ${isDark ? 'border border-slate-600 bg-slate-900 text-slate-300' : 'border border-slate-300 bg-white text-slate-700'}`}>
          {activeSourceLine ? `line ${activeSourceLine}` : 'line -'}
        </span>
      </div>

      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarAltClass}`}>
        {runtimeInputMode === 'edit' && (
          <>
            <label className={controlLabelClass}>
              -march
              <input
                value={gasMarchInput}
                onChange={(event) => setGasMarchInput(event.target.value)}
                className={`ml-2 h-8 w-28 px-2 font-mono text-[11px] ${controlInputClass}`}
              />
            </label>
            <label className={controlLabelClass}>
              -mabi
              <input
                value={gasAbiInput}
                onChange={(event) => setGasAbiInput(event.target.value)}
                className={`ml-2 h-8 w-16 px-2 font-mono text-[11px] ${controlInputClass}`}
              />
            </label>
            <button
              type="button"
              onClick={buildAsmAndInitDebug}
              disabled={debugBusy}
              className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Build + Init
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => stepElfDebug(1)}
          disabled={!debugReady || debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Step
        </button>
        <input
          type="number"
          min="1"
          step="1"
          value={stepBatchInput}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, '');
            setStepBatchInput(next);
          }}
          className={`h-8 w-16 px-2 text-center text-[11px] font-semibold ${controlInputClass}`}
        />
        <button
          type="button"
          onClick={() => {
            const parsed = Number.parseInt(stepBatchInput, 10);
            stepElfDebug(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
          }}
          disabled={!debugReady || debugBusy}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Step ×N
        </button>
        <button
          type="button"
          onClick={runElfDebug}
          disabled={debugBusy || (!debugReady && !canInitFromCurrentMode)}
          className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Run
        </button>
      </div>

      <div className={`flex items-center px-2 py-1.5 ${topBarClass}`}>
        {runtimeInputMode === 'edit' ? (
          <>
            <button
              type="button"
              onClick={() => setActiveEditorTab('program')}
              className={`rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'program' ? tabActiveClass : tabInactiveClass}`}
            >
              program.S
            </button>
            <button
              type="button"
              onClick={() => setActiveEditorTab('expanded')}
              disabled={!hasExpandedSource}
              className={`ml-1 rounded px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${activeEditorTab === 'expanded' ? tabActiveClass : tabInactiveClass}`}
            >
              expanded.S
            </button>
            <button
              type="button"
              onClick={() => setActiveEditorTab('linker')}
              className={`ml-1 rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'linker' ? tabActiveClass : tabInactiveClass}`}
            >
              link.ld
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setActiveEditorTab('upload-disasm')}
            className={`rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'upload-disasm' ? tabActiveClass : tabInactiveClass}`}
          >
            disasm.S
          </button>
        )}
        <span className={`ml-auto text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {runtimeInputMode === 'upload'
            ? (elfFile
              ? `ELF: ${elfFile.name}${uploadDisasmLines > 0 ? ` (${uploadDisasmLines} lines)` : ''}`
              : 'Upload an ELF to inspect')
            : activeEditorTab === 'expanded' && activeExpandedSourceLine
              ? `expanded line ${activeExpandedSourceLine}`
              : elfFile
                ? `ELF: ${elfFile.name}`
                : 'No ELF selected'}
        </span>
      </div>
    </>
  );
}
