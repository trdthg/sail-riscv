import Editor from '@monaco-editor/react';

export function RuntimePage({
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
  return (
    <main className="w-full min-h-[560px] border-t border-slate-300 bg-slate-100 lg:grid lg:h-[calc(100vh-10rem)] lg:grid-cols-[1fr_420px]">
      <section className="flex min-h-0 flex-col overflow-hidden border-r border-slate-700 bg-slate-900 text-slate-100">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
          <label className="text-[11px] font-medium text-slate-300">
            Config
            <select
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              disabled={configsState.state !== 'hasData'}
              className="ml-2 h-8 rounded border border-slate-600 bg-slate-900 px-2 text-[11px] text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="/config.json">runtime config (edited)</option>
              {configsState.state === 'hasData' && configsState.data.map((cfg) => (
                <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
              ))}
              {configsState.state === 'loading' && <option value="">Loading configs...</option>}
              {configsState.state === 'hasError' && <option value="">Failed to load configs</option>}
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-300">
            -march
            <input
              value={gasMarchInput}
              onChange={(event) => setGasMarchInput(event.target.value)}
              className="ml-2 h-8 w-28 rounded border border-slate-600 bg-slate-900 px-2 font-mono text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[11px] font-medium text-slate-300">
            -mabi
            <input
              value={gasAbiInput}
              onChange={(event) => setGasAbiInput(event.target.value)}
              className="ml-2 h-8 w-16 rounded border border-slate-600 bg-slate-900 px-2 font-mono text-[11px] text-slate-100"
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
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={buildAsmAndInitDebug}
            disabled={debugBusy}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Build + Init
          </button>
          <span className="ml-auto rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300">
            {activeSourceLine ? `line ${activeSourceLine}` : 'line -'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800/80 px-3 py-2">
          <label className="min-w-[200px] flex-1 text-[11px] font-medium text-slate-300">
            ELF file
            <input
              type="file"
              accept=".elf,application/octet-stream"
              onChange={(e) => setElfFile(e.target.files?.[0] || null)}
              className="ml-2 inline-block w-[250px] rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-[11px] file:text-slate-100 hover:file:bg-slate-600"
            />
          </label>
          <button
            type="button"
            onClick={initElfDebug}
            disabled={!elfFile || debugBusy}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Init ELF
          </button>
          <button
            type="button"
            onClick={() => stepElfDebug(1)}
            disabled={!debugReady || debugBusy}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="h-8 w-16 rounded border border-slate-600 bg-slate-900 px-2 text-center text-[11px] font-semibold text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="button"
            onClick={() => {
              const parsed = Number.parseInt(stepBatchInput, 10);
              stepElfDebug(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
            }}
            disabled={!debugReady || debugBusy}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Step ×N
          </button>
          <button
            type="button"
            onClick={runElfDebug}
            disabled={debugBusy || (!debugReady && !elfFile && !asmSourceInput.trim())}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run
          </button>
          <button
            type="button"
            onClick={resetElfDebug}
            disabled={debugBusy}
            className="h-8 rounded border border-slate-600 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>

        <div className="flex items-center border-b border-slate-700 bg-slate-800 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setActiveEditorTab('program')}
            className={`rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'program' ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            program.S
          </button>
          <button
            type="button"
            onClick={() => setActiveEditorTab('linker')}
            className={`ml-1 rounded px-3 py-1 text-xs font-medium ${activeEditorTab === 'linker' ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            link.ld
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
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
            theme="vs-dark"
          />
        </div>

        <div className="flex h-72 min-h-[220px] flex-col border-t border-slate-700 bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-700 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRuntimeLogTab('program')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'program' ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                Program Output
              </button>
              <button
                type="button"
                onClick={() => setRuntimeLogTab('summary')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'summary' ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                Runtime Summary
              </button>
              <button
                type="button"
                onClick={() => setRuntimeLogTab('trace')}
                className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'trace' ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                Sail Trace
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOutput('')}
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-400"
            >
              Clear
            </button>
          </div>
          <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
            {runtimeLogText}
          </pre>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto bg-slate-50 p-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
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

          <div className="rounded-xl border border-slate-200 bg-white p-3">
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
          {elfRunStatus && (
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              {elfRunStatus}
            </p>
          )}
          {configsState.state === 'hasError' && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
            </p>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Run Context</p>
            <p className="text-xs text-slate-600">
              Left pane is non-scrolling at page level; editor and log panes scroll independently.
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
