'use strict';

let debugModuleInstance = null;
let debugModulePromise = null;
let debugSessionReady = false;
let gasFactory = null;
let ldFactory = null;
let readelfFactory = null;
let debugLineEntries = null;
let debugLineFile = '';

let outputLines = [];
let emittedLineCount = 0;

const MAX_OUTPUT_LINES = 40000;

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return '/';
  }
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
};

const pushOutputLine = (line) => {
  outputLines.push(String(line));
  if (outputLines.length > MAX_OUTPUT_LINES) {
    const overflow = outputLines.length - MAX_OUTPUT_LINES;
    outputLines.splice(0, overflow);
    emittedLineCount = Math.max(0, emittedLineCount - overflow);
  }
};

const clearOutput = () => {
  outputLines = [];
  emittedLineCount = 0;
};

const flushOutput = (requestId, force = false) => {
  if (!force && emittedLineCount >= outputLines.length) {
    return;
  }
  const lines = outputLines.slice(emittedLineCount);
  emittedLineCount = outputLines.length;
  if (lines.length > 0 || force) {
    self.postMessage({ type: 'lines', requestId, lines });
  }
};

const ensureDir = (Module, path) => {
  if (!Module.FS || !Module.FS.analyzePath || !Module.FS.mkdirTree) {
    return;
  }
  if (!Module.FS.analyzePath(path).exists) {
    Module.FS.mkdirTree(path);
  }
};

const readCString = (Module, ptr) => {
  if (!ptr) {
    return '';
  }
  const heap = Module.HEAPU8;
  let end = ptr;
  while (heap[end] !== 0) {
    end += 1;
  }
  return new TextDecoder().decode(heap.subarray(ptr, end));
};

const readDebugError = (Module) => {
  if (!Module || typeof Module._debug_last_error !== 'function') {
    return '';
  }
  return readCString(Module, Module._debug_last_error());
};

const readDebugState = (Module) => {
  if (!Module || typeof Module._debug_state_json !== 'function') {
    return null;
  }
  const raw = readCString(Module, Module._debug_state_json());
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, parseError: true, raw };
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withCacheBust = (url, cacheBust) => {
  if (!cacheBust) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}v=${cacheBust}`;
};

const loadToolFactory = ({ baseUrl, cacheBust, relativePath, label }) => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const scriptUrl = withCacheBust(`${normalizedBase}${relativePath}`, cacheBust);
  try {
    importScripts(scriptUrl);
  } catch (error) {
    throw new Error(
      `Failed to load ${label} tool script: ${scriptUrl}. ` +
      `Make sure wasm/web/public/${relativePath} exists (run binutils wasm build first).`
    );
  }
  if (typeof self.Module !== 'function') {
    throw new Error(`${label} factory is not available after loading ${relativePath}`);
  }
  return self.Module;
};

const getGasFactory = ({ baseUrl, cacheBust }) => {
  if (!gasFactory) {
    gasFactory = loadToolFactory({
      baseUrl,
      cacheBust,
      relativePath: 'binutils/riscv64-linux-gnu.js',
      label: 'gas',
    });
  }
  return gasFactory;
};

const getLdFactory = ({ baseUrl, cacheBust }) => {
  if (!ldFactory) {
    ldFactory = loadToolFactory({
      baseUrl,
      cacheBust,
      relativePath: 'binutils/ld.js',
      label: 'ld',
    });
  }
  return ldFactory;
};

const getReadelfFactory = ({ baseUrl, cacheBust }) => {
  if (!readelfFactory) {
    readelfFactory = loadToolFactory({
      baseUrl,
      cacheBust,
      relativePath: 'binutils/readelf.js',
      label: 'readelf',
    });
  }
  return readelfFactory;
};

const getDebugModule = async (baseUrl, cacheBust) => {
  if (debugModuleInstance) {
    return debugModuleInstance;
  }
  if (!debugModulePromise) {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const cacheSuffix = cacheBust ? `?v=${cacheBust}` : '';
    debugModulePromise = (async () => {
      if (typeof self.createSailModule !== 'function') {
        const scriptUrl = `${normalizedBase}wasm/sail_riscv_debug.js${cacheSuffix}`;
        importScripts(scriptUrl);
      }
      if (typeof self.createSailModule !== 'function') {
        throw new Error('createSailModule is not available in worker');
      }
      return self.createSailModule({
        noInitialRun: true,
        noExitRuntime: true,
        print: (text) => {
          pushOutputLine(text);
        },
        printErr: (text) => {
          pushOutputLine(text);
        },
        locateFile: (path) => {
          if (String(path).endsWith('.wasm')) {
            return `${normalizedBase}wasm/sail_riscv_debug.wasm${cacheSuffix}`;
          }
          return path;
        },
      });
    })();
  }
  debugModuleInstance = await debugModulePromise;
  return debugModuleInstance;
};

const initDebugSessionWithElf = ({ requestId, Module, configText, elfBytes }) => {
  ensureDir(Module, '/debug');
  Module._debug_reset();
  debugSessionReady = false;

  Module.FS.writeFile('/debug/config.json', String(configText || ''));
  Module.FS.writeFile('/debug/program.elf', new Uint8Array(elfBytes));
  pushOutputLine('Running in worker: --config /debug/config.json /debug/program.elf');

  const initRc = Number(Module._debug_init_default());
  if (initRc !== 0) {
    throw new Error(readDebugError(Module) || `debug_init_default failed (${initRc})`);
  }

  debugSessionReady = true;
  flushOutput(requestId, true);
  return {
    state: augmentStateWithSourceLine(readDebugState(Module)),
    committed: 0,
  };
};

const runBinutilsModule = async ({
  requestId,
  factory,
  label,
  args,
  preRun,
  silent = false,
}) => {
  const stdoutLines = [];
  const stderrLines = [];
  const module = await factory({
    arguments: args,
    preRun: [
      (toolModule) => {
        ensureDir(toolModule, '/tmp');
        if (typeof preRun === 'function') {
          preRun(toolModule);
        }
      },
    ],
    print: (text) => {
      const line = String(text);
      stdoutLines.push(line);
      if (!silent) {
        pushOutputLine(`[${label}] ${line}`);
      }
    },
    printErr: (text) => {
      const line = String(text);
      stderrLines.push(line);
      if (!silent) {
        pushOutputLine(`[${label}] ${line}`);
      }
    },
  });
  if (!silent) {
    flushOutput(requestId, false);
  }
  return { module, stdoutLines, stderrLines };
};

const parseReadelfDecodedLine = (lines) => {
  const entries = [];
  let sourceFile = '';
  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const match = line.match(/^\s*(.+?)\s+(-|\d+)\s+0x([0-9a-fA-F]+)\b/);
    if (!match) {
      continue;
    }
    const file = match[1].trim();
    const lineText = match[2];
    const address = Number.parseInt(match[3], 16);
    if (!Number.isFinite(address)) {
      continue;
    }
    if (!sourceFile) {
      sourceFile = file;
    }
    entries.push({
      file,
      line: lineText === '-' ? null : Number.parseInt(lineText, 10),
      address,
    });
  }
  entries.sort((left, right) => left.address - right.address);
  return {
    sourceFile,
    entries,
  };
};

const lookupSourceLineByPc = (pcValue) => {
  if (!Array.isArray(debugLineEntries) || debugLineEntries.length === 0) {
    return null;
  }
  const pc = Number(pcValue);
  if (!Number.isFinite(pc)) {
    return null;
  }
  let left = 0;
  let right = debugLineEntries.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const address = debugLineEntries[mid].address;
    if (address <= pc) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  while (best >= 0) {
    const entry = debugLineEntries[best];
    if (entry && Number.isInteger(entry.line) && entry.line > 0) {
      return entry.line;
    }
    best -= 1;
  }
  return null;
};

const augmentStateWithSourceLine = (state) => {
  if (!state || typeof state !== 'object') {
    return state;
  }
  const pc = typeof state.pc === 'string' ? Number.parseInt(state.pc, 16) : Number(state.pc);
  const sourceLine = lookupSourceLineByPc(pc);
  if (sourceLine !== null) {
    state.sourceLine = sourceLine;
  }
  if (debugLineFile) {
    state.sourceFile = debugLineFile;
  }
  return state;
};

const refreshLineMapFromElf = async ({ requestId, baseUrl, cacheBust, elfBytes }) => {
  debugLineEntries = null;
  debugLineFile = '';
  const factory = getReadelfFactory({ baseUrl, cacheBust });
  const readelf = await runBinutilsModule({
    requestId,
    factory,
    label: 'readelf',
    args: ['--debug-dump=decodedline', '/tmp/program.elf'],
    preRun: (module) => {
      module.FS.writeFile('/tmp/program.elf', new Uint8Array(elfBytes));
    },
    silent: true,
  });
  const parsed = parseReadelfDecodedLine(readelf.stdoutLines);
  if (parsed.entries.length > 0) {
    debugLineEntries = parsed.entries;
    debugLineFile = parsed.sourceFile;
  }
  return parsed.entries.length;
};

const requireSession = (Module) => {
  if (!debugSessionReady) {
    throw new Error('Debug session is not initialized. Click Build + Init or Init ELF first.');
  }
  if (!Module || typeof Module._debug_state_json !== 'function') {
    throw new Error('Debug runtime is not available.');
  }
};

const startSession = async ({ requestId, baseUrl, cacheBust, configText, elfBytes }) => {
  const Module = await getDebugModule(baseUrl, cacheBust);
  clearOutput();
  await refreshLineMapFromElf({ requestId, baseUrl, cacheBust, elfBytes });
  return initDebugSessionWithElf({
    requestId,
    Module,
    configText,
    elfBytes,
  });
};

const assembleAndStartSession = async ({
  requestId,
  baseUrl,
  cacheBust,
  configText,
  asmText,
  linkScriptText,
  gasMarch,
  gasAbi,
}) => {
  const Module = await getDebugModule(baseUrl, cacheBust);
  const sourceText = String(asmText || '');
  const linkerText = String(linkScriptText || '');
  if (!sourceText.trim()) {
    throw new Error('Assembly source is empty.');
  }
  if (!linkerText.trim()) {
    throw new Error('Linker script is empty.');
  }

  clearOutput();
  pushOutputLine('Running in worker: assembling /tmp/program.S');
  flushOutput(requestId, false);

  const asFactory = getGasFactory({ baseUrl, cacheBust });
  const linkerFactory = getLdFactory({ baseUrl, cacheBust });

  const gasArgs = [
    '-g',
    `-march=${String(gasMarch || 'rv64imac')}`,
    `-mabi=${String(gasAbi || 'lp64')}`,
    '-o',
    '/tmp/program.o',
    '/tmp/program.S',
  ];
  const gasResult = await runBinutilsModule({
    requestId,
    factory: asFactory,
    label: 'gas',
    args: gasArgs,
    preRun: (gasModule) => {
      gasModule.FS.writeFile('/tmp/program.S', sourceText);
    },
  });

  let objectFile = null;
  try {
    objectFile = gasResult.module.FS.readFile('/tmp/program.o');
  } catch {
    objectFile = null;
  }
  if (!objectFile || objectFile.length === 0) {
    const details = [...gasResult.stderrLines, ...gasResult.stdoutLines]
      .filter((line) => line && line.trim())
      .slice(-6)
      .join('\n');
    throw new Error(details ? `gas failed:\n${details}` : 'gas failed: no object file produced');
  }

  pushOutputLine(`gas: produced /tmp/program.o (${objectFile.length} bytes)`);
  flushOutput(requestId, false);

  const ldArgs = [
    '-m',
    'elf64lriscv',
    '-T',
    '/tmp/link.ld',
    '-o',
    '/tmp/program.elf',
    '/tmp/program.o',
  ];
  const ldResult = await runBinutilsModule({
    requestId,
    factory: linkerFactory,
    label: 'ld',
    args: ldArgs,
    preRun: (ldModule) => {
      ldModule.FS.writeFile('/tmp/program.o', objectFile);
      ldModule.FS.writeFile('/tmp/link.ld', linkerText);
    },
  });

  let elfBytes = null;
  try {
    elfBytes = ldResult.module.FS.readFile('/tmp/program.elf');
  } catch {
    elfBytes = null;
  }
  if (!elfBytes || elfBytes.length === 0) {
    const details = [...ldResult.stderrLines, ...ldResult.stdoutLines]
      .filter((line) => line && line.trim())
      .slice(-8)
      .join('\n');
    throw new Error(details ? `ld failed:\n${details}` : 'ld failed: no ELF produced');
  }

  pushOutputLine(`ld: produced /tmp/program.elf (${elfBytes.length} bytes)`);
  flushOutput(requestId, false);

  const lineCount = await refreshLineMapFromElf({
    requestId,
    baseUrl,
    cacheBust,
    elfBytes,
  });
  if (lineCount > 0) {
    pushOutputLine(`readelf: loaded ${lineCount} debug line entries`);
    flushOutput(requestId, false);
  }

  return {
    ...(initDebugSessionWithElf({
      requestId,
      Module,
      configText,
      elfBytes,
    })),
    elfSize: elfBytes.length,
    lineMapEntries: lineCount,
  };
};

const stepSession = async ({ requestId, steps = 1 }) => {
  const Module = debugModuleInstance;
  requireSession(Module);

  const committed = Number(Module._debug_step(Math.max(1, steps | 0)));
  if (committed < 0) {
    throw new Error(readDebugError(Module) || `debug_step failed (${committed})`);
  }

  flushOutput(requestId, false);
  return {
    state: augmentStateWithSourceLine(readDebugState(Module)),
    committed,
  };
};

const runSession = async ({ requestId, chunk = 5000, watchdogMs = 15000 }) => {
  const Module = debugModuleInstance;
  requireSession(Module);

  const runChunk = Math.max(1, chunk | 0);
  const startedAt = Date.now();
  let committedTotal = 0;

  while (Module._debug_is_halted() !== 1) {
    const committed = Number(Module._debug_run(runChunk));
    if (committed < 0) {
      throw new Error(readDebugError(Module) || `debug_run failed (${committed})`);
    }
    committedTotal += committed;
    flushOutput(requestId, false);

    if (committed === 0 && Module._debug_is_halted() !== 1) {
      throw new Error(readDebugError(Module) || 'debug runtime made no progress');
    }
    if (Date.now() - startedAt > watchdogMs) {
      throw new Error(`Run watchdog: execution still running after ${Math.floor(watchdogMs / 1000)}s`);
    }
    await sleep(0);
  }

  flushOutput(requestId, true);
  return {
    state: augmentStateWithSourceLine(readDebugState(Module)),
    committed: committedTotal,
  };
};

const resetSession = async () => {
  if (debugModuleInstance && typeof debugModuleInstance._debug_reset === 'function') {
    debugModuleInstance._debug_reset();
  }
  debugSessionReady = false;
  debugLineEntries = null;
  debugLineFile = '';
  clearOutput();
  return { state: null, committed: 0 };
};

const sendResult = (requestId, payload) => {
  self.postMessage({
    type: 'result',
    ok: true,
    requestId,
    ...payload,
  });
};

const sendError = (requestId, error) => {
  const messageText = error?.message ? String(error.message) : String(error);
  self.postMessage({
    type: 'result',
    ok: false,
    requestId,
    error: messageText,
    state: debugModuleInstance ? augmentStateWithSourceLine(readDebugState(debugModuleInstance)) : null,
  });
};

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type !== 'rpc') {
    return;
  }

  const requestId = message.requestId || `${Date.now()}`;
  try {
    let result = null;
    switch (message.method) {
      case 'start':
        result = await startSession({
          requestId,
          baseUrl: message.baseUrl,
          cacheBust: message.cacheBust,
          configText: message.configText,
          elfBytes: message.elfBytes,
        });
        break;
      case 'assembleStart':
        result = await assembleAndStartSession({
          requestId,
          baseUrl: message.baseUrl,
          cacheBust: message.cacheBust,
          configText: message.configText,
          asmText: message.asmText,
          linkScriptText: message.linkScriptText,
          gasMarch: message.gasMarch,
          gasAbi: message.gasAbi,
        });
        break;
      case 'step':
        result = await stepSession({
          requestId,
          steps: message.steps,
        });
        break;
      case 'run':
        result = await runSession({
          requestId,
          chunk: message.chunk,
          watchdogMs: message.watchdogMs,
        });
        break;
      case 'reset':
        result = await resetSession();
        break;
      case 'state':
        result = {
          state: debugModuleInstance ? augmentStateWithSourceLine(readDebugState(debugModuleInstance)) : null,
          committed: 0,
        };
        break;
      default:
        throw new Error(`Unknown worker method: ${String(message.method)}`);
    }

    sendResult(requestId, result || { state: null, committed: 0 });
  } catch (error) {
    sendError(requestId, error);
  }
};
