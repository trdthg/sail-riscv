export function AppHeader({
  isDark,
  activePage,
  setActivePage,
  setTheme,
  brandTitle,
  brandSubtitle,
}) {
  return (
    <header className={`flex w-full items-center gap-3 border-b px-4 py-3 animate-rise ${
      isDark ? 'border-slate-800 bg-slate-950/85' : 'border-slate-200 bg-white/85'
    }`}>
      <div className={`flex h-8 items-center rounded-lg px-3 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-sm ${
        isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-900 text-white'
      }`}>
        sail-riscv
      </div>
      <div className={`min-w-0 flex-1 truncate text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {brandTitle} · {brandSubtitle}
      </div>
      <div className={`inline-flex rounded-xl border p-1 shadow-sm ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white/80'}`}>
        <button
          type="button"
          onClick={() => setActivePage('explorer')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
            activePage === 'explorer'
              ? 'bg-slate-900 text-white'
              : isDark
                ? 'text-slate-300 hover:bg-slate-800'
                : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Instruction
        </button>
        <button
          type="button"
          onClick={() => setActivePage('runtime')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
            activePage === 'runtime'
              ? 'bg-slate-900 text-white'
              : isDark
                ? 'text-slate-300 hover:bg-slate-800'
                : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Asm Runtime
        </button>
      </div>
      <button
        type="button"
        onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${
          isDark
            ? 'border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500'
            : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300'
        }`}
      >
        {isDark ? 'Dark' : 'Light'}
      </button>
    </header>
  );
}
