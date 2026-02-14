import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { maybeWithBase } from './lib/paths';
import { ExplorerPage } from './pages/ExplorerPage.jsx';
import { RuntimePage } from './pages/RuntimePage.jsx';
import { AppHeader } from './components/AppHeader';
import { RuntimeKeepAliveSlot } from './components/runtime/RuntimeKeepAliveSlot';
import { getRuntimeModule } from './lib/sailRuntime.js';
import { useAsmAutocomplete } from './hooks/useAsmAutocomplete';
import { useDebugWorkerRpc } from './hooks/useDebugWorkerRpc';
import { useExplorerState } from './hooks/useExplorerState';
import { scheduleMonacoPrewarm } from './lib/monacoPrewarm';
import {
  MAX_HEX,
  binToHex,
  clampHex,
  formatBinWithCursor,
  hexToBin,
} from './lib/instructionInput';
import { getOutputLines } from './lib/toolOutput';
import { udbIndexLoadableAtom } from './lib/udbIndex.js';
import { configEditorAtom, configPathAtom, configsLoadableAtom } from './state/configAtoms.js';
import { isaLoadableAtom, isaRefreshAtom } from './state/isaAtoms.js';


const assemblyStatusStyles = {
  waiting: 'border-slate-200 bg-slate-50 text-slate-500',
  updating: 'border-amber-200 bg-amber-50 text-amber-700',
  updated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  empty: 'border-rose-200 bg-rose-50 text-rose-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

function App() {
  const [configsState] = useAtom(configsLoadableAtom);
  const [configPath, setConfigPath] = useAtom(configPathAtom);
  const [isaState] = useAtom(isaLoadableAtom);
  const [, refreshIsa] = useAtom(isaRefreshAtom);
  const [udbState] = useAtom(udbIndexLoadableAtom);
  const [configEditor, setConfigEditor] = useAtom(configEditorAtom);
  const [configEditorStatus, setConfigEditorStatus] = useState('');
  const [activePage, setActivePage] = useState('explorer');
  const [runtimeEverMounted, setRuntimeEverMounted] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('sail-theme') === 'dark' ? 'dark' : 'light';
  });
  const applyTimerRef = useRef(null);
  const asmInputRef = useRef(null);
  const append = useCallback((line) => {
    console.warn(line);
  }, []);
  const {
    callDebugWorker,
    setDebugWorkerLineSink,
  } = useDebugWorkerRpc();

  const setStatus = (text) => setConfigEditorStatus(text);
  const isDark = theme === 'dark';
  const editorTheme = isDark ? 'vs-dark' : 'vs';
  const pageTitle = activePage === 'explorer' ? 'Instruction Explorer' : 'ASM Runtime';
  const brandTitle = 'Sail RISC-V Web';
  const brandSubtitle = 'Built on sail-riscv with an online Sail model core.';

  useEffect(() => {
    window.__sailOutputSink = append;
    return () => {
      if (window.__sailOutputSink === append) {
        window.__sailOutputSink = null;
      }
    };
  }, [append]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', isDark);
    window.localStorage.setItem('sail-theme', theme);
  }, [isDark, theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${pageTitle} · ${brandTitle}`;
  }, [brandTitle, pageTitle]);

  useEffect(() => {
    scheduleMonacoPrewarm();
  }, []);

  useEffect(() => {
    if (activePage === 'runtime' && !runtimeEverMounted) {
      setRuntimeEverMounted(true);
    }
  }, [activePage, runtimeEverMounted]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (activePage !== 'runtime') {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return undefined;
    }
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [activePage]);

  const clearRuntimeTimers = useCallback(() => {
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
  }, []);

  useEffect(() => {
    return () => clearRuntimeTimers();
  }, [clearRuntimeTimers]);

  const resolveConfigText = useCallback(async () => {
    if (!configPath) {
      append('No config available. Please refresh or check /config/configs.json.');
      return null;
    }
    let configText = '';
    if (configPath === '/config.json' && configEditor.trim()) {
      configText = configEditor;
    } else {
      const configResp = await fetch(maybeWithBase(configPath));
      if (!configResp.ok) {
        append(`Failed to load config: ${configResp.status} ${configResp.statusText}`);
        return null;
      }
      configText = await configResp.text();
    }
    return configText;
  }, [append, configEditor, configPath]);

  const runTool = useCallback(async (args) => {
    const Module = await getRuntimeModule();
    const configText = await resolveConfigText();
    if (!configText) return;
    const fsConfigPath = '/config.json';
    if (!Module.FS || !Module.FS.writeFile) {
      append('Emscripten FS is not available');
      return;
    }
    Module.FS.writeFile(fsConfigPath, configText);

    try {
      if (typeof Module.callMain === 'function') {
        const lines = getOutputLines();
        lines.length = 0;
        Module.callMain(['web', '--config', fsConfigPath, ...args]);
      } else {
        append('No callMain exported from module');
      }
    } catch (e) {
      if (typeof e === 'number') {
        if (e !== 0) append(`ExitStatus (number): ${e}`);
      } else if (e && typeof e.status === 'number') {
        if (e.status !== 0) append(`ExitStatus: ${e.status}`);
      } else {
        console.error('Program exited:', e);
        append(`Program exited: ${String(e)}`);
      }
    }
    return [...getOutputLines()];
  }, [append, resolveConfigText]);

  const {
    hexInput,
    setHexInput,
    binInput,
    setBinInput,
    assemblyInput,
    setAssemblyInput,
    assemblyStatus,
    assemblyMessage,
    setAssemblyMessage,
    decodeMode,
    setDecodeMode,
    lastEditedRef,
    binInputRef,
    bitLayout,
    currentInstruction,
  } = useExplorerState({
    append,
    runTool,
    configPath,
    udbState,
    isaState,
  });

  const {
    asmOpen,
    setAsmOpen,
    asmHighlight,
    setAsmHighlight,
    asmDropdownPos,
    setAsmFocused,
    asmSuggestions,
    applyAsmSuggestion,
    autocompleteState,
    autocompleteMessage,
  } = useAsmAutocomplete({
    assemblyInput,
    setAssemblyInput,
    asmInputRef,
    udbState,
  });

  const runPrintIsa = useCallback(async () => {
    refreshIsa((value) => value + 1);
  }, [refreshIsa]);

  const renderUdbValue = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const applyConfigToRuntime = async () => {
    if (!configEditor.trim()) {
      setStatus('Config editor is empty.');
      return;
    }
    try {
      const Module = await getRuntimeModule();
      if (!Module.FS || !Module.FS.writeFile) {
        setStatus('Emscripten FS is not available.');
        return;
      }
      Module.FS.writeFile('/config.json', configEditor);
      setConfigPath('/config.json');
      setStatus('Config auto-saved to runtime (/config.json).');
    } catch (err) {
      console.error('applyConfigToRuntime:', err);
      setStatus('Failed to apply config.');
    }
  };

  const sharedPageProps = {
    isDark,
    configPath,
    setConfigPath,
    configsState,
  };

  const explorerPagePrivateProps = {
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
  };

  const runtimePagePrivateProps = {
    editorTheme,
    isActive: activePage === 'runtime',
    callDebugWorker,
    setDebugWorkerLineSink,
    resolveConfigText,
  };

  const explorerPageProps = {
    ...sharedPageProps,
    ...explorerPagePrivateProps,
  };

  const runtimePageProps = {
    ...sharedPageProps,
    ...runtimePagePrivateProps,
  };

  const pageContent = (
    <RuntimeKeepAliveSlot
      activePage={activePage}
      runtimeEverMounted={runtimeEverMounted}
      explorerContent={<ExplorerPage {...explorerPageProps} />}
      runtimeContent={<RuntimePage {...runtimePageProps} />}
    />
  );

  return (
    <div
      className={`relative overflow-hidden ${
        isDark
          ? 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100'
          : 'bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900'
      } ${activePage === 'runtime' ? 'h-screen flex flex-col' : 'min-h-screen'}`}
    >
      <AppHeader
        isDark={isDark}
        activePage={activePage}
        setActivePage={setActivePage}
        setTheme={setTheme}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
      />

      {pageContent}
    </div>
  )
}

export default App
