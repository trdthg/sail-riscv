import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

export function RuntimeEditorPane({
  isDark,
  editorTheme,
  runtimeInputMode,
  runtimeEditorLanguage,
  runtimeEditorValue,
  runtimeEditorReadOnly,
  handleRuntimeEditorChange,
  handleRuntimeEditorMount,
  asmSourceInput,
  expandedAsmSourceInput,
  linkerScriptInput,
  uploadDisasmInput,
  runtimeLogTab,
  setRuntimeLogTab,
  setOutput,
  runtimeLogText,
}) {
  const editorAreaRef = useRef(null);
  const splitAreaRef = useRef(null);
  const [editorSplitRatio, setEditorSplitRatio] = useState(64);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  const [isSplitEnabled, setIsSplitEnabled] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isSplitResizing, setIsSplitResizing] = useState(false);

  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white';
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200';
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400';
  const logPaneClass = isDark ? 'border-t border-slate-700 bg-slate-950' : 'border-t border-slate-300 bg-slate-100';
  const logTextClass = isDark ? 'text-slate-100' : 'text-slate-800';
  const panelBarClass = isDark ? 'border-b border-slate-700 bg-slate-800/80' : 'border-b border-slate-200 bg-slate-50/90';
  const controlLabelClass = isDark ? 'text-[11px] font-medium text-slate-300' : 'text-[11px] font-medium text-slate-700';
  const controlInputClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500'
    : 'rounded border border-slate-300 bg-white text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400';

  const hasExpandedSource = Boolean(expandedAsmSourceInput && expandedAsmSourceInput.trim());
  const secondaryTabOptions = runtimeInputMode === 'upload'
    ? [{ value: 'upload-disasm', label: 'disasm.S' }]
    : [
      { value: 'program', label: 'program.S' },
      ...(hasExpandedSource ? [{ value: 'expanded', label: 'expanded.S' }] : []),
      { value: 'linker', label: 'link.ld' },
    ];

  const defaultSecondaryTab = runtimeInputMode === 'upload'
    ? 'upload-disasm'
    : hasExpandedSource
      ? 'expanded'
      : 'linker';
  const [secondaryEditorTab, setSecondaryEditorTab] = useState(defaultSecondaryTab);

  useEffect(() => {
    const isValid = secondaryTabOptions.some((option) => option.value === secondaryEditorTab);
    if (!isValid) {
      setSecondaryEditorTab(defaultSecondaryTab);
    }
  }, [defaultSecondaryTab, secondaryEditorTab, secondaryTabOptions]);

  useEffect(() => {
    if (!isSplitResizing) return undefined;
    const onMouseMove = (event) => {
      const container = splitAreaRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const relativeX = event.clientX - bounds.left;
      const nextRatio = (relativeX / bounds.width) * 100;
      const clamped = Math.max(20, Math.min(80, nextRatio));
      setSplitRatio(clamped);
    };
    const onMouseUp = () => setIsSplitResizing(false);
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
  }, [isSplitResizing]);

  const resolveEditorDoc = (tab) => {
    if (runtimeInputMode === 'upload') {
      return {
        language: 'asm',
        value: uploadDisasmInput || '; upload an ELF to generate disassembly',
      };
    }
    if (tab === 'expanded') {
      return {
        language: 'asm',
        value: expandedAsmSourceInput || '; expanded listing is not available yet',
      };
    }
    if (tab === 'linker') {
      return {
        language: 'plaintext',
        value: linkerScriptInput || '',
      };
    }
    return {
      language: 'asm',
      value: asmSourceInput || '',
    };
  };

  const secondaryDoc = resolveEditorDoc(secondaryEditorTab);

  useEffect(() => {
    if (!isEditorResizing) return undefined;
    const onMouseMove = (event) => {
      const container = editorAreaRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (bounds.height <= 0) return;
      const relativeY = event.clientY - bounds.top;
      const nextRatio = (relativeY / bounds.height) * 100;
      const clamped = Math.max(38, Math.min(84, nextRatio));
      setEditorSplitRatio(clamped);
    };
    const onMouseUp = () => setIsEditorResizing(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isEditorResizing]);

  return (
    <div
      ref={editorAreaRef}
      className="min-h-0 flex-1 grid"
      style={{ gridTemplateRows: `${editorSplitRatio}fr 8px ${100 - editorSplitRatio}fr` }}
    >
      <div className="min-h-0 flex flex-col">
        <div className={`flex items-center gap-2 px-2 py-1 ${panelBarClass}`}>
          <button
            type="button"
            onClick={() => setIsSplitEnabled((prev) => !prev)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${isSplitEnabled ? tabActiveClass : tabInactiveClass}`}
          >
            {isSplitEnabled ? 'Unsplit' : 'Split'}
          </button>
          {isSplitEnabled && (
            <label className={controlLabelClass}>
              Right pane
              <select
                value={secondaryEditorTab}
                onChange={(event) => setSecondaryEditorTab(event.target.value)}
                className={`ml-2 h-7 px-2 text-[11px] ${controlInputClass}`}
              >
                {secondaryTabOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isSplitEnabled && (
            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Drag divider to resize panes
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {isSplitEnabled ? (
            <div
              ref={splitAreaRef}
              className="grid h-full min-h-0"
              style={{ gridTemplateColumns: `${splitRatio}fr 8px ${100 - splitRatio}fr` }}
            >
              <div className="min-h-0">
                <Editor
                  language={runtimeEditorLanguage}
                  value={runtimeEditorValue}
                  onChange={runtimeEditorReadOnly ? undefined : handleRuntimeEditorChange}
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
                    readOnly: runtimeEditorReadOnly,
                    domReadOnly: runtimeEditorReadOnly,
                  }}
                  theme={editorTheme}
                />
              </div>
              <div
                className={`${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-col-resize`}
                onMouseDown={() => setIsSplitResizing(true)}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize split editors"
              />
              <div className={`min-h-0 border-l ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <Editor
                  language={secondaryDoc.language}
                  value={secondaryDoc.value}
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
                    readOnly: true,
                    domReadOnly: true,
                  }}
                  theme={editorTheme}
                />
              </div>
            </div>
          ) : (
            <Editor
              language={runtimeEditorLanguage}
              value={runtimeEditorValue}
              onChange={runtimeEditorReadOnly ? undefined : handleRuntimeEditorChange}
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
                readOnly: runtimeEditorReadOnly,
                domReadOnly: runtimeEditorReadOnly,
              }}
              theme={editorTheme}
            />
          )}
        </div>
      </div>
      <div
        className={`${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-row-resize`}
        onMouseDown={() => setIsEditorResizing(true)}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor and logs"
      />
      <div className={`min-h-0 flex flex-col ${logPaneClass}`}>
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
          <pre className={`m-0 h-full overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${logTextClass}`}>
            {runtimeLogText}
          </pre>
        </div>
      </div>
    </div>
  );
}
