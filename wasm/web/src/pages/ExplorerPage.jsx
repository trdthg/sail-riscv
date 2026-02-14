import { createPortal } from 'react-dom';

import { BinaryInput } from '../components/BinaryInput.jsx';

const assemblyStatusStyles = {
  waiting: 'border-slate-200 bg-slate-50 text-slate-500',
  updating: 'border-amber-200 bg-amber-50 text-amber-700',
  updated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  empty: 'border-rose-200 bg-rose-50 text-rose-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

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
  autocompleteState,
  autocompleteMessage,
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
  const panelClass = isDark
    ? 'rounded-3xl border border-slate-700 bg-slate-900/80 text-slate-200 shadow-sm'
    : 'rounded-3xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm';
  const largePanelClass = `${panelClass} p-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur animate-rise animate-rise-delay-1`;
  const compactPanelClass = `${panelClass} p-6`;
  const inputClass = isDark
    ? 'h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm text-slate-100 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-700'
    : 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200';
  const mutedInputClass = isDark
    ? 'h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-sm font-medium text-slate-100 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-700'
    : 'h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200';
  const fieldLabelClass = isDark
    ? 'space-y-2 text-sm font-medium text-slate-300'
    : 'space-y-2 text-sm font-medium text-slate-700';
  const titleClass = isDark
    ? 'text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl font-serif'
    : 'text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl font-serif';
  const subtitleClass = isDark ? 'max-w-xl text-sm text-slate-400' : 'max-w-xl text-sm text-slate-600';
  const sectionHeaderClass = isDark
    ? 'text-[10px] uppercase tracking-[0.2em] text-slate-500'
    : 'text-[10px] uppercase tracking-[0.2em] text-slate-400';
  const sectionLabelClass = isDark
    ? 'text-[10px] uppercase tracking-[0.16em] text-slate-400'
    : 'text-[10px] uppercase tracking-[0.16em] text-slate-400';
  const codeBlockClass = isDark
    ? 'mt-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-200 whitespace-pre-wrap'
    : 'mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap';
  const codeTextClass = isDark ? 'font-mono text-xs text-slate-100' : 'font-mono text-xs text-slate-800';
  const badgeClass = isDark
    ? 'rounded-full border border-slate-600 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-300'
    : 'rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500';
  const buttonClass = isDark
    ? 'rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400'
    : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300';
  const dropdownClass = isDark
    ? 'max-h-56 overflow-auto rounded-xl border border-slate-600 bg-slate-900 shadow-lg'
    : 'max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg';
  const dropdownActiveClass = isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-900';
  const dropdownInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50';
  const helperTextClass = isDark ? 'text-xs text-slate-400' : 'text-xs text-slate-500';
  const noMatchClass = isDark ? 'mt-4 text-xs text-slate-400' : 'mt-4 text-xs text-slate-500';
  const autocompleteHintClass = autocompleteState === 'udb-error'
    ? 'text-xs text-rose-500'
    : helperTextClass;

  return (
    <main className={`mx-auto grid w-full max-w-[1400px] gap-8 px-6 pb-12 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1.08fr_0.92fr] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      <section className="space-y-6">
        <div className={largePanelClass}>
          <div className="mb-6 space-y-3">
            <h1 className={titleClass}>
              Instruction Encode / Decode
            </h1>
            <p className={subtitleClass}>
              Left side is focused on single-instruction assembly/encoding conversion. Right side shows full instruction metadata.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className={fieldLabelClass}>
              Config
              <select
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                disabled={configsState.state !== 'hasData'}
                className={inputClass}
              >
                <option value="/config.json">runtime config (edited)</option>
                {configsState.state === 'hasData' && configsState.data.map((cfg) => (
                  <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
                ))}
                {configsState.state === 'loading' && <option value="">Loading configs...</option>}
                {configsState.state === 'hasError' && <option value="">Failed to load configs</option>}
              </select>
            </label>

            <label className={fieldLabelClass}>
              Decode mode
              <select
                value={decodeMode}
                onChange={(e) => setDecodeMode(e.target.value)}
                className={inputClass}
              >
                <option value="auto">Auto (by length)</option>
                <option value="16">16-bit (compressed)</option>
                <option value="32">32-bit</option>
              </select>
            </label>

            <label className={`relative ${fieldLabelClass} md:col-span-2`}>
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
                className={mutedInputClass}
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

            <label className={`relative z-30 ${fieldLabelClass} md:col-span-2`}>
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
                className={`${inputClass} h-12 text-xs`}
              />
              {asmOpen && asmSuggestions.length > 0 && asmDropdownPos &&
                createPortal(
                  <div
                    className={dropdownClass}
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
                          idx === asmHighlight ? dropdownActiveClass : dropdownInactiveClass
                        }`}
                      >
                        <span className="font-mono">{suggestion.label}</span>
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              {autocompleteMessage && (
                <p className={autocompleteHintClass}>{autocompleteMessage}</p>
              )}
              {assemblyMessage && <p className="text-xs text-rose-600">{assemblyMessage}</p>}
            </label>
          </div>
        </div>

        <div className={`${panelClass} rounded-2xl p-5`}>
          <div className={`flex items-center justify-between ${sectionHeaderClass}`}>
            <span>ISA string</span>
            <button
              onClick={runPrintIsa}
              className={buttonClass}
            >
              Refresh
            </button>
          </div>
          <div className={codeBlockClass}>
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
        <div className={compactPanelClass}>
          <div className={`flex items-center justify-between ${sectionHeaderClass}`}>
            <span>Instruction</span>
            {currentInstruction?.inst?.definedBy?.extension?.name && (
              <span className={badgeClass}>
                {currentInstruction.inst.definedBy.extension.name}
              </span>
            )}
          </div>
          {currentInstruction?.inst ? (
            <div className="mt-4 space-y-4 text-xs">
              <div>
                <p className={isDark ? 'text-sm font-semibold text-slate-100' : 'text-sm font-semibold text-slate-900'}>{currentInstruction.inst.name}</p>
                {currentInstruction.inst.longName && (
                  <p className={helperTextClass}>{currentInstruction.inst.longName}</p>
                )}
              </div>
              {currentInstruction.inst.assembly && (
                <div>
                  <p className={sectionLabelClass}>Assembly</p>
                  <p className={`mt-1 ${codeTextClass}`}>{currentInstruction.inst.name} {currentInstruction.inst.assembly}</p>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.description) && (
                <div>
                  <p className={sectionLabelClass}>Description</p>
                  <p className={`mt-1 whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{renderUdbValue(currentInstruction.inst.description)}</p>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.access) && (
                <div>
                  <p className={sectionLabelClass}>Access</p>
                  <pre className={codeBlockClass}>
                    {renderUdbValue(currentInstruction.inst.access)}
                  </pre>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.operation) && (
                <div>
                  <p className={sectionLabelClass}>Operation</p>
                  <pre className={`${codeBlockClass} font-mono`}>
                    {renderUdbValue(currentInstruction.inst.operation)}
                  </pre>
                </div>
              )}
              {renderUdbValue(currentInstruction.inst.pseudoinstructions) && (
                <div>
                  <p className={sectionLabelClass}>Pseudoinstructions</p>
                  <pre className={codeBlockClass}>
                    {renderUdbValue(currentInstruction.inst.pseudoinstructions)}
                  </pre>
                </div>
              )}
              {currentInstruction.encoding && (
                <div>
                  <p className={sectionLabelClass}>Encoding</p>
                  <pre className={`${codeBlockClass} font-mono`}>
                    {renderUdbValue(currentInstruction.encoding)}
                  </pre>
                </div>
              )}
              {currentInstruction.inst.encodingRaw && (
                <div>
                  <p className={sectionLabelClass}>Encoding Raw</p>
                  <pre className={codeBlockClass}>
                    {renderUdbValue(currentInstruction.inst.encodingRaw)}
                  </pre>
                </div>
              )}
              {currentInstruction.inst.full && (
                <div>
                  <p className={sectionLabelClass}>YAML (Full)</p>
                  <pre className={`${codeBlockClass} max-h-64 overflow-auto`}>
                    {renderUdbValue(currentInstruction.inst.full)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className={noMatchClass}>No instruction matched yet. Enter assembly or binary.</p>
          )}
        </div>

        <div className={`${compactPanelClass} flex min-h-[520px] flex-col`}>
          <h3 className={titleClass}>Config editor</h3>
          <p className={subtitleClass}>
            Edit runtime config. Changes are auto-applied to <code className={isDark ? 'text-slate-200' : 'text-slate-800'}>/config.json</code>.
          </p>
          <textarea
            className={`mt-4 w-full flex-1 resize-none rounded-2xl px-4 py-3 font-mono text-xs leading-relaxed shadow-sm focus:outline-none ${
              isDark
                ? 'border border-slate-600 bg-slate-950 text-slate-100 focus:border-slate-400 focus:ring-2 focus:ring-slate-700'
                : 'border border-slate-200 bg-white text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            }`}
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
          {configEditorStatus && <p className={`mt-3 ${helperTextClass}`}>{configEditorStatus}</p>}
        </div>
      </aside>
    </main>
  );
}
