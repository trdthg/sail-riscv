import { createPortal } from 'react-dom';

import { BinaryInput } from '../components/BinaryInput.jsx';

export function ExplorerPage({
  isDark,
  configPath,
  setConfigPath,
  configsState,
  decodeMode,
  setDecodeMode,
  hexInput,
  setHexInput,
  binInput,
  setBinInput,
  assemblyInput,
  setAssemblyInput,
  assemblyStatus,
  assemblyStatusStyles,
  assemblyMessage,
  setAssemblyMessage,
  asmInputRef,
  asmSuggestions,
  asmOpen,
  setAsmOpen,
  asmHighlight,
  setAsmHighlight,
  asmDropdownPos,
  setAsmFocused,
  applyAsmSuggestion,
  runPrintIsa,
  isaState,
  currentInstruction,
  renderUdbValue,
  configEditor,
  setConfigEditor,
  configEditorStatus,
  applyTimerRef,
  applyConfigToRuntime,
  MAX_HEX,
  lastEditedRef,
  clampHex,
  hexToBin,
  formatBinWithCursor,
  binToHex,
  bitLayout,
  binInputRef,
}) {
  return (
    <main className={`mx-auto grid w-full max-w-[1400px] gap-8 px-6 pb-12 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1.08fr_0.92fr] ${isDark ? 'text-slate-100' : ''}`}>
      <section className="space-y-6">
        <div className={`rounded-3xl border p-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur animate-rise animate-rise-delay-1 ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/80'}`}>
          <div className="mb-6 space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl font-serif">
              Instruction Encode / Decode
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              Left side is focused on single-instruction assembly/encoding conversion. Right side shows full instruction metadata.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Config
              <select
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                disabled={configsState.state !== 'hasData'}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="/config.json">runtime config (edited)</option>
                {configsState.state === 'hasData' && configsState.data.map((cfg) => (
                  <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
                ))}
                {configsState.state === 'loading' && <option value="">Loading configs...</option>}
                {configsState.state === 'hasError' && <option value="">Failed to load configs</option>}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              Decode mode
              <select
                value={decodeMode}
                onChange={(e) => setDecodeMode(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="auto">Auto (by length)</option>
                <option value="16">16-bit (compressed)</option>
                <option value="32">32-bit</option>
              </select>
            </label>

            <label className="relative space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              Hex instruction
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="e.g. 0x00008067"
                value={hexInput}
                onChange={(e) => {
                  lastEditedRef.current = 'hex';
                  const clamped = clampHex(e.target.value);
                  const display = clamped ? `0x${clamped}` : '';
                  setHexInput(display);
                  const nextBin = hexToBin(display);
                  if (nextBin !== null) {
                    setBinInput(nextBin);
                  }
                }}
                maxLength={MAX_HEX + 2}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <BinaryInput
              binInput={binInput}
              bitLayout={bitLayout}
              inputRef={binInputRef}
              onChange={(e) => {
                lastEditedRef.current = 'bin';
                const { value, selectionStart = 0 } = e.target;
                const { display, cursor } = formatBinWithCursor(value, selectionStart);
                setBinInput(display);
                const nextHex = binToHex(display);
                if (nextHex !== null) {
                  setHexInput(nextHex ? `0x${nextHex}` : '');
                }
                requestAnimationFrame(() => {
                  if (binInputRef.current) {
                    binInputRef.current.setSelectionRange(cursor, cursor);
                  }
                });
              }}
            />

            <label className="relative z-30 space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              <div className="flex items-center justify-between">
                <span>Assembly</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${assemblyStatusStyles[assemblyStatus] || assemblyStatusStyles.waiting}`}
                >
                  {assemblyStatus}
                </span>
              </div>
              <input
                ref={asmInputRef}
                value={assemblyInput}
                placeholder="e.g. addi x1, x2, 4"
                onChange={(e) => {
                  lastEditedRef.current = 'asm';
                  setAssemblyMessage('');
                  setAssemblyInput(e.target.value);
                }}
                onFocus={() => {
                  setAsmFocused(true);
                  if (asmSuggestions.length) setAsmOpen(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setAsmFocused(false);
                    setAsmOpen(false);
                  }, 100);
                }}
                onKeyDown={(e) => {
                  if (!asmOpen || asmSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setAsmHighlight((idx) => (idx + 1) % asmSuggestions.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setAsmHighlight((idx) => (idx - 1 + asmSuggestions.length) % asmSuggestions.length);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    applyAsmSuggestion(asmSuggestions[asmHighlight]);
                  } else if (e.key === 'Escape') {
                    setAsmOpen(false);
                  }
                }}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-xs text-slate-900 shadow-sm focus:outline-none"
              />
              {asmOpen && asmSuggestions.length > 0 && asmDropdownPos &&
                createPortal(
                  <div
                    className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
                    style={{
                      position: 'fixed',
                      left: asmDropdownPos.left,
                      top: asmDropdownPos.top,
                      width: asmDropdownPos.width,
                      zIndex: 1000,
                    }}
                  >
                    {asmSuggestions.map((suggestion, idx) => (
                      <button
                        key={`${suggestion.type}-${suggestion.label}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyAsmSuggestion(suggestion);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                          idx === asmHighlight
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-mono">{suggestion.label}</span>
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              {assemblyMessage && <p className="text-xs text-rose-600">{assemblyMessage}</p>}
            </label>
          </div>
        </div>

        <div className={`rounded-2xl border p-5 text-sm shadow-sm ${isDark ? 'border-slate-700 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-600'}`}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
            <span>ISA string</span>
            <button
              onClick={runPrintIsa}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 whitespace-pre-wrap break-all">
            {isaState.state === 'loading' && 'Loading...'}
            {isaState.state === 'hasError' && 'Failed to load'}
            {isaState.state === 'hasData' && (isaState.data || 'Not loaded')}
          </div>
        </div>

        {configsState.state === 'hasError' && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
          </p>
        )}
      </section>

      <aside className="space-y-6">
        <div className={`rounded-3xl border p-6 text-sm shadow-sm ${isDark ? 'border-slate-700 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-600'}`}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
            <span>Instruction</span>
            {currentInstruction?.inst?.definedBy?.extension?.name && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {currentInstruction.inst.definedBy.extension.name}
              </span>
            )}
          </div>
          {currentInstruction?.inst ? (
            <div className="mt-4 space-y-3 text-xs text-slate-700">
              <div>
                <p className="text-sm font-semibold text-slate-900">{currentInstruction.inst.name}</p>
                {currentInstruction.inst.longName && (
                  <p className="text-xs text-slate-500">{currentInstruction.inst.longName}</p>
                )}
              </div>
              {currentInstruction.inst.assembly && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Assembly</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">{currentInstruction.inst.name} {currentInstruction.inst.assembly}</p>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.description) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{renderUdbValue(currentInstruction.inst.description)}</p>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.access) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Access</p>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.inst.access)}
                  </pre>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.operation) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Operation</p>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.inst.operation)}
                  </pre>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.pseudoinstructions) && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Pseudoinstructions</p>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.inst.pseudoinstructions)}
                  </pre>
                </div>
              )}
              {currentInstruction.encoding && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Encoding</p>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.encoding)}
                  </pre>
                </div>
              )}
              {currentInstruction.inst.encodingRaw && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Encoding Raw</p>
                  <pre className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.inst.encodingRaw)}
                  </pre>
                </div>
              )}
              {currentInstruction.inst.full && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">YAML (Full)</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap">
                    {renderUdbValue(currentInstruction.inst.full)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">No instruction matched yet. Enter assembly or binary.</p>
          )}
        </div>

        <div className={`rounded-3xl border p-6 text-sm shadow-sm flex flex-col min-h-[520px] ${isDark ? 'border-slate-700 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-600'}`}>
          <h3 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl font-serif">Config editor</h3>
          <p className="mt-2 text-sm text-slate-600">
            Edit runtime config. Changes are auto-applied to <code className="text-slate-800">/config.json</code>.
          </p>
          <textarea
            className="mt-4 w-full flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs leading-relaxed text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="Load and edit config JSON here."
            value={configEditor}
            onChange={(e) => {
              const next = e.target.value;
              setConfigEditor(next);
              if (applyTimerRef.current) {
                clearTimeout(applyTimerRef.current);
              }
              applyTimerRef.current = setTimeout(() => {
                applyConfigToRuntime();
              }, 500);
            }}
          />
          {configEditorStatus && <p className="mt-3 text-xs text-slate-500">{configEditorStatus}</p>}
        </div>
      </aside>
    </main>
  );
}
