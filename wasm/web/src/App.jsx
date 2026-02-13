import { useAtom } from 'jotai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BinaryInput } from './components/BinaryInput.jsx';
import { buildFieldMap, buildSegments, matchEncoding } from './lib/bits.js';
import { encodeWithUdb } from './lib/encoder.js';
import { maybeWithBase } from './lib/paths.js';
import { getRuntimeModule } from './lib/sailRuntime.js';
import { udbIndexLoadableAtom } from './lib/udbIndex.js';
import { configEditorAtom, configPathAtom, configsLoadableAtom } from './state/configAtoms.js';
import { isaLoadableAtom, isaRefreshAtom } from './state/isaAtoms.js';

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
  const [elfFile, setElfFile] = useState(null);
  const [elfRunStatus, setElfRunStatus] = useState('');
  const [debugReady, setDebugReady] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugState, setDebugState] = useState(null);
  const [changedXRegs, setChangedXRegs] = useState([]);
  const [changedFRegs, setChangedFRegs] = useState([]);
  const [registerView, setRegisterView] = useState('x');
  const [stepBatchInput, setStepBatchInput] = useState('10');
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
    setChangedXRegs([]);
    setChangedFRegs([]);
    previousDebugRegsRef.current = { xregs: null, fregs: null, pc: '' };
  }, []);

  const applyDebugState = useCallback((state, options = {}) => {
    const resetDiff = Boolean(options.resetDiff);
    if (!state || typeof state !== 'object') {
      setDebugState(null);
      if (resetDiff) {
        resetDebugDiff();
      }
      return;
    }

    const xregs = Array.isArray(state.xregs) ? state.xregs : [];
    const fregs = Array.isArray(state.fregs) ? state.fregs : [];
    const prev = previousDebugRegsRef.current;

    if (resetDiff || !Array.isArray(prev.xregs)) {
      setChangedXRegs(new Array(xregs.length).fill(false));
      setChangedFRegs(new Array(fregs.length).fill(false));
    } else {
      setChangedXRegs(xregs.map((value, index) => prev.xregs[index] !== value));
      setChangedFRegs(fregs.map((value, index) => prev.fregs[index] !== value));
    }

    previousDebugRegsRef.current = {
      xregs: xregs.slice(),
      fregs: fregs.slice(),
      pc: state.pc || '',
    };
    setDebugState(state);
  }, [resetDebugDiff]);

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
    let programText = '';
    const traceLines = [];
    const runtimeLines = [];

    const tracePattern = /^(\[\d+\]|mem\[|x\d+\s<-|f\d+\s<-|v\d+\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i;
    const traceInlinePattern = /(\[\d+\]|mem\[|x\d+\s<-|f\d+\s<-|v\d+\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i;
    const runtimePattern = /^(running|run watchdog|run timed out|run finished|selected:|htif located|entry point|success|failure:|program exited|committed steps:|exitstatus|debug error:)/i;
    const htifTermCmdPattern = /htif-(?:term|syscall-proxy)\s+cmd:\s*0x([0-9a-fA-F]+)/i;
    const htifTermCompatPattern = /htif-term compat byte:\s*0x([0-9a-fA-F]+)/i;
    const hasCompatTrace = lines.some((line) => htifTermCompatPattern.test(line));

    for (const line of lines) {
      const termCompat = line.match(htifTermCompatPattern);
      const termCmd = line.match(htifTermCmdPattern);
      const payloadHex = hasCompatTrace ? termCompat?.[1] ?? null : termCompat?.[1] ?? termCmd?.[1] ?? null;
      let decodedFromLine = false;
      if (payloadHex) {
        try {
          const value = BigInt(`0x${payloadHex}`);
          const ch = Number(value & 0xffn);
          if (ch === 10) {
            programText += '\n';
          } else if (ch >= 32 && ch <= 126) {
            programText += String.fromCharCode(ch);
          }
          decodedFromLine = true;
        } catch {
          // ignore malformed htif cmd lines
        }
      }
      const trimmed = line.trim();
      if (tracePattern.test(trimmed)) {
        traceLines.push(line);
      } else if (runtimePattern.test(trimmed)) {
        runtimeLines.push(line);
      } else {
        const inline = line.match(traceInlinePattern);
        if (inline && typeof inline.index === 'number' && inline.index > 0) {
          const prefix = line.slice(0, inline.index);
          if (prefix && !decodedFromLine) {
            programText = programText ? `${programText}\n${prefix}` : prefix;
          }
          traceLines.push(line.slice(inline.index));
        } else {
          programText = programText ? `${programText}\n${line}` : line;
        }
      }
    }

    return { programText, traceLines, runtimeLines, allLines: lines };
  }, [output]);

  const displayedProgramOutput = useMemo(() => {
    if (debugState && typeof debugState === 'object' && typeof debugState.programOutput === 'string') {
      return debugState.programOutput;
    }
    return parsedRuntimeOutput.programText;
  }, [debugState, parsedRuntimeOutput.programText]);

  useEffect(() => {
    window.__sailOutputSink = append;
    return () => {
      if (window.__sailOutputSink === append) {
        window.__sailOutputSink = null;
      }
    };
  }, [append]);

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

  const initElfDebug = useCallback(async () => {
    if (!elfFile) {
      setElfRunStatus('Please choose an ELF file.');
      return false;
    }
    const configText = await resolveConfigText();
    if (!configText) {
      setElfRunStatus('Config not available.');
      return false;
    }

    const bytes = new Uint8Array(await elfFile.arrayBuffer());
    setDebugBusy(true);
    setDebugReady(false);
    setOutput('');
    resetDebugDiff();
    setElfRunStatus(`Initializing ${elfFile.name}...`);

    try {
      const result = await callDebugWorker(
        'start',
        {
          configText,
          elfBytes: bytes.buffer,
        },
        [bytes.buffer]
      );
      applyDebugState(result.state, { resetDiff: true });
      setDebugReady(true);
      setElfRunStatus(`Initialized: ${elfFile.name}`);
      return true;
    } catch (error) {
      setDebugReady(false);
      setElfRunStatus(`Init failed: ${error?.message || String(error)}`);
      return false;
    } finally {
      setDebugBusy(false);
    }
  }, [applyDebugState, callDebugWorker, elfFile, resetDebugDiff, resolveConfigText]);

  const stepElfDebug = useCallback(async (steps = 1) => {
    if (!debugReady) {
      setElfRunStatus('Debug session is not initialized.');
      return;
    }
    setDebugBusy(true);
    try {
      const result = await callDebugWorker('step', { steps: Math.max(1, steps | 0) });
      applyDebugState(result.state);
      const halted = Boolean(result?.state?.halted);
      const exitCode = Number.isFinite(result?.state?.exitCode) ? Number(result.state.exitCode) : 0;
      if (halted) {
        setElfRunStatus(`Halted (exit=${exitCode})`);
      } else {
        setElfRunStatus(`Stepped ${result.committed || 0} instruction(s).`);
      }
    } catch (error) {
      setElfRunStatus(`Step failed: ${error?.message || String(error)}`);
    } finally {
      setDebugBusy(false);
    }
  }, [applyDebugState, callDebugWorker, debugReady]);

  const runElfDebug = useCallback(async () => {
    let ready = debugReady;
    if (!ready) {
      ready = await initElfDebug();
    }
    if (!ready) {
      return;
    }
    setDebugBusy(true);
    setElfRunStatus('Running to completion...');
    try {
      const result = await callDebugWorker('run', {
        chunk: 5000,
        watchdogMs: 15000,
      });
      applyDebugState(result.state);
      const exitCode = Number.isFinite(result?.state?.exitCode) ? Number(result.state.exitCode) : 0;
      if (exitCode === 0) {
        setElfRunStatus(`Run finished: ${elfFile?.name || 'ELF'}`);
      } else {
        setElfRunStatus(`Run failed with exit code ${exitCode}`);
      }
    } catch (error) {
      setElfRunStatus(`Run failed: ${error?.message || String(error)}`);
    } finally {
      setDebugBusy(false);
    }
  }, [applyDebugState, callDebugWorker, debugReady, elfFile?.name, initElfDebug]);

  const resetElfDebug = useCallback(async () => {
    setDebugBusy(true);
    try {
      await callDebugWorker('reset');
    } catch {
      // reset best-effort
    } finally {
      setDebugBusy(false);
      setDebugReady(false);
      setDebugState(null);
      resetDebugDiff();
      setElfRunStatus('Debug session reset.');
    }
  }, [callDebugWorker, resetDebugDiff]);

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgb(255_247_237),_rgb(248_250_252)_55%)] text-slate-900">
      <div className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(14,116,144,0.18),_rgba(14,116,144,0))] blur-2xl animate-drift" />
      <div className="pointer-events-none absolute -bottom-24 left-[-5%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(249,115,22,0.18),_rgba(249,115,22,0))] blur-2xl animate-drift" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 animate-rise">
        <div className="flex items-center gap-3">
          <div className="flex h-10 items-center rounded-2xl bg-slate-900 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-lg shadow-slate-900/15">
            sail-riscv
          </div>
          <div className="text-2xl font-semibold font-serif leading-tight md:text-3xl">
            Inspect RISC-V encodings with a live Sail core.
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            {configsState.state === 'hasData' ? 'Configs ready' : 'Loading configs'}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
            Emscripten build
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-6 pb-12 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="min-h-[560px] rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur animate-rise animate-rise-delay-1">
            <div className="mb-6 space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl font-serif">
                Instruction explorer
              </h1>
              <p className="max-w-xl text-sm text-slate-600">
                Load a config, decode an instruction, or print the active ISA string. Results stream live from the WASM runtime.
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
                  {configsState.state === 'loading' && (
                    <option value="">Loading configs...</option>
                  )}
                  {configsState.state === 'hasError' && (
                    <option value="">Failed to load configs</option>
                  )}
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
                {assemblyMessage && (
                  <p className="text-xs text-rose-600">{assemblyMessage}</p>
                )}
              </label>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex-1 min-w-[220px] text-xs font-medium text-slate-700">
                    ELF file
                    <input
                      type="file"
                      accept=".elf,application/octet-stream"
                      onChange={(e) => setElfFile(e.target.files?.[0] || null)}
                      className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={initElfDebug}
                      disabled={!elfFile || debugBusy}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Init ELF
                    </button>
                    <button
                      type="button"
                      onClick={() => stepElfDebug(1)}
                      disabled={!debugReady || debugBusy}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Step
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={stepBatchInput}
                      onChange={(event) => {
                        const next = event.target.value.replace(/[^\d]/g, '');
                        setStepBatchInput(next);
                      }}
                      className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-semibold text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = Number.parseInt(stepBatchInput, 10);
                        stepElfDebug(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                      }}
                      disabled={!debugReady || debugBusy}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Step ×N
                    </button>
                    <button
                      type="button"
                      onClick={runElfDebug}
                      disabled={debugBusy || (!debugReady && !elfFile)}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={resetElfDebug}
                      disabled={debugBusy}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {elfFile ? `Selected: ${elfFile.name}` : 'No ELF selected.'}
                </p>
                {elfRunStatus && (
                  <p className="mt-1 text-xs text-slate-600">{elfRunStatus}</p>
                )}

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Debug State</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                      <span className={`rounded-full border px-2 py-0.5 ${debugReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        {debugReady ? 'ready' : 'not initialized'}
                      </span>
                      {debugBusy && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                          busy
                        </span>
                      )}
                    </div>
                  </div>
                  {debugState ? (
                    <>
                      <div className="mt-2 grid gap-2 text-[11px] text-slate-700 md:grid-cols-4">
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">pc: {debugState.pc || '-'}</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">step: {debugState.step ?? '-'}</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">halted: {String(Boolean(debugState.halted))}</div>
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono">exit: {debugState.exitCode ?? '-'}</div>
                      </div>
                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">
                        {`inst: [${debugState.instWidth ?? '-'}] ${debugState.instHex || '-'}  ${debugState.disasm || '-'}`}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">No debug state yet.</p>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Registers</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRegisterView('x')}
                        className={`rounded border px-2 py-1 text-[11px] ${registerView === 'x' ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        X
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterView('f')}
                        className={`rounded border px-2 py-1 text-[11px] ${registerView === 'f' ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        F
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-72 gap-1 overflow-auto md:grid-cols-2">
                    {debugRegisterRows.length > 0 ? debugRegisterRows.map((row) => (
                      <div
                        key={row.key}
                        className={`flex items-center justify-between rounded border px-2 py-1 font-mono text-[11px] ${
                          row.changed
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>
                          {row.name}
                          {row.alias ? ` (${row.alias})` : ''}
                        </span>
                        <span>{row.value}</span>
                      </div>
                    )) : (
                      <p className="text-[11px] text-slate-500">No registers available.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Runtime Console</p>
                  <button
                    type="button"
                    onClick={() => setOutput('')}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Program Output (HTIF)</p>
                    <pre className="h-28 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {displayedProgramOutput || '(no decoded program output)'}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Runtime Summary</p>
                    <pre className="h-28 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {parsedRuntimeOutput.runtimeLines.join('\n') || '(no runtime summary)'}
                    </pre>
                  </div>
                </div>
                <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sail Trace</p>
                <pre className="h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {parsedRuntimeOutput.traceLines.join('\n') || '(no trace lines)'}
                </pre>
              </div>
            </div>


            {configsState.state === 'hasError' && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-2">
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
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Runtime</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">WASM + Sail</p>
              <p className="mt-2 text-sm">Modules are loaded on demand to keep the UI responsive.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Configs</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">Auto-indexed</p>
              <p className="mt-2 text-sm">Generated from build outputs at <code className="text-slate-800">/config</code>.</p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-2">
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
          <div className="min-h-[560px] rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-3 flex flex-col">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl font-serif">Config editor</h3>
            <p className="mt-2 text-sm text-slate-600">
              Load an existing config and save it as a new file.
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
            {configEditorStatus && (
              <p className="mt-3 text-xs text-slate-500">{configEditorStatus}</p>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
