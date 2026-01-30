import { atom, useAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_BITS = 32;
const MAX_HEX = MAX_BITS / 4;

const normalizeHex = (value) => value.trim().toLowerCase().replace(/^0x/, '').replace(/\s+/g, '');
const isHex = (value) => /^[0-9a-f]+$/i.test(value);
const normalizeBin = (value) => value.replace(/[\s_]+/g, '');
const isBin = (value) => /^[01]+$/.test(value);
const formatBin = (value) => value.replace(/(.{4})/g, '$1 ').trim();
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

let outputSink = null;
let suppressOutput = false;
const moduleOutputLines = [];
const pushModuleLine = (line) => {
  moduleOutputLines.push(line);
  if (moduleOutputLines.length > 2000) {
    moduleOutputLines.shift();
  }
  if (outputSink && !suppressOutput) {
    outputSink(line);
  }
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

const BASE_PATH = import.meta.env.BASE_URL || '/';
const withBase = (path) => {
  const base = BASE_PATH.endsWith('/') ? BASE_PATH.slice(0, -1) : BASE_PATH;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleaned}`;
};
const maybeWithBase = (path) => (path.startsWith('http') ? path : withBase(path));

const configsAtom = atom(async () => {
  const resp = await fetch(`${withBase('/config/configs.json')}?${Date.now()}`);
  if (!resp.ok) {
    throw new Error(`config list: ${resp.status} ${resp.statusText}`);
  }
  const list = await resp.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('config list is empty');
  }
  return list;
});

const configsLoadableAtom = loadable(configsAtom);
const configContentAtom = atom(async (get) => {
  const configsState = get(configsLoadableAtom);
  const currentPath = get(configPathAtom);
  if (!currentPath || configsState.state !== 'hasData') return '';
  const resp = await fetch(`${maybeWithBase(currentPath)}?${Date.now()}`);
  if (!resp.ok) {
    throw new Error(`config: ${resp.status} ${resp.statusText}`);
  }
  return await resp.text();
});
const configContentLoadableAtom = loadable(configContentAtom);

const selectedConfigAtom = atom(null);
const configPathAtom = atom(
  (get) => {
    const configsState = get(configsLoadableAtom);
    if (configsState.state !== 'hasData' || !Array.isArray(configsState.data)) {
      return '';
    }
    const configs = configsState.data;
    if (configs.length === 0) return '';
    const selected = get(selectedConfigAtom);
    if (selected) return selected;
    const defaultItem = configs.find((cfg) => cfg.default);
    return (defaultItem || configs[0]).path;
  },
  (_get, set, next) => {
    set(selectedConfigAtom, next);
  },
);

const configEditorMapAtom = atom({});
const configEditorAtom = atom(
  (get) => {
    const path = get(configPathAtom);
    const map = get(configEditorMapAtom);
    if (path && map[path] !== undefined) return map[path];
    const contentState = get(configContentLoadableAtom);
    if (contentState.state === 'hasData') return contentState.data;
    return '';
  },
  (get, set, next) => {
    const path = get(configPathAtom);
    if (!path) return;
    set(configEditorMapAtom, (prev) => ({ ...prev, [path]: next }));
  },
);

const loadSailModule = async ({ cacheBust, jsPath }) => {
  return new Promise((resolve, reject) => {
    if (window.createSailModule && window.__sailModulePath === jsPath) {
      resolve(window.createSailModule);
      return;
    }
    const script = document.createElement('script');
    script.src = `${jsPath}?${cacheBust}`;
    script.onload = () => {
      window.__sailModulePath = jsPath;
      resolve(window.createSailModule);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const MODULE_BUST = `v=${Date.now()}`;
let runtimeModulePromise = null;
const getRuntimeModule = async () => {
  if (!runtimeModulePromise) {
    runtimeModulePromise = loadSailModule({
      cacheBust: MODULE_BUST,
      jsPath: withBase('/wasm/sail_riscv_web.js'),
    }).then((createSailModule) =>
      createSailModule({
        noInitialRun: true,
        noExitRuntime: true,
        print: (text) => {
          const line = String(text);
          console.log(`[stdout] ${line}`);
          pushModuleLine(line);
        },
        printErr: (text) => {
          const line = String(text);
          console.error(`[stderr] ${line}`);
          pushModuleLine(line);
        },
        locateFile: (path) => {
          if (path.endsWith('.wasm')) {
            return `${withBase('/wasm/sail_riscv_web.wasm')}?${MODULE_BUST}`;
          }
          return path;
        },
      })
    );
  }
  return runtimeModulePromise;
};

const isaRefreshAtom = atom(0);
const isaAtom = atom(async (get) => {
  get(isaRefreshAtom);
  const configsState = get(configsLoadableAtom);
  const currentPath = get(configPathAtom);
  if (!currentPath || configsState.state !== 'hasData') return '';
  const configResp = await fetch(`${maybeWithBase(currentPath)}?${Date.now()}`);
  if (!configResp.ok) {
    throw new Error(`config: ${configResp.status} ${configResp.statusText}`);
  }
  const configText = await configResp.text();
  const Module = await getRuntimeModule();
  if (!Module.FS || !Module.FS.writeFile) {
    return '';
  }
  Module.FS.writeFile('/config.json', configText);
  moduleOutputLines.length = 0;
  const prevSuppress = suppressOutput;
  const prevSink = outputSink;
  suppressOutput = true;
  outputSink = null;
  try {
    if (typeof Module.callMain === 'function') {
      Module.callMain(['--config', '/config.json', '--print-isa-string']);
    }
  } finally {
    suppressOutput = prevSuppress;
    outputSink = prevSink;
  }
  const cleaned = moduleOutputLines.map((line) => line.trim()).filter(Boolean);
  return cleaned.length ? cleaned[cleaned.length - 1] : '';
});
const isaLoadableAtom = loadable(isaAtom);

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
  const [hexInput, setHexInput] = useState('');
  const [binInput, setBinInput] = useState('');
  const [assemblyInput, setAssemblyInput] = useState('');
  const [assemblyStatus, setAssemblyStatus] = useState('waiting');
  const [assemblyMessage, setAssemblyMessage] = useState('');
  const [configEditor, setConfigEditor] = useAtom(configEditorAtom);
  const [configEditorStatus, setConfigEditorStatus] = useState('');
  const [decodeMode, setDecodeMode] = useState('auto');
  const applyTimerRef = useRef(null);
  const decodeTimerRef = useRef(null);
  const assembleTimerRef = useRef(null);
  const lastEditedRef = useRef('');

  const append = useCallback((line) => {
    setOutput((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);
  const setStatus = (text) => setConfigEditorStatus(text);

  useEffect(() => {
    outputSink = append;
    return () => {
      if (outputSink === append) {
        outputSink = null;
      }
    };
  }, [append]);

  useEffect(() => {
    return () => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      if (decodeTimerRef.current) clearTimeout(decodeTimerRef.current);
      if (assembleTimerRef.current) clearTimeout(assembleTimerRef.current);
    };
  }, []);

  const runTool = useCallback(async (args) => {
    if (!configPath) {
      append('No config available. Please refresh or check /config/configs.json.');
      return;
    }
    setAssemblyStatus('updating');
    const Module = await getRuntimeModule();

    let configText = '';
    if (configPath === '/config.json' && configEditor.trim()) {
      configText = configEditor;
    } else {
      const configResp = await fetch(maybeWithBase(configPath));
      if (!configResp.ok) {
        append(`Failed to load config: ${configResp.status} ${configResp.statusText}`);
        return;
      }
      configText = await configResp.text();
    }
    const fsConfigPath = '/config.json';
    if (!Module.FS || !Module.FS.writeFile) {
      append('Emscripten FS is not available');
      return;
    }
    Module.FS.writeFile(fsConfigPath, configText);

    try {
      if (typeof Module.callMain === 'function') {
        moduleOutputLines.length = 0;
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
    return [...moduleOutputLines];
  }, [append, configEditor, configPath]);

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

  useEffect(() => {
    if (decodeTimerRef.current) {
      clearTimeout(decodeTimerRef.current);
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
      const lines = await runTool(['--assemble', trimmed]);
      if (!lines || !lines.length) {
        setAssemblyStatus('error');
        setAssemblyMessage('Assemble returned no output.');
        return;
      }
      const parsed = parseToolLines(lines);
      if (parsed.error) {
        setAssemblyStatus('error');
        setAssemblyMessage(parsed.error);
        return;
      }
      const widthBits = parsed.width ? parseInt(parsed.width, 10) : 0;
      if (parsed.asm) {
        setAssemblyInput(parsed.asm);
      }
      if (parsed.hex) {
        let hexValue = parsed.hex;
        if (widthBits && /^0x/i.test(hexValue)) {
          const raw = hexValue.replace(/^0x/i, '');
          const padded = raw.padStart(widthBits / 4, '0');
          hexValue = `0x${padded}`;
        }
        setHexInput(hexValue);
        const nextBin = hexToBin(hexValue);
        if (nextBin !== null) {
          setBinInput(nextBin);
        }
      } else if (parsed.bin) {
        setBinInput(formatBin(parsed.bin));
        const nextHex = binToHex(parsed.bin);
        if (nextHex !== null) {
          setHexInput(nextHex ? `0x${nextHex}` : '');
        }
      }
      setAssemblyStatus('updated');
      setAssemblyMessage('');
    }, 1000);
    return () => clearTimeout(assembleTimerRef.current);
  }, [assemblyInput, configPath, runTool]);

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

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
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

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                Binary instruction
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 0000 0000 0000 0000 1000 0000 0110 0111"
                  value={binInput}
                  onChange={(e) => {
                    lastEditedRef.current = 'bin';
                    const clamped = clampBin(e.target.value);
                    const display = formatBin(clamped);
                    setBinInput(display);
                    const nextHex = binToHex(display);
                    if (nextHex !== null) {
                      setHexInput(nextHex ? `0x${nextHex}` : '');
                    }
                  }}
                  maxLength={MAX_BITS + Math.floor((MAX_BITS - 1) / 4)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <div className="flex items-center justify-between">
                  <span>Assembly</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${assemblyStatusStyles[assemblyStatus] || assemblyStatusStyles.waiting}`}
                  >
                    {assemblyStatus}
                  </span>
                </div>
                <input
                  value={assemblyInput}
                  placeholder="e.g. addi x1, x2, 4"
                  onChange={(e) => {
                    lastEditedRef.current = 'asm';
                    setAssemblyMessage('');
                    setAssemblyInput(e.target.value);
                  }}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-xs text-slate-900 shadow-sm focus:outline-none"
                />
                {assemblyMessage && (
                  <p className="text-xs text-rose-600">{assemblyMessage}</p>
                )}
              </label>
            </div>


            {configsState.state === 'hasError' && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                Failed to load config list. Make sure <span className="font-semibold">/config/configs.json</span> exists.
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Runtime</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">WASM + Sail</p>
              <p className="mt-2 text-sm">Modules are loaded on demand to keep the UI responsive.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Configs</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">Auto-indexed</p>
              <p className="mt-2 text-sm">Generated from build outputs at <code className="text-slate-800">/config</code>.</p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-1">
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
          <div className="min-h-[560px] rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-sm animate-rise animate-rise-delay-2 flex flex-col">
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
