type LogsPaneArgs = {
  isDark: boolean
  runtimeLogTab: string
  setRuntimeLogTab: (tab: 'status' | 'build' | 'program' | 'summary' | 'trace') => void
  runtimeLogText: string
  setOutput: (value: string) => void
}

export function LogsPane({
  isDark,
  runtimeLogTab,
  setRuntimeLogTab,
  runtimeLogText,
  setOutput,
}: LogsPaneArgs) {
  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400'
  const logPaneClass = isDark ? 'border-t border-slate-700 bg-slate-950' : 'border-t border-slate-300 bg-slate-100'
  const logTextClass = isDark ? 'text-slate-100' : 'text-slate-800'

  return (
    <div className={`min-h-0 flex h-full flex-col ${logPaneClass}`}>
      <div className={`flex items-center justify-between px-2 py-1.5 ${isDark ? 'border-b border-slate-700' : 'border-b border-slate-300 bg-slate-50'}`}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRuntimeLogTab('status')}
            className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'status' ? tabActiveClass : tabInactiveClass}`}
          >
            Status
          </button>
          <button
            type="button"
            onClick={() => setRuntimeLogTab('build')}
            className={`rounded px-3 py-1 text-[11px] font-medium ${runtimeLogTab === 'build' ? tabActiveClass : tabInactiveClass}`}
          >
            Build Errors
          </button>
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
      <div className="min-h-0 flex-1">
        <pre
          className={`m-0 h-full overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${logTextClass}`}
        >
          {runtimeLogText}
        </pre>
      </div>
    </div>
  )
}
