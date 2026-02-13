import { useEffect, useRef, useState } from 'react';

import { RuntimeEditorPane } from '../components/runtime/RuntimeEditorPane.jsx';
import { RuntimeSidebar } from '../components/runtime/RuntimeSidebar.jsx';
import { RuntimeToolbar } from '../components/runtime/RuntimeToolbar.jsx';

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
  onUploadElf,
  onToolbarReset,
  setStepBatchInput,
  runtimeInputMode,
  setRuntimeInputMode,
  stepBatchInput,
  activeSourceLine,
  activeExpandedSourceLine,
  debugBusy,
  buildAsmAndInitDebug,
  stepElfDebug,
  runElfDebug,
  debugReady,
  elfFile,
  asmSourceInput,
  expandedAsmSourceInput,
  uploadDisasmInput,
  activeEditorTab,
  setActiveEditorTab,
  runtimeEditorLanguage,
  runtimeEditorValue,
  runtimeEditorReadOnly,
  handleRuntimeEditorChange,
  handleRuntimeEditorMount,
  runtimeLogTab,
  setRuntimeLogTab,
  setOutput,
  runtimeLogText,
  runtimeLogStats,
  debugState,
  registerView,
  setRegisterView,
  debugRegisterRows,
  elfRunStatus,
}) {
  const mainRef = useRef(null);
  const [splitRatio, setSplitRatio] = useState(58);
  const [isResizing, setIsResizing] = useState(false);
  const shellClass = isDark
    ? 'border-r border-slate-700 bg-slate-900 text-slate-100'
    : 'border-r border-slate-300 bg-white text-slate-900';

  useEffect(() => {
    if (!isResizing) return undefined;
    const onMouseMove = (event) => {
      const container = mainRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const relativeX = event.clientX - bounds.left;
      const nextRatio = (relativeX / bounds.width) * 100;
      const clamped = Math.max(34, Math.min(78, nextRatio));
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
          <RuntimeToolbar
            isDark={isDark}
            configPath={configPath}
            setConfigPath={setConfigPath}
            configsState={configsState}
            runtimeInputMode={runtimeInputMode}
            setRuntimeInputMode={setRuntimeInputMode}
            gasMarchInput={gasMarchInput}
            setGasMarchInput={setGasMarchInput}
            gasAbiInput={gasAbiInput}
            setGasAbiInput={setGasAbiInput}
            buildAsmAndInitDebug={buildAsmAndInitDebug}
            debugBusy={debugBusy}
            activeSourceLine={activeSourceLine}
            onUploadElf={onUploadElf}
            elfFile={elfFile}
            stepElfDebug={stepElfDebug}
            debugReady={debugReady}
            stepBatchInput={stepBatchInput}
            setStepBatchInput={setStepBatchInput}
            runElfDebug={runElfDebug}
            onToolbarReset={onToolbarReset}
            asmSourceInput={asmSourceInput}
            activeEditorTab={activeEditorTab}
            setActiveEditorTab={setActiveEditorTab}
            expandedAsmSourceInput={expandedAsmSourceInput}
            activeExpandedSourceLine={activeExpandedSourceLine}
            uploadDisasmInput={uploadDisasmInput}
          />
          <RuntimeEditorPane
            isDark={isDark}
            editorTheme={editorTheme}
            runtimeEditorLanguage={runtimeEditorLanguage}
            runtimeEditorValue={runtimeEditorValue}
            runtimeEditorReadOnly={runtimeEditorReadOnly}
            handleRuntimeEditorChange={handleRuntimeEditorChange}
            handleRuntimeEditorMount={handleRuntimeEditorMount}
            runtimeLogTab={runtimeLogTab}
            setRuntimeLogTab={setRuntimeLogTab}
            setOutput={setOutput}
            runtimeLogText={runtimeLogText}
            runtimeLogStats={runtimeLogStats}
          />
        </section>

        <div
          className={`hidden lg:block cursor-col-resize ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'}`}
          onMouseDown={() => setIsResizing(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
        />

        <RuntimeSidebar
          isDark={isDark}
          debugReady={debugReady}
          debugBusy={debugBusy}
          debugState={debugState}
          registerView={registerView}
          setRegisterView={setRegisterView}
          debugRegisterRows={debugRegisterRows}
          configsState={configsState}
        />
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
