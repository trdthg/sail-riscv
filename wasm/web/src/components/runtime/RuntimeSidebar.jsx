export function RuntimeSidebar({
  isDark,
  debugReady,
  debugBusy,
  debugState,
  registerView,
  setRegisterView,
  debugRegisterRows,
  configsState,
}) {
  const rightCardClass = isDark ? 'rounded-lg border border-slate-700 bg-slate-900 p-3' : 'rounded-lg border border-slate-200 bg-white p-3';
  const registerActiveClass = isDark
    ? 'border-slate-500 bg-slate-700 text-slate-100'
    : 'border-slate-400 bg-slate-100 text-slate-900';
  const registerInactiveClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-300'
    : 'border-slate-200 bg-white text-slate-600';
  const registerChangedClass = isDark
    ? 'border-amber-500 bg-amber-950/40 text-amber-100'
    : 'border-amber-300 bg-amber-50 text-amber-900';
  const registerNormalClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-300'
    : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <aside className={`min-h-0 min-w-[320px] overflow-y-auto p-3 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
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
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>pc: {debugState.pc || '-'}</div>
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>step: {debugState.step ?? '-'}</div>
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>halted: {String(Boolean(debugState.halted))}</div>
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>exit: {debugState.exitCode ?? '-'}</div>
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>line: {debugState.sourceLine ?? '-'}</div>
                <div className={`rounded border px-2 py-1 font-mono ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>expanded: {debugState.expandedSourceLine ?? '-'}</div>
              </div>
              {debugState.sourceFile && (
                <div className={`mt-2 rounded border px-2 py-1 font-mono text-[11px] ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                  source: {debugState.sourceFile}
                </div>
              )}
              {debugState.expandedSourceFile && (
                <div className={`mt-2 rounded border px-2 py-1 font-mono text-[11px] ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                  expanded source: {debugState.expandedSourceFile}
                </div>
              )}
              {debugState.expandedSourceText && (
                <div className={`mt-2 rounded border px-2 py-1 font-mono text-[11px] ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                  expanded text: {debugState.expandedSourceText}
                </div>
              )}
              <div className={`mt-2 rounded border px-2 py-1 font-mono text-[11px] ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
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
                className={`rounded border px-2 py-1 text-[11px] ${registerView === 'x' ? registerActiveClass : registerInactiveClass}`}
              >
                X
              </button>
              <button
                type="button"
                onClick={() => setRegisterView('f')}
                className={`rounded border px-2 py-1 text-[11px] ${registerView === 'f' ? registerActiveClass : registerInactiveClass}`}
              >
                F
              </button>
            </div>
          </div>
          <div className="grid max-h-72 gap-1 overflow-auto md:grid-cols-2">
            {debugRegisterRows.length > 0 ? debugRegisterRows.map((row) => (
              <div
                key={row.key}
                className={`flex items-center justify-between rounded border px-2 py-1 font-mono text-[11px] ${row.changed ? registerChangedClass : registerNormalClass}`}
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
  );
}
