import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

export function RuntimeEditorPane({
  isDark,
  editorTheme,
  runtimeEditorLanguage,
  runtimeEditorValue,
  runtimeEditorReadOnly,
  handleRuntimeEditorChange,
  handleRuntimeEditorMount,
  runtimeLogTab,
  setRuntimeLogTab,
  setOutput,
  runtimeLogText,
}) {
  const editorAreaRef = useRef(null);
  const [editorSplitRatio, setEditorSplitRatio] = useState(64);
  const [isEditorResizing, setIsEditorResizing] = useState(false);

  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white';
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200';
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400';
  const logPaneClass = isDark ? 'border-t border-slate-700 bg-slate-950' : 'border-t border-slate-300 bg-slate-100';
  const logTextClass = isDark ? 'text-slate-100' : 'text-slate-800';

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
      <div className="min-h-0">
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
            readOnly: runtimeEditorReadOnly,
            domReadOnly: runtimeEditorReadOnly,
          }}
          theme={editorTheme}
        />
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
          <pre className={`overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${logTextClass}`}>
            {runtimeLogText}
          </pre>
        </div>
      </div>
    </div>
  );
}
