'use strict';

let debugModuleInstance = null;
let debugModulePromise = null;
let debugSessionReady = false;

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

const requireSession = (Module) => {
  if (!debugSessionReady) {
    throw new Error('Debug session is not initialized. Click Init ELF first.');
  }
  if (!Module || typeof Module._debug_state_json !== 'function') {
    throw new Error('Debug runtime is not available.');
  }
};

const startSession = async ({ requestId, baseUrl, cacheBust, configText, elfBytes }) => {
  const Module = await getDebugModule(baseUrl, cacheBust);
  clearOutput();
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
    state: readDebugState(Module),
    committed: 0,
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
    state: readDebugState(Module),
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
    state: readDebugState(Module),
    committed: committedTotal,
  };
};

const resetSession = async () => {
  if (debugModuleInstance && typeof debugModuleInstance._debug_reset === 'function') {
    debugModuleInstance._debug_reset();
  }
  debugSessionReady = false;
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
    state: debugModuleInstance ? readDebugState(debugModuleInstance) : null,
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
          state: debugModuleInstance ? readDebugState(debugModuleInstance) : null,
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
