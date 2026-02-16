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
  currentInstruction,
  renderUdbValue,
  configEditor,
  setConfigEditor,
  configTemplatePath,
  setConfigTemplatePath,
  loadConfigTemplateToEditor,
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
  const assemblyStatusStyles = isDark
    ? {
      waiting: 'border-slate-600 bg-slate-900 text-slate-300',
      updating: 'border-amber-500/50 bg-amber-950/40 text-amber-200',
      updated: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200',
      empty: 'border-rose-500/40 bg-rose-950/40 text-rose-200',
      error: 'border-rose-500/40 bg-rose-950/40 text-rose-200',
    }
    : {
      waiting: 'border-slate-200 bg-slate-50 text-slate-500',
      updating: 'border-amber-200 bg-amber-50 text-amber-700',
      updated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      empty: 'border-rose-200 bg-rose-50 text-rose-700',
      error: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  const panelClass = isDark
    ? 'rounded-lg border border-slate-700 bg-slate-900 text-slate-200'
    : 'rounded-lg border border-slate-200 bg-white text-slate-700';
  const largePanelClass = `${panelClass} p-4 md:p-5`;
  const compactPanelClass = `${panelClass} p-4`;
  const inputClass = isDark
    ? 'h-9 w-full rounded border border-slate-600 bg-slate-900 px-3 text-[12px] text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500'
    : 'h-9 w-full rounded border border-slate-300 bg-white px-3 text-[12px] text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400';
  const mutedInputClass = isDark
    ? 'h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-[12px] font-medium text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500'
    : 'h-10 w-full rounded border border-slate-300 bg-slate-50 px-3 text-[12px] font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400';
  const fieldLabelClass = isDark
    ? 'space-y-1.5 text-xs font-medium text-slate-300'
    : 'space-y-1.5 text-xs font-medium text-slate-700';
  const titleClass = isDark
    ? 'text-lg font-semibold tracking-tight text-slate-100'
    : 'text-lg font-semibold tracking-tight text-slate-900';
  const subtitleClass = isDark ? 'max-w-2xl text-xs text-slate-400' : 'max-w-2xl text-xs text-slate-600';
  const sectionHeaderClass = isDark
    ? 'text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500'
    : 'text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500';
  const sectionLabelClass = isDark
    ? 'text-[10px] uppercase tracking-[0.12em] text-slate-400'
    : 'text-[10px] uppercase tracking-[0.12em] text-slate-500';
  const codeBlockClass = isDark
    ? 'mt-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 whitespace-pre-wrap'
    : 'mt-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-pre-wrap';
  const codeTextClass = isDark ? 'font-mono text-xs text-slate-100' : 'font-mono text-xs text-slate-800';
  const badgeClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300'
    : 'rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600';
  const buttonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400';
  const dropdownClass = isDark
    ? 'max-h-56 overflow-auto rounded border border-slate-600 bg-slate-900 shadow-lg'
    : 'max-h-56 overflow-auto rounded border border-slate-300 bg-white shadow-lg';
  const dropdownActiveClass = isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-900';
  const dropdownInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50';
  const helperTextClass = isDark ? 'text-xs text-slate-400' : 'text-xs text-slate-500';
  const noMatchClass = isDark ? 'mt-4 text-xs text-slate-400' : 'mt-4 text-xs text-slate-500';
  const autocompleteHintClass = autocompleteState === 'udb-error'
    ? 'text-xs text-rose-500'
    : helperTextClass;
  const configErrorClass = isDark
    ? 'rounded border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200'
    : 'rounded border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700';

  return (
    <main className={`mx-auto grid h-full min-h-0 w-full max-w-[1600px] gap-4 overflow-hidden px-4 py-4 lg:grid-cols-[0.9fr_1.08fr_0.92fr] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      <aside className="min-w-0 min-h-0 overflow-hidden">
        <div className={`${compactPanelClass} flex h-full min-h-0 flex-col`}>
          <h3 className={titleClass}>Config editor</h3>
          <p className={subtitleClass}>
            Edit runtime config. Changes are auto-applied to <code className={isDark ? 'text-slate-200' : 'text-slate-800'}>/config.json</code>.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <select
              value={configTemplatePath}
              onChange={(e) => setConfigTemplatePath(e.target.value)}
              disabled={configsState.state !== 'hasData'}
              className={inputClass}
            >
              {configsState.state === 'hasData' && configsState.data.map((cfg) => (
                <option key={`tpl-${cfg.path}`} value={cfg.path}>{cfg.label}</option>
              ))}
              {configsState.state === 'loading' && <option value="">Loading templates...</option>}
              {configsState.state === 'hasError' && <option value="">Template list unavailable</option>}
            </select>
            <button
              type="button"
              onClick={loadConfigTemplateToEditor}
              disabled={configsState.state !== 'hasData'}
              className={`${buttonClass} h-11 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Reset Config
            </button>
            <button
              type="button"
              onClick={applyConfigToRuntime}
              className={`${buttonClass} h-11 whitespace-nowrap`}
            >
              Apply now
            </button>
          </div>
          <textarea
            className={`mt-3 w-full min-h-0 flex-1 resize-none rounded border px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none ${
              isDark
                ? 'border border-slate-600 bg-slate-950 text-slate-100 focus:border-slate-400 focus:ring-1 focus:ring-slate-500'
                : 'border border-slate-300 bg-white text-slate-900 focus:border-slate-400 focus:ring-1 focus:ring-slate-400'
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
          {configsState.state === 'hasError' && (
            <p className={`mt-3 ${configErrorClass}`}>
              Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
            </p>
          )}
        </div>
      </aside>

      <section className="min-w-0 min-h-0 space-y-4 overflow-hidden">
        <div className={largePanelClass}>
          <div className="mb-4 space-y-2">
            <h1 className={titleClass}>
              Instruction Explorer
            </h1>
            <p className={subtitleClass}>
              Encode/decode one instruction while inspecting metadata and runtime config, with the same compact controls as ASM Runtime.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
                className={`${inputClass} h-10 text-xs`}
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
      </section>

      <aside className="min-w-0 min-h-0 overflow-y-auto pr-1">
        <div className={`${compactPanelClass} flex min-h-full flex-col`}>
          <div className={`flex items-center justify-between ${sectionHeaderClass}`}>
            <span>Instruction</span>
            {currentInstruction?.inst?.definedBy?.extension?.name && (
              <span className={badgeClass}>
                {currentInstruction.inst.definedBy.extension.name}
              </span>
            )}
          </div>
          {currentInstruction?.inst ? (
            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-xs">
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
      </aside>
    </main>
  );
}
