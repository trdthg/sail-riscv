import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

export function RuntimePage({
  isDark,
  editorTheme,
  configPath,
  setConfigPath,
  configsState,
  gasMarchInput,
  setGasMarchInput,
  gasAbiInput,
  setGasAbiInput,
  setAsmSourceInput,
  setLinkerScriptInput,
  setStepBatchInput,
  setElfFile,
  stepBatchInput,
  activeSourceLine,
  debugBusy,
  buildAsmAndInitDebug,
  initElfDebug,
  stepElfDebug,
  runElfDebug,
  resetElfDebug,
  debugReady,
  elfFile,
  asmSourceInput,
  activeEditorTab,
  setActiveEditorTab,
  runtimeEditorLanguage,
  runtimeEditorValue,
  handleRuntimeEditorChange,
  handleRuntimeEditorMount,
  runtimeLogTab,
  setRuntimeLogTab,
  setOutput,
  runtimeLogText,
  debugState,
  registerView,
  setRegisterView,
  debugRegisterRows,
  elfRunStatus,
  DEFAULT_DEBUG_ASM_SOURCE,
  DEFAULT_DEBUG_LINKER_SCRIPT,
}) {
  const mainRef = useRef(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const shellClass = isDark
    ? 'border-r border-slate-700 bg-slate-900 text-slate-100'
    : 'border-r border-slate-300 bg-white text-slate-900';
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
  const logPaneClass = isDark ? 'border-t border-slate-700 bg-slate-950' : 'border-t border-slate-300 bg-slate-100';
  const logTextClass = isDark ? 'text-slate-100' : 'text-slate-800';
  const rightCardClass = isDark ? 'rounded-xl border border-slate-700 bg-slate-800 p-3' : 'rounded-xl border border-slate-200 bg-white p-3';

  useEffect(() => {
    if (!isResizing) return undefined;
    const onMouseMove = (event) => {
      const container = mainRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const relativeX = event.clientX - bounds.left;
      const nextRatio = (relativeX / bounds.width) * 100;
      const clamped = Math.max(28, Math.min(72, nextRatio));
      setSplitRatio(clamped);
    };
    const onMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <div className={`box-border h-full w-full min-h-0 overflow-hidden border-t flex flex-col ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-300 bg-slate-100'}`}>
      <main
        ref={mainRef}
        className="flex-1 w-full min-h-0 lg:grid"
        style={{ gridTemplateColumns: `${splitRatio}fr 8px ${100 - splitRatio}fr` }}
      >
      <section className={`flex min-h-0 flex-col overflow-hidden ${shellClass}`}>
        <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarClass}`}>
          <label className={controlLabelClass}>
            Config
            <select
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
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
            onClick={() => {
              setAsmSourceInput(DEFAULT_DEBUG_ASM_SOURCE);
              setLinkerScriptInput(DEFAULT_DEBUG_LINKER_SCRIPT);
              setGasMarchInput('rv64imac');
              setGasAbiInput('lp64');
            }}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass}`}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={buildAsmAndInitDebug}
            disabled={debugBusy}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Build + Init
          </button>
          <span className={`ml-auto rounded px-2 py-1 text-[11px] font-mono ${isDark ? 'border border-slate-600 bg-slate-900 text-slate-300' : 'border border-slate-300 bg-white text-slate-700'}`}>
            {activeSourceLine ? `line ${activeSourceLine}` : 'line -'}
          </span>
        </div>

        <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${topBarAltClass}`}>
          <label className={`min-w-[200px] flex-1 ${controlLabelClass}`}>
            ELF file
            <input
              type="file"
              accept=".elf,application/octet-stream"
              onChange={(e) => setElfFile(e.target.files?.[0] || null)}
              className={`ml-2 inline-block w-[250px] px-2 py-1 text-[11px] ${controlInputClass} ${isDark ? 'file:bg-slate-700 file:text-slate-100 hover:file:bg-slate-600' : 'file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300'} file:mr-2 file:rounded file:border-0 file:px-2 file:py-1 file:text-[11px]`}
            />
          </label>
          <button
            type="button"
            onClick={initElfDebug}
            disabled={!elfFile || debugBusy}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Init ELF
          </button>
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
            disabled={debugBusy || (!debugReady && !elfFile && !asmSourceInput.trim())}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Run
          </button>
          <button
            type="button"
            onClick={resetElfDebug}
            disabled={debugBusy}
            className={`h-8 px-3 text-[11px] font-semibold ${controlButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Reset
          </button>
        </div>

        <div className={`flex items-center px-2 py-1.5 ${topBarClass}`}>
          <button
            type="button"
            onClick={() => setActiveEditorTab('program')}
            className={`rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'program' ? tabActiveClass : tabInactiveClass}`}
          >
            program.S
          </button>
          <button
            type="button"
            onClick={() => setActiveEditorTab('linker')}
            className={`ml-1 rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'linker' ? tabActiveClass : tabInactiveClass}`}
          >
            link.ld
          </button>
          <span className={`ml-auto text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {elfFile ? `ELF: ${elfFile.name}` : 'No ELF selected'}
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <Editor
            language={runtimeEditorLanguage}
            value={runtimeEditorValue}
            onChange={handleRuntimeEditorChange}
            onMount={handleRuntimeEditorMount}
            options={{
              fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: 'off',
              tabSize: 2,
              smoothScrolling: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbersMinChars: 3,
            }}
            theme={editorTheme}
          />
        </div>

        <div className={`flex h-72 min-h-[220px] flex-col ${logPaneClass}`}>
          <div className={`flex items-center justify-between px-2 py-1.5 ${isDark ? 'border-b border-slate-700' : 'border-b border-slate-300 bg-slate-50'}`}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRuntimeLogTab('program')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'program' ? tabActiveClass : tabInactiveClass}`}
              >
                Program Output
              </button>
              <button
                type="button"
                onClick={() => setRuntimeLogTab('summary')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'summary' ? tabActiveClass : tabInactiveClass}`}
              >
                Runtime Summary
              </button>
              <button
                type="button"
                onClick={() => setRuntimeLogTab('trace')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'trace' ? tabActiveClass : tabInactiveClass}`}
              >
                Sail Trace
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOutput('')}
              className={`rounded px-2 py-1 text-[11px] ${controlButtonClass}`}
            >
              Clear
            </button>
          </div>
          <pre className={`flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${logTextClass}`}>
            {runtimeLogText}
          </pre>
        </div>
      </section>

      <div
        className={`hidden lg:block cursor-col-resize ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'}`}
        onMouseDown={() => setIsResizing(true)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
      />

      <aside className={`min-h-0 overflow-y-auto p-4 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
        <div className="space-y-4">
          <div className={rightCardClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Debug State</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className={`rounded-full border px-2 py-0.5 ${debugReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                  {debugReady ? 'ready' : 'not initialized'}
                </span>
                {debugBusy && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                    busy
                  </span>
                )}
              </div>
            </div>
            {debugState ? (
              <>
                <div className="mt-2 grid gap-2 text-[11px] text-slate-700 md:grid-cols-2">
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">pc: {debugState.pc || '-'}</div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">step: {debugState.step ?? '-'}</div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">halted: {String(Boolean(debugState.halted))}</div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">exit: {debugState.exitCode ?? '-'}</div>
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">line: {debugState.sourceLine ?? '-'}</div>
                </div>
                {debugState.sourceFile && (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                    source: {debugState.sourceFile}
                  </div>
                )}
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                  {`inst: [${debugState.instWidth ?? '-'}] ${debugState.instHex || '-'}  ${debugState.disasm || '-'}`}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">No debug state yet.</p>
            )}
          </div>

          <div className={rightCardClass}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Registers</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRegisterView('x')}
                  className={`rounded border px-2 py-1 text-[11px] ${registerView === 'x' ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  X
                </button>
                <button
                  type="button"
                  onClick={() => setRegisterView('f')}
                  className={`rounded border px-2 py-1 text-[11px] ${registerView === 'f' ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  F
                </button>
              </div>
            </div>
            <div className="grid max-h-72 gap-1 overflow-auto md:grid-cols-2">
              {debugRegisterRows.length > 0 ? debugRegisterRows.map((row) => (
                <div
                  key={row.key}
                  className={`flex items-center justify-between rounded border px-2 py-1 font-mono text-[11px] ${
                    row.changed
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>
                    {row.name}
                    {row.alias ? ` (${row.alias})` : ''}
                  </span>
                  <span>{row.value}</span>
                </div>
              )) : (
                <p className="text-[11px] text-slate-500">No registers available.</p>
              )}
            </div>
          </div>
          {configsState.state === 'hasError' && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
            </p>
          )}
        </div>
      </aside>
      </main>
      <div className={`box-border h-8 min-h-8 flex-shrink-0 overflow-hidden border-t px-3 text-[11px] font-medium flex items-center ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}>
        <span className="block min-w-0 w-full overflow-hidden text-ellipsis whitespace-nowrap">
          {elfRunStatus || (debugBusy ? 'Running...' : 'Ready')}
        </span>
      </div>
    </div>
  );
}
