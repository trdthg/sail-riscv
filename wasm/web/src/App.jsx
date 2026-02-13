import { useAtom } from 'jotai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildFieldMap, buildSegments, matchEncoding } from './lib/bits.js';
import { encodeWithUdb } from './lib/encoder.js';
import { maybeWithBase } from './lib/paths.js';
import { parseRuntimeOutputLines } from './lib/runtimeLogs.js';
import { ExplorerPage } from './pages/ExplorerPage.jsx';
import { RuntimePage } from './pages/RuntimePage.jsx';
import { getRuntimeModule } from './lib/sailRuntime.js';
import { udbIndexLoadableAtom } from './lib/udbIndex.js';
import { configEditorAtom, configPathAtom, configsLoadableAtom } from './state/configAtoms.js';
import { isaLoadableAtom, isaRefreshAtom } from './state/isaAtoms.js';
import {
  DEFAULT_DEBUG_ASM_SOURCE,
  DEFAULT_DEBUG_LINKER_SCRIPT,
  useRuntimeWorkspaceState,
} from './state/runtimeWorkspaceState.js';

const MAX_BITS = 32;
const MAX_HEX = MAX_BITS / 4;

const normalizeHex = (value) => value.trim().toLowerCase().replace(/^0x/, '').replace(/\s+/g, '');
const isHex = (value) => /^[0-9a-f]+$/i.test(value);
const normalizeBin = (value) => value.replace(/[\s_]+/g, '');
const isBin = (value) => /^[01]+$/.test(value);
const formatBin = (value) => value.replace(/(.{4})/g, '$1 ').trim();
const formatBinWithCursor = (raw, cursorPos) => {
  const clean = normalizeBin(raw).replace(/[^01]/g, '').slice(0, MAX_BITS);
  const display = formatBin(clean);
  const bitsBefore = normalizeBin(raw.slice(0, cursorPos)).replace(/[^01]/g, '').length;
  if (bitsBefore <= 0) return { display, cursor: 0 };
  const maxSpaces = Math.max(0, Math.floor((clean.length - 1) / 4));
  const spacesBefore = Math.min(Math.floor(bitsBefore / 4), maxSpaces);
  return { display, cursor: bitsBefore + spacesBefore };
};
const clampHex = (value) => {
  const clean = normalizeHex(value).replace(/[^0-9a-f]/gi, '');
  return clean.slice(0, MAX_HEX);
};
const clampBin = (value) => {
  const clean = normalizeBin(value).replace(/[^01]/g, '');
  return clean.slice(0, MAX_BITS);
};

const parseToolLines = (lines) => {
  let hex = '';
  let bin = '';
  let width = '';
  let asm = '';
  let error = '';
  let jsonType = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj === 'object') {
          if (obj.type) jsonType = obj.type;
          if (obj.error) error = obj.error;
          if (obj.asm) asm = obj.asm;
          if (obj.hex) hex = obj.hex;
          if (obj.bin) bin = obj.bin;
          if (obj.width) width = String(obj.width);
          continue;
        }
      } catch {
        // fall through to text parsing
      }
    }
    if (line.startsWith('asm:')) {
      asm = line.replace(/^asm:\s*/i, '');
    } else if (line.startsWith('hex:')) {
      hex = line.replace(/^hex:\s*/i, '');
    } else if (line.startsWith('bin:')) {
      bin = line.replace(/^bin:\s*/i, '');
    } else if (line.startsWith('width:')) {
      width = line.replace(/^width:\s*/i, '');
    } else if (/^assembly did not match/i.test(line) || /^invalid/i.test(line) || /^empty assembly/i.test(line)) {
      error = line;
    }
  }
  return { hex, bin, width, asm, error, type: jsonType };
};

const getOutputLines = () => {
  if (!window.__sailOutputLines) {
    window.__sailOutputLines = [];
  }
  return window.__sailOutputLines;
};

const hexToBin = (hexValue) => {
  const clean = normalizeHex(hexValue);
  if (!clean) return '';
  if (!isHex(clean)) return null;
  const bits = clean.length * 4;
  const bin = BigInt(`0x${clean}`).toString(2).padStart(bits, '0');
  return formatBin(bin);
};

const binToHex = (binValue) => {
  const clean = normalizeBin(binValue);
  if (!clean) return '';
  if (!isBin(clean)) return null;
  const paddedLen = Math.ceil(clean.length / 4) * 4;
  const padded = clean.padStart(paddedLen, '0');
  return BigInt(`0b${padded}`).toString(16).padStart(paddedLen / 4, '0');
};


const assemblyStatusStyles = {
  waiting: 'border-slate-200 bg-slate-50 text-slate-500',
  updating: 'border-amber-200 bg-amber-50 text-amber-700',
  updated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  empty: 'border-rose-200 bg-rose-50 text-rose-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

function App() {
  const [output, setOutput] = useState('');
  const [configsState] = useAtom(configsLoadableAtom);
  const [configPath, setConfigPath] = useAtom(configPathAtom);
  const [isaState] = useAtom(isaLoadableAtom);
  const [, refreshIsa] = useAtom(isaRefreshAtom);
  const [udbState] = useAtom(udbIndexLoadableAtom);
  const [hexInput, setHexInput] = useState('');
  const [binInput, setBinInput] = useState('');
  const [assemblyInput, setAssemblyInput] = useState('');
  const [assemblyStatus, setAssemblyStatus] = useState('waiting');
  const [assemblyMessage, setAssemblyMessage] = useState('');
  const [asmOpen, setAsmOpen] = useState(false);
  const [asmHighlight, setAsmHighlight] = useState(0);
  const [asmDropdownPos, setAsmDropdownPos] = useState(null);
  const [asmFocused, setAsmFocused] = useState(false);
  const [configEditor, setConfigEditor] = useAtom(configEditorAtom);
  const [configEditorStatus, setConfigEditorStatus] = useState('');
  const [decodeMode, setDecodeMode] = useState('auto');
  const [activePage, setActivePage] = useState('explorer');
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('sail-theme') === 'dark' ? 'dark' : 'light';
  });
  const {
    state: runtimeState,
    setRuntimeField,
    patchRuntimeState,
    resetEditDefaults,
  } = useRuntimeWorkspaceState();
  const {
    uploadElfFile,
    elfRunStatus,
    debugReady,
    debugBusy,
    debugState,
    changedXRegs,
    changedFRegs,
    registerView,
    stepBatchInput,
    runtimeLogTab,
    runtimeInputMode,
    editEditorTab,
    asmSourceInput,
    expandedAsmSourceInput,
    uploadDisasmInput,
    linkerScriptInput,
    gasMarchInput,
    gasAbiInput,
  } = runtimeState;
  const applyTimerRef = useRef(null);
  const decodeTimerRef = useRef(null);
  const assembleTimerRef = useRef(null);
  const lastEditedRef = useRef('');
  const asmInputRef = useRef(null);
  const binInputRef = useRef(null);
  const asmSuppressOpenRef = useRef(false);
  const debugWorkerRef = useRef(null);
  const debugWorkerCacheBustRef = useRef('');
  const debugRequestCounterRef = useRef(0);
  const previousDebugRegsRef = useRef({ xregs: null, fregs: null, pc: '' });
  const monacoEditorRef = useRef(null);
  const monacoRef = useRef(null);
  const monacoDecorationsRef = useRef([]);
  const isDark = theme === 'dark';
  const editorTheme = isDark ? 'vs-dark' : 'vs';
  const pageTitle = activePage === 'explorer' ? 'Instruction Explorer' : 'ASM Runtime';
  const brandTitle = 'Sail RISC-V Web';
  const brandSubtitle = 'Built on sail-riscv with an online Sail model core.';

  const append = useCallback((line) => {
    setOutput((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);
  const setStatus = (text) => setConfigEditorStatus(text);

  const appendOutputLines = useCallback((lines) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }
    const chunk = lines.map((line) => String(line)).join('\n');
    setOutput((prev) => (prev ? `${prev}\n${chunk}` : chunk));
  }, []);

  const resetDebugDiff = useCallback(() => {
    patchRuntimeState({
      changedXRegs: [],
      changedFRegs: [],
    });
    previousDebugRegsRef.current = { xregs: null, fregs: null, pc: '' };
  }, [patchRuntimeState]);

  const applyDebugState = useCallback((state, options = {}) => {
    const resetDiff = Boolean(options.resetDiff);
    if (!state || typeof state !== 'object') {
      setRuntimeField('debugState', null);
      if (resetDiff) {
        resetDebugDiff();
      }
      return;
    }

    const xregs = Array.isArray(state.xregs) ? state.xregs : [];
    const fregs = Array.isArray(state.fregs) ? state.fregs : [];
    const prev = previousDebugRegsRef.current;

    if (resetDiff || !Array.isArray(prev.xregs)) {
      patchRuntimeState({
        changedXRegs: new Array(xregs.length).fill(false),
        changedFRegs: new Array(fregs.length).fill(false),
      });
    } else {
      patchRuntimeState({
        changedXRegs: xregs.map((value, index) => prev.xregs[index] !== value),
        changedFRegs: fregs.map((value, index) => prev.fregs[index] !== value),
      });
    }

    previousDebugRegsRef.current = {
      xregs: xregs.slice(),
      fregs: fregs.slice(),
      pc: state.pc || '',
    };
    setRuntimeField('debugState', state);
  }, [patchRuntimeState, resetDebugDiff, setRuntimeField]);

  const ensureDebugWorker = useCallback(() => {
    if (debugWorkerRef.current) {
      return debugWorkerRef.current;
    }
    const cacheBust = `${Date.now()}`;
    debugWorkerCacheBustRef.current = cacheBust;
    const worker = new Worker(`${maybeWithBase('/workers/debugWorker.js')}?v=${cacheBust}`);
    debugWorkerRef.current = worker;
    return worker;
  }, []);

  const callDebugWorker = useCallback((method, payload = {}, transfer = []) => {
    const worker = ensureDebugWorker();
    const requestId = `${Date.now()}-${++debugRequestCounterRef.current}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error(`Worker timeout: ${method}`));
      }, 60000);

      const onMessage = (event) => {
        const message = event.data || {};
        if (message.requestId !== requestId) {
          return;
        }

        if (message.type === 'lines') {
          appendOutputLines(message.lines || []);
          return;
        }

        if (message.type === 'result') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          if (message.ok) {
            resolve(message);
          } else {
            reject(new Error(message.error || `Worker ${method} failed`));
          }
        }
      };

      worker.addEventListener('message', onMessage);
      worker.postMessage(
        {
          type: 'rpc',
          method,
          requestId,
          baseUrl: import.meta.env.BASE_URL || '/',
          cacheBust: debugWorkerCacheBustRef.current,
          ...payload,
        },
        transfer
      );
    });
  }, [appendOutputLines, ensureDebugWorker]);

  const parsedRuntimeOutput = useMemo(() => {
    const lines = output ? output.split('\n').filter((line) => line.length > 0) : [];
    return parseRuntimeOutputLines(lines);
  }, [output]);

  const displayedProgramOutput = useMemo(() => {
    if (debugState && typeof debugState === 'object' && typeof debugState.programOutput === 'string') {
      return debugState.programOutput;
    }
    return parsedRuntimeOutput.programText;
  }, [debugState, parsedRuntimeOutput.programText]);

  const runtimeLogText = useMemo(() => {
    if (runtimeLogTab === 'status') {
      const lines = [];
      if (elfRunStatus) {
        lines.push(elfRunStatus);
      }
      if (parsedRuntimeOutput.runtimeLines.length > 0) {
        lines.push(...parsedRuntimeOutput.runtimeLines);
      }
      return lines.length ? lines.join('\n') : '(no status lines)';
    }
    if (runtimeLogTab === 'build') {
      const sourceLines = output ? output.split('\n').filter((line) => line.length > 0) : [];
      const buildLines = sourceLines.filter((line) => /(\[gas\]|\[ld\]|\[readelf\]|gas failed|ld failed|readelf failed|error:|undefined reference|collect2:)/i.test(line));
      if (elfRunStatus && /(build failed|gas failed|ld failed|readelf failed|error)/i.test(elfRunStatus)) {
        buildLines.unshift(elfRunStatus);
      }
      return buildLines.length ? buildLines.join('\n') : '(no build/link errors)';
    }
    if (runtimeLogTab === 'summary') {
      return parsedRuntimeOutput.runtimeLines.join('\n') || '(no runtime summary)';
    }
    if (runtimeLogTab === 'trace') {
      return parsedRuntimeOutput.traceLines.join('\n') || '(no trace lines)';
    }
    return displayedProgramOutput || '(no decoded program output)';
  }, [displayedProgramOutput, elfRunStatus, output, parsedRuntimeOutput.runtimeLines, parsedRuntimeOutput.traceLines, runtimeLogTab]);

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

  useEffect(() => {
    return () => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      if (decodeTimerRef.current) clearTimeout(decodeTimerRef.current);
      if (assembleTimerRef.current) clearTimeout(assembleTimerRef.current);
      if (debugWorkerRef.current) {
        debugWorkerRef.current.terminate();
        debugWorkerRef.current = null;
      }
    };
  }, []);

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
    setAssemblyStatus('updating');
    const Module = await getRuntimeModule('web');
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
        Module.callMain(['--config', fsConfigPath, ...args]);
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

  const initElfDebug = useCallback(async (overrideElfFile = null) => {
    const targetElfFile = overrideElfFile || uploadElfFile;
    if (!targetElfFile) {
      setRuntimeField('elfRunStatus', 'Please choose an ELF file.');
      return false;
    }
    const configText = await resolveConfigText();
    if (!configText) {
      setRuntimeField('elfRunStatus', 'Config not available.');
      return false;
    }

    const bytes = new Uint8Array(await targetElfFile.arrayBuffer());
    patchRuntimeState({
      uploadElfFile: targetElfFile,
      debugBusy: true,
      debugReady: false,
      runtimeInputMode: 'upload',
      uploadDisasmInput: '',
      elfRunStatus: `Initializing ${targetElfFile.name}...`,
    });
    setOutput('');
    resetDebugDiff();

    try {
      const result = await callDebugWorker(
        'start',
        {
          configText,
          elfBytes: bytes.buffer,
          elfName: targetElfFile.name,
        },
        [bytes.buffer]
      );
      applyDebugState(result.state, { resetDiff: true });
      patchRuntimeState({
        uploadDisasmInput: typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
        debugReady: true,
        elfRunStatus: `Initialized: ${targetElfFile.name}`,
      });
      return true;
    } catch (error) {
      patchRuntimeState({
        debugReady: false,
        elfRunStatus: `Init failed: ${error?.message || String(error)}`,
      });
      return false;
    } finally {
      setRuntimeField('debugBusy', false);
    }
  }, [applyDebugState, callDebugWorker, patchRuntimeState, resetDebugDiff, resolveConfigText, setRuntimeField, uploadElfFile]);

  const onUploadElf = useCallback((file) => {
    if (!file) {
      return;
    }
    patchRuntimeState({
      runtimeInputMode: 'upload',
      uploadElfFile: file,
    });
    void initElfDebug(file);
  }, [initElfDebug, patchRuntimeState]);

  const switchToEditMode = useCallback(() => {
    patchRuntimeState({
      runtimeInputMode: 'edit',
      editEditorTab: 'program',
      debugState: null,
      debugReady: false,
      changedXRegs: [],
      changedFRegs: [],
      elfRunStatus: 'Edit mode',
    });
    previousDebugRegsRef.current = { xregs: null, fregs: null, pc: '' };
  }, [patchRuntimeState]);

  const buildAsmAndInitDebug = useCallback(async () => {
    const configText = await resolveConfigText();
    if (!configText) {
      setRuntimeField('elfRunStatus', 'Config not available.');
      return false;
    }
    if (!asmSourceInput.trim()) {
      setRuntimeField('elfRunStatus', 'Assembly source is empty.');
      return false;
    }
    if (!linkerScriptInput.trim()) {
      setRuntimeField('elfRunStatus', 'Linker script is empty.');
      return false;
    }

    patchRuntimeState({
      debugBusy: true,
      debugReady: false,
      runtimeInputMode: 'edit',
      editEditorTab: 'program',
      expandedAsmSourceInput: '',
      uploadDisasmInput: '',
      elfRunStatus: 'Assembling + linking in worker...',
    });
    setOutput('');
    resetDebugDiff();

    try {
      const result = await callDebugWorker('assembleStart', {
        configText,
        asmText: asmSourceInput,
        linkScriptText: linkerScriptInput,
        gasMarch: gasMarchInput.trim() || 'rv64imac',
        gasAbi: gasAbiInput.trim() || 'lp64',
      });
      applyDebugState(result.state, { resetDiff: true });
      const elfSize = Number.isFinite(result.elfSize) ? Number(result.elfSize) : 0;
      const lineEntries = Number.isFinite(result.lineMapEntries) ? Number(result.lineMapEntries) : 0;
      const expandedEntries = Number.isFinite(result.expandedMapEntries) ? Number(result.expandedMapEntries) : 0;
      patchRuntimeState({
        expandedAsmSourceInput: typeof result.expandedSourceText === 'string' ? result.expandedSourceText : '',
        uploadDisasmInput: typeof result.disassemblyText === 'string' ? result.disassemblyText : '',
        debugReady: true,
        elfRunStatus: `Built + initialized from assembly (${elfSize} bytes, ${lineEntries} line entries, ${expandedEntries} expanded entries).`,
      });
      return true;
    } catch (error) {
      patchRuntimeState({
        debugReady: false,
        elfRunStatus: `Build failed: ${error?.message || String(error)}`,
      });
      return false;
    } finally {
      setRuntimeField('debugBusy', false);
    }
  }, [
    applyDebugState,
    asmSourceInput,
    callDebugWorker,
    gasAbiInput,
    gasMarchInput,
    linkerScriptInput,
    patchRuntimeState,
    resetDebugDiff,
    resolveConfigText,
    setRuntimeField,
  ]);

  const stepElfDebug = useCallback(async (steps = 1) => {
    if (!debugReady) {
      setRuntimeField('elfRunStatus', 'Debug session is not initialized.');
      return;
    }
    setRuntimeField('debugBusy', true);
    try {
      const result = await callDebugWorker('step', { steps: Math.max(1, steps | 0) });
      applyDebugState(result.state);
      const halted = Boolean(result?.state?.halted);
      const exitCode = Number.isFinite(result?.state?.exitCode) ? Number(result.state.exitCode) : 0;
      if (halted) {
        setRuntimeField('elfRunStatus', `Halted (exit=${exitCode})`);
      } else {
        setRuntimeField('elfRunStatus', `Stepped ${result.committed || 0} instruction(s).`);
      }
    } catch (error) {
      setRuntimeField('elfRunStatus', `Step failed: ${error?.message || String(error)}`);
    } finally {
      setRuntimeField('debugBusy', false);
    }
  }, [applyDebugState, callDebugWorker, debugReady, setRuntimeField]);

  const runElfDebug = useCallback(async () => {
    let ready = debugReady;
    if (!ready) {
      if (runtimeInputMode === 'upload') {
        ready = await initElfDebug();
      } else {
        ready = await buildAsmAndInitDebug();
      }
    }
    if (!ready) {
      return;
    }
    patchRuntimeState({
      debugBusy: true,
      elfRunStatus: 'Running to completion...',
    });
    try {
      const result = await callDebugWorker('run', {
        chunk: 5000,
        watchdogMs: 15000,
      });
      applyDebugState(result.state);
      const exitCode = Number.isFinite(result?.state?.exitCode) ? Number(result.state.exitCode) : 0;
      if (exitCode === 0) {
        const runName = runtimeInputMode === 'upload' ? (uploadElfFile?.name || 'ELF') : 'assembly';
        setRuntimeField('elfRunStatus', `Run finished: ${runName}`);
      } else {
        setRuntimeField('elfRunStatus', `Run failed with exit code ${exitCode}`);
      }
    } catch (error) {
      setRuntimeField('elfRunStatus', `Run failed: ${error?.message || String(error)}`);
    } finally {
      setRuntimeField('debugBusy', false);
    }
  }, [applyDebugState, buildAsmAndInitDebug, callDebugWorker, debugReady, initElfDebug, patchRuntimeState, runtimeInputMode, setRuntimeField, uploadElfFile?.name]);

  const resetElfDebug = useCallback(async ({ preserveEditBuffers = false } = {}) => {
    setRuntimeField('debugBusy', true);
    try {
      await callDebugWorker('reset');
    } catch {
      // reset best-effort
    } finally {
      const nextState = {
        debugBusy: false,
        debugReady: false,
        debugState: null,
        uploadDisasmInput: '',
        elfRunStatus: 'Debug session reset.',
      };
      if (!preserveEditBuffers) {
        nextState.expandedAsmSourceInput = '';
      }
      patchRuntimeState(nextState);
      resetDebugDiff();
    }
  }, [callDebugWorker, patchRuntimeState, resetDebugDiff, setRuntimeField]);

  const onToolbarReset = useCallback(async () => {
    if (runtimeInputMode === 'upload') {
      await resetElfDebug({ preserveEditBuffers: true });
      patchRuntimeState({
        uploadElfFile: null,
        elfRunStatus: 'Upload cleared.',
      });
      return;
    }
    resetEditDefaults();
    setRuntimeField('elfRunStatus', 'Edit defaults restored.');
  }, [patchRuntimeState, resetEditDefaults, resetElfDebug, runtimeInputMode, setRuntimeField]);

  const runPrintIsa = useCallback(async () => {
    refreshIsa((value) => value + 1);
  }, [refreshIsa]);

  const runDecode = useCallback(async () => {
    const trimmed = normalizeHex(hexInput);
    if (!trimmed) {
      append('Please enter a hex instruction.');
      return;
    }
    if (!isHex(trimmed)) {
      append(`Invalid hex: ${hexInput}`);
      return;
    }

    let mode = decodeMode;
    if (mode === 'auto') {
      mode = trimmed.length <= 4 ? '16' : '32';
    }
    const flag = mode === '16' ? '--decode16' : '--decode32';
    const lines = await runTool([flag, trimmed]);
    if (!lines || !lines.length) return;
    const parsed = parseToolLines(lines);
    if (parsed.asm) {
      setAssemblyInput(parsed.asm);
      setAssemblyStatus('updated');
      setAssemblyMessage('');
    }
  }, [append, decodeMode, hexInput, runTool]);

  const bitLayout = useMemo(() => {
    if (udbState.state !== 'hasData') return null;
    const binClean = binInput ? normalizeBin(binInput) : '';
    const fallbackHex = normalizeHex(hexInput);
    const resolvedBin = binClean
      ? binClean
      : (fallbackHex && isHex(fallbackHex) ? normalizeBin(hexToBin(hexInput) || '') : '');
    if (resolvedBin.length !== 32) return null;

    const mnemonic = assemblyInput.trim().split(/\s+/)[0]?.toLowerCase();
    const entries = udbState.data;
    const nameFiltered = mnemonic
      ? entries.filter((inst) => inst.name.toLowerCase() === mnemonic)
      : entries;

    const findEncoding = (list) => {
      for (const inst of list) {
        for (const enc of inst.encodings) {
          if (enc.match.length !== resolvedBin.length) continue;
          if (matchEncoding(enc.match, resolvedBin)) return enc;
        }
      }
      return null;
    };

    let encoding = findEncoding(nameFiltered);
    if (!encoding && nameFiltered !== entries) {
      encoding = findEncoding(entries);
    }
    if (!encoding) return null;

    const fieldMap = buildFieldMap(encoding, resolvedBin.length);
    for (let i = 0; i < 7; i += 1) {
      if (!fieldMap[resolvedBin.length - 1 - i]) fieldMap[resolvedBin.length - 1 - i] = 'opcode';
    }
    for (let i = 12; i <= 14; i += 1) {
      if (!fieldMap[resolvedBin.length - 1 - i]) fieldMap[resolvedBin.length - 1 - i] = 'funct3';
    }
    for (let i = 25; i <= 31; i += 1) {
      if (!fieldMap[resolvedBin.length - 1 - i]) fieldMap[resolvedBin.length - 1 - i] = 'funct7';
    }
    const segments = buildSegments(resolvedBin, fieldMap);
    return { segments, bin: resolvedBin, fieldMap };
  }, [assemblyInput, binInput, hexInput, udbState]);

  const currentInstruction = useMemo(() => {
    if (udbState.state !== 'hasData') return null;
    const entries = udbState.data;
    const binClean = binInput ? normalizeBin(binInput) : '';
    const fallbackHex = normalizeHex(hexInput);
    const resolvedBin = binClean
      ? binClean
      : (fallbackHex && isHex(fallbackHex) ? normalizeBin(hexToBin(hexInput) || '') : '');

    const mnemonic = assemblyInput.trim().split(/\s+/)[0]?.toLowerCase();
    if (resolvedBin.length === 32) {
      const nameFiltered = mnemonic
        ? entries.filter((inst) => inst.name.toLowerCase() === mnemonic)
        : entries;
      for (const inst of nameFiltered) {
        for (const enc of inst.encodings) {
          if (enc.match.length !== resolvedBin.length) continue;
          if (matchEncoding(enc.match, resolvedBin)) return { inst, encoding: enc, bin: resolvedBin };
        }
      }
      if (nameFiltered !== entries) {
        for (const inst of entries) {
          for (const enc of inst.encodings) {
            if (enc.match.length !== resolvedBin.length) continue;
            if (matchEncoding(enc.match, resolvedBin)) return { inst, encoding: enc, bin: resolvedBin };
          }
        }
      }
    }

    if (mnemonic) {
      const inst = entries.find((item) => item.name.toLowerCase() === mnemonic);
      if (inst) return { inst, encoding: inst.encodings?.[0] || null, bin: resolvedBin || null };
    }
    return null;
  }, [assemblyInput, binInput, hexInput, udbState]);

  const debugRegisterRows = useMemo(() => {
    if (!debugState || typeof debugState !== 'object') {
      return [];
    }
    if (registerView === 'f') {
      const fregs = Array.isArray(debugState.fregs) ? debugState.fregs : [];
      return fregs.map((value, index) => ({
        key: `f${index}`,
        name: `f${index}`,
        value: String(value),
        changed: Boolean(changedFRegs[index]),
      }));
    }
    const xregs = Array.isArray(debugState.xregs) ? debugState.xregs : [];
    const abi = Array.isArray(debugState.xregAbi) ? debugState.xregAbi : [];
    return xregs.map((value, index) => ({
      key: `x${index}`,
      name: `x${index}`,
      alias: abi[index] || '',
      value: String(value),
      changed: Boolean(changedXRegs[index]),
    }));
  }, [changedFRegs, changedXRegs, debugState, registerView]);

  const activeSourceLine = useMemo(() => {
    const value = Number(debugState?.sourceLine);
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }, [debugState?.sourceLine]);

  const activeExpandedSourceLine = useMemo(() => {
    const value = Number(debugState?.expandedSourceLine);
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }, [debugState?.expandedSourceLine]);

  const activeUploadDisasmLine = useMemo(() => {
    const value = Number(debugState?.uploadDisasmLine);
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }, [debugState?.uploadDisasmLine]);

  const runtimeActiveEditorTab = useMemo(() => {
    return runtimeInputMode === 'upload' ? 'upload-disasm' : editEditorTab;
  }, [editEditorTab, runtimeInputMode]);

  const activeRuntimeEditorLine = useMemo(() => {
    if (runtimeInputMode === 'upload') {
      return activeUploadDisasmLine;
    }
    return runtimeActiveEditorTab === 'expanded' ? activeExpandedSourceLine : activeSourceLine;
  }, [activeExpandedSourceLine, activeSourceLine, activeUploadDisasmLine, runtimeActiveEditorTab, runtimeInputMode]);

  useEffect(() => {
    if (!monacoEditorRef.current || !monacoRef.current) {
      return;
    }
    const editor = monacoEditorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) {
      return;
    }
    if (!['program', 'expanded', 'upload-disasm'].includes(runtimeActiveEditorTab) || !activeRuntimeEditorLine || activeRuntimeEditorLine > model.getLineCount()) {
      monacoDecorationsRef.current = editor.deltaDecorations(monacoDecorationsRef.current, []);
      return;
    }
    editor.revealLineInCenter(activeRuntimeEditorLine);
    editor.setSelection({
      startLineNumber: activeRuntimeEditorLine,
      startColumn: 1,
      endLineNumber: activeRuntimeEditorLine,
      endColumn: model.getLineMaxColumn(activeRuntimeEditorLine),
    });
    monacoDecorationsRef.current = editor.deltaDecorations(monacoDecorationsRef.current, [
      {
        range: new monaco.Range(activeRuntimeEditorLine, 1, activeRuntimeEditorLine, 1),
        options: {
          isWholeLine: true,
          className: 'debug-active-line',
        },
      },
    ]);
  }, [activeRuntimeEditorLine, asmSourceInput, expandedAsmSourceInput, linkerScriptInput, runtimeActiveEditorTab, runtimeInputMode, uploadDisasmInput]);

  const runtimeEditorValue = runtimeInputMode === 'upload'
    ? (uploadDisasmInput || '; upload an ELF to generate disassembly')
    : runtimeActiveEditorTab === 'program'
      ? asmSourceInput
      : runtimeActiveEditorTab === 'expanded'
        ? expandedAsmSourceInput
        : linkerScriptInput;
  const runtimeEditorLanguage = runtimeInputMode === 'upload'
    ? 'asm'
    : runtimeActiveEditorTab === 'linker'
      ? 'plaintext'
      : 'asm';
  const runtimeEditorReadOnly = runtimeInputMode === 'upload' || runtimeActiveEditorTab === 'expanded';

  const handleRuntimeEditorMount = useCallback((editor, monaco) => {
    monacoEditorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  const handleRuntimeEditorChange = useCallback((value, event) => {
    if (event?.isFlush) {
      return;
    }
    const next = value ?? '';
    if (runtimeInputMode === 'upload') {
      return;
    }
    if (runtimeActiveEditorTab === 'program') {
      setRuntimeField('asmSourceInput', next);
      return;
    }
    if (runtimeActiveEditorTab === 'expanded') {
      return;
    }
    setRuntimeField('linkerScriptInput', next);
  }, [runtimeActiveEditorTab, runtimeInputMode, setRuntimeField]);

  const setRuntimeEditorTab = useCallback((tab) => {
    if (['program', 'expanded', 'linker'].includes(tab)) {
      setRuntimeField('editEditorTab', tab);
    }
  }, [setRuntimeField]);

  const renderUdbValue = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const asmNames = useMemo(() => {
    if (udbState.state !== 'hasData') return [];
    const set = new Set(udbState.data.map((inst) => inst.name));
    return Array.from(set).sort();
  }, [udbState]);

  const asmTemplates = useMemo(() => {
    if (udbState.state !== 'hasData') return new Map();
    const defaults = new Map();
    const defaultForVar = (name) => {
      const key = name.toLowerCase();
      if (key === 'vm') return 'v0.t';
      if (key === 'rm') return 'rne';
      if (key === 'pred' || key === 'succ') return 'rwx';
      if (key === 'aq' || key === 'rl') return '0';
      if (key === 'csr' || key === 'zimm') return '0';
      if (/(^|_)imm\b/.test(key) || key.includes('imm') || key.includes('offset') || key.includes('shamt')) return '0';
      if (/^(xd|rd)$/.test(key)) return 'x1';
      if (/^(xs1|rs1)$/.test(key)) return 'x2';
      if (/^(xs2|rs2)$/.test(key)) return 'x3';
      if (/^(xs3|rs3)$/.test(key)) return 'x4';
      if (/^(rdp|rs1p)$/.test(key)) return 'x8';
      if (/^(rs2p)$/.test(key)) return 'x9';
      if (/^(rs3p)$/.test(key)) return 'x10';
      if (/^(fd)$/.test(key)) return 'f1';
      if (/^(fs1)$/.test(key)) return 'f2';
      if (/^(fs2)$/.test(key)) return 'f3';
      if (/^(fs3)$/.test(key)) return 'f4';
      if (/^(vd)$/.test(key)) return 'v1';
      if (/^(vs1)$/.test(key)) return 'v2';
      if (/^(vs2)$/.test(key)) return 'v3';
      if (/^(vs3)$/.test(key)) return 'v4';
      return '0';
    };

    for (const inst of udbState.data) {
      if (defaults.has(inst.name)) continue;
      const template = (inst.assembly || '').trim();
      if (!template) {
        defaults.set(inst.name, inst.name);
        continue;
      }
      const varNames = new Set();
      for (const encoding of inst.encodings || []) {
        for (const variable of encoding.variables || []) {
          if (variable?.name) varNames.add(variable.name.toLowerCase());
        }
      }
      const rendered = template.replace(/\b[A-Za-z][A-Za-z0-9_]*\b/g, (word) => {
        const key = word.toLowerCase();
        if (!varNames.has(key)) return word;
        return defaultForVar(key);
      });
      defaults.set(inst.name, `${inst.name} ${rendered}`);
    }
    return defaults;
  }, [udbState]);

  const registerSuggestions = useMemo(() => {
    const xRegs = Array.from({ length: 32 }, (_, i) => `x${i}`);
    const fRegs = Array.from({ length: 32 }, (_, i) => `f${i}`);
    const vRegs = Array.from({ length: 32 }, (_, i) => `v${i}`);
    const abi = [
      'zero', 'ra', 'sp', 'gp', 'tp',
      't0', 't1', 't2', 't3', 't4', 't5', 't6',
      's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
      'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
      'ft0', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'ft7',
      'fs0', 'fs1', 'fs2', 'fs3', 'fs4', 'fs5', 'fs6', 'fs7', 'fs8', 'fs9', 'fs10', 'fs11',
      'fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'fa7',
      'ft8', 'ft9', 'ft10', 'ft11',
    ];
    return [...xRegs, ...fRegs, ...vRegs, ...abi];
  }, []);

  const asmSuggestions = useMemo(() => {
    const trimmed = assemblyInput;
    const parts = trimmed.trim().split(/\s+/);
    const mnemonic = parts[0]?.toLowerCase();
    if (!mnemonic) return [];
    const hasOperands = trimmed.trim().includes(' ');
    if (!hasOperands) {
      return asmNames
        .filter((name) => name.toLowerCase().startsWith(mnemonic))
        .slice(0, 10)
        .map((name) => ({
          type: 'mnemonic',
          label: asmTemplates.get(name) || name,
          insert: asmTemplates.get(name) || name,
        }));
    }
    const lastToken = trimmed.split(/[\s,()]+/).filter(Boolean).pop() || '';
    const lower = lastToken.toLowerCase();
    if (!lower) return [];
    return registerSuggestions
      .filter((name) => name.toLowerCase().startsWith(lower))
      .slice(0, 10)
      .map((name) => ({ type: 'reg', label: name, insert: name }));
  }, [assemblyInput, asmNames, registerSuggestions, asmTemplates]);

  useEffect(() => {
    if (!asmFocused) {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (!asmSuggestions.length) {
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    if (asmSuppressOpenRef.current) {
      asmSuppressOpenRef.current = false;
      setAsmOpen(false);
      setAsmHighlight(0);
      return;
    }
    setAsmOpen(true);
    setAsmHighlight(0);
  }, [asmSuggestions]);

  useLayoutEffect(() => {
    if (!asmOpen || !asmInputRef.current) {
      setAsmDropdownPos(null);
      return;
    }
    const update = () => {
      const rect = asmInputRef.current.getBoundingClientRect();
      setAsmDropdownPos({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [asmOpen, asmSuggestions.length]);

  const applyAsmSuggestion = (suggestion) => {
    asmSuppressOpenRef.current = true;
    const trimmed = assemblyInput;
    const hasOperands = trimmed.trim().includes(' ');
    if (!hasOperands || suggestion.type === 'mnemonic') {
      setAssemblyInput(suggestion.insert);
    } else {
      const raw = assemblyInput;
      const match = raw.match(/^(.*?)([^\s,()]+)\s*$/);
      const prefix = match ? match[1] : raw;
      const separator = prefix.endsWith(' ') || prefix.endsWith(',') || prefix.endsWith('(') ? '' : ' ';
      setAssemblyInput(`${prefix}${separator}${suggestion.insert}`);
    }
    setAsmOpen(false);
  };


  useEffect(() => {
    if (decodeTimerRef.current) {
      clearTimeout(decodeTimerRef.current);
    }
    if (lastEditedRef.current === 'asm') {
      return;
    }
    const trimmed = normalizeHex(hexInput);
    if (!trimmed || !isHex(trimmed)) {
      return;
    }
    decodeTimerRef.current = setTimeout(() => {
      runDecode();
    }, 1000);
    return () => clearTimeout(decodeTimerRef.current);
  }, [hexInput, decodeMode, configPath, runDecode]);

  useEffect(() => {
    if (lastEditedRef.current !== 'asm') {
      return;
    }
    if (assembleTimerRef.current) {
      clearTimeout(assembleTimerRef.current);
    }
    const trimmed = assemblyInput.trim();
    if (!trimmed) {
      setAssemblyStatus('empty');
      return;
    }
    assembleTimerRef.current = setTimeout(async () => {
      if (udbState.state === 'loading') {
        setAssemblyStatus('updating');
        setAssemblyMessage('Loading Unified-DB index...');
        return;
      }
      if (udbState.state === 'hasError') {
        const message = udbState.error?.message ? `Unified-DB load failed: ${udbState.error.message}` : 'Unified-DB index not loaded.';
        setAssemblyStatus('error');
        setAssemblyMessage(message);
        return;
      }
      if (udbState.state !== 'hasData') {
        setAssemblyStatus('error');
        setAssemblyMessage('Unified-DB index not loaded.');
        return;
      }
      const isa = isaState.state === 'hasData' ? isaState.data.toLowerCase() : '';
      const xlen = isa.startsWith('rv32') ? 32 : 64;
      const result = encodeWithUdb(trimmed, udbState.data, xlen);
      if (result.error) {
        setAssemblyStatus('error');
        setAssemblyMessage(result.error);
        return;
      }
      let hexValue = result.hex;
      if (result.width && /^0x/i.test(hexValue)) {
        const raw = hexValue.replace(/^0x/i, '');
        const padded = raw.padStart(result.width / 4, '0');
        hexValue = `0x${padded}`;
      }
      setHexInput(hexValue);
      if (result.bin) {
        setBinInput(formatBin(result.bin));
      } else {
        const nextBin = hexToBin(hexValue);
        if (nextBin !== null) {
          setBinInput(nextBin);
        }
      }
      setAssemblyStatus('updated');
      setAssemblyMessage('');
    }, 1000);
    return () => clearTimeout(assembleTimerRef.current);
  }, [assemblyInput, isaState, udbState]);

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

  const setRuntimeInputMode = useCallback((value) => {
    setRuntimeField('runtimeInputMode', value);
  }, [setRuntimeField]);

  const setGasMarchInput = useCallback((value) => {
    setRuntimeField('gasMarchInput', value);
  }, [setRuntimeField]);

  const setGasAbiInput = useCallback((value) => {
    setRuntimeField('gasAbiInput', value);
  }, [setRuntimeField]);

  const setStepBatchInput = useCallback((value) => {
    setRuntimeField('stepBatchInput', value);
  }, [setRuntimeField]);

  const setRuntimeLogTab = useCallback((value) => {
    setRuntimeField('runtimeLogTab', value);
  }, [setRuntimeField]);

  const setRegisterView = useCallback((value) => {
    setRuntimeField('registerView', value);
  }, [setRuntimeField]);

  const explorerPageProps = {
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
  };

  const runtimePageProps = {
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
    onSwitchToEdit: switchToEditMode,
    stepBatchInput,
    activeSourceLine: activeRuntimeEditorLine,
    activeExpandedSourceLine,
    debugBusy,
    buildAsmAndInitDebug,
    stepElfDebug,
    runElfDebug,
    debugReady,
    elfFile: uploadElfFile,
    asmSourceInput,
    expandedAsmSourceInput,
    uploadDisasmInput,
    linkerScriptInput,
    activeEditorTab: runtimeActiveEditorTab,
    setActiveEditorTab: setRuntimeEditorTab,
    runtimeEditorLanguage,
    runtimeEditorValue,
    runtimeEditorReadOnly,
    handleRuntimeEditorChange,
    handleRuntimeEditorMount,
    runtimeLogTab,
    setRuntimeLogTab,
    setOutput,
    runtimeLogText,
    debugState,
    registerView,
    setRegisterView,
    debugRegisterRows,
  };

  return (
    <div
      className={`relative overflow-hidden ${
        isDark
          ? 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100'
          : 'bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900'
      } ${activePage === 'runtime' ? 'h-screen flex flex-col' : 'min-h-screen'}`}
    >
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

      {activePage === 'explorer' ? (
        <ExplorerPage {...explorerPageProps} />
      ) : (
        <div className="flex-1 min-h-0">
          <RuntimePage {...runtimePageProps} />
        </div>
      )}
    </div>
  )
}

export default App
