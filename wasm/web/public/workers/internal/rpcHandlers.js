'use strict';

let debugModuleInstance = null;
let debugModulePromise = null;
let debugSessionReady = false;
let gasFactory = null;
let ldFactory = null;
let readelfFactory = null;
let objdumpFactory = null;
let debugLineEntries = null;
let debugLineFile = '';
let expandedSourceEntries = null;
let expandedSourceText = '';
let expandedSourceFile = '';
let expandedSourceLinks = [];
let debugDisassemblyText = '';
let debugDisassemblyEntries = null;

let outputLines = [];
let emittedLineCount = 0;

const MAX_OUTPUT_LINES = 40000;
const TMP_ROOT_DIR = '/tmp';
const EDIT_TMP_DIR = '/tmp/edit';
const UPLOAD_TMP_DIR = '/tmp/upload';
const TRACE_INSN_PC_PATTERN = /\[\d+\]\s+\[[A-Z]\]:\s+0x([0-9a-fA-F]+)/;
const TRACE_REG_WRITE_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)\s*<-\s*(0x[0-9a-fA-F]+)/;
const TRACE_MEM_WRITE_PATTERN = /mem\[([A-Za-z]),0x([0-9a-fA-F]+)\]\s*<-\s*0x([0-9a-fA-F]+)/i;
const TRACE_HTIF_WRITE_PATTERN = /htif\[0x([0-9a-fA-F]+)\]\s*<-\s*0x([0-9a-fA-F]+)/i;

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

const collectOutputSince = (startIndex) => {
  const start = Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : 0;
  if (start >= outputLines.length) {
    return [];
  }
  return outputLines.slice(start).map((line) => String(line));
};

const extractTraceRegWrites = (lines, committedPcValue = null) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }

  const blocks = [];
  let currentBlock = null;

  const pushCurrentBlock = () => {
    if (!currentBlock) {
      return;
    }
    blocks.push(currentBlock);
    currentBlock = null;
  };

  for (const rawLine of lines) {
    const chunks = String(rawLine || '').split(/\r?\n/);
    for (const chunk of chunks) {
      const trimmed = String(chunk || '').trim();
      if (!trimmed) {
        continue;
      }
      const instructionMatch = trimmed.match(TRACE_INSN_PC_PATTERN);
      if (instructionMatch) {
        pushCurrentBlock();
        const pc = Number.parseInt(instructionMatch[1], 16);
        currentBlock = {
          pc: Number.isFinite(pc) ? pc : null,
          writes: [],
        };
        continue;
      }
      const match = trimmed.match(TRACE_REG_WRITE_PATTERN);
      if (match) {
        if (!currentBlock) {
          currentBlock = { pc: null, writes: [] };
        }
        currentBlock.writes.push({
          kind: 'reg',
          name: match[1],
          value: match[2],
        });
        continue;
      }
      const memMatch = trimmed.match(TRACE_MEM_WRITE_PATTERN);
      if (memMatch) {
        if (!currentBlock) {
          currentBlock = { pc: null, writes: [] };
        }
        currentBlock.writes.push({
          kind: 'mem',
          access: String(memMatch[1] || '').toUpperCase(),
          address: `0x${String(memMatch[2] || '').toUpperCase()}`,
          value: `0x${String(memMatch[3] || '').toUpperCase()}`,
        });
        continue;
      }
      const htifMatch = trimmed.match(TRACE_HTIF_WRITE_PATTERN);
      if (htifMatch) {
        if (!currentBlock) {
          currentBlock = { pc: null, writes: [] };
        }
        currentBlock.writes.push({
          kind: 'mem',
          access: 'W',
          address: `0x${String(htifMatch[1] || '').toUpperCase()}`,
          value: `0x${String(htifMatch[2] || '').toUpperCase()}`,
        });
      }
    }
  }
  pushCurrentBlock();

  if (blocks.length === 0) {
    return [];
  }

  const committedPc = parsePcValue(committedPcValue);
  let selectedBlock = null;
  if (Number.isFinite(committedPc)) {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (block.pc === committedPc && Array.isArray(block.writes) && block.writes.length > 0) {
        selectedBlock = block;
        break;
      }
    }
    if (!selectedBlock) {
      for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index];
        if (block.pc === committedPc) {
          selectedBlock = block;
          break;
        }
      }
    }
  }
  if (!selectedBlock) {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (Array.isArray(block.writes) && block.writes.length > 0) {
        selectedBlock = block;
        break;
      }
    }
  }
  if (!selectedBlock) {
    selectedBlock = blocks[blocks.length - 1];
  }

  const selected = Array.isArray(selectedBlock?.writes) ? selectedBlock.writes : [];
  if (!selected.length) {
    return [];
  }
  const dedupMap = new Map();
  const memWrites = [];
  for (const write of selected) {
    if (write && write.kind === 'mem') {
      memWrites.push(write);
      continue;
    }
    dedupMap.set(String(write.name), write);
  }
  return [...Array.from(dedupMap.values()), ...memWrites];
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

const sanitizeFileName = (name, fallback = 'program.elf') => {
  const raw = String(name || '').trim();
  const base = raw ? raw.split(/[\\/]/).pop() : fallback;
  const cleaned = String(base || fallback).replace(/[^\w.\-+]/g, '_');
  if (!cleaned) {
    return fallback;
  }
  return cleaned.toLowerCase().endsWith('.elf') ? cleaned : `${cleaned}.elf`;
};

const toUploadElfPath = (name, fallback = 'upload.elf') =>
  `${UPLOAD_TMP_DIR}/${sanitizeFileName(name, fallback)}`;

const basenameFromPath = (path, fallback = 'program.elf') => {
  const raw = String(path || '').trim();
  if (!raw) {
    return fallback;
  }
  const parts = raw.split('/');
  const name = parts[parts.length - 1] || fallback;
  return name;
};

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

const getObjdumpFactory = ({ baseUrl, cacheBust }) => {
  if (!objdumpFactory) {
    objdumpFactory = loadToolFactory({
      baseUrl,
      cacheBust,
      relativePath: 'binutils/objdump.js',
      label: 'objdump',
    });
  }
  return objdumpFactory;
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

const initDebugSessionWithElf = ({ requestId, Module, configText, elfBytes, traceEnabled = true }) => {
  ensureDir(Module, '/debug');
  Module._debug_reset();
  debugSessionReady = false;
  if (typeof Module._debug_set_trace === 'function') {
    Module._debug_set_trace(traceEnabled ? 1 : 0);
  }

  Module.FS.writeFile('/debug/config.json', String(configText || ''));
  Module.FS.writeFile('/debug/program.elf', new Uint8Array(elfBytes));
  pushOutputLine('Running in worker: --config /debug/config.json /debug/program.elf');

  const initRc = Number(Module._debug_init_default());
  if (initRc !== 0) {
    throw new Error(readDebugError(Module) || `debug_init_default failed (${initRc})`);
  }
  if (typeof Module._debug_set_trace === 'function') {
    Module._debug_set_trace(traceEnabled ? 1 : 0);
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
        ensureDir(toolModule, TMP_ROOT_DIR);
        ensureDir(toolModule, EDIT_TMP_DIR);
        ensureDir(toolModule, UPLOAD_TMP_DIR);
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

const fileBaseName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const parts = raw.split(/[\\/]/);
  return String(parts[parts.length - 1] || raw).trim().toLowerCase();
};

const findNearestSourceEntryByAddress = (lineEntries, address) => {
  if (!Array.isArray(lineEntries) || lineEntries.length === 0) {
    return null;
  }
  if (!Number.isFinite(address)) {
    return null;
  }
  let left = 0;
  let right = lineEntries.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const entryAddress = Number(lineEntries[mid]?.address);
    if (!Number.isFinite(entryAddress)) {
      break;
    }
    if (entryAddress <= address) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  while (best >= 0) {
    const entry = lineEntries[best];
    if (entry && Number.isInteger(entry.line) && entry.line > 0) {
      return entry;
    }
    best -= 1;
  }
  return null;
};

const findNearestSourceLineByAddress = (lineEntries, address) => {
  const entry = findNearestSourceEntryByAddress(lineEntries, address);
  if (!entry) {
    return null;
  }
  return Number(entry.line);
};

const buildSourceToDisasmLinks = (lineEntries, disasmEntries, sourceFilter = '') => {
  if (!Array.isArray(lineEntries) || lineEntries.length === 0) {
    return [];
  }
  if (!Array.isArray(disasmEntries) || disasmEntries.length === 0) {
    return [];
  }
  const filterBase = fileBaseName(sourceFilter);
  const buckets = new Map();
  for (const disasmEntry of disasmEntries) {
    const disasmLine = Number(disasmEntry?.line);
    const disasmAddress = Number(disasmEntry?.address);
    if (!Number.isInteger(disasmLine) || disasmLine <= 0) {
      continue;
    }
    if (!Number.isFinite(disasmAddress)) {
      continue;
    }
    const sourceEntry = findNearestSourceEntryByAddress(lineEntries, disasmAddress);
    const sourceLine = Number(sourceEntry?.line);
    const sourceFile = fileBaseName(sourceEntry?.file);
    if (filterBase && sourceFile !== filterBase) {
      continue;
    }
    if (!Number.isInteger(sourceLine) || sourceLine <= 0) {
      continue;
    }
    if (!buckets.has(sourceLine)) {
      buckets.set(sourceLine, new Set());
    }
    buckets.get(sourceLine).add(disasmLine);
  }
  return Array.from(buckets.entries())
    .map(([sourceLine, linesSet]) => ({
      sourceLine,
      expandedLines: Array.from(linesSet).sort((left, right) => left - right),
    }))
    .sort((left, right) => left.sourceLine - right.sourceLine);
};

const lookupSourceLineByPc = (pcValue) => {
  return findNearestSourceLineByAddress(debugLineEntries, Number(pcValue));
};

const lookupSourceEntryByPc = (pcValue) => {
  return findNearestSourceEntryByAddress(debugLineEntries, Number(pcValue));
};

const parseObjdumpAddressMap = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*([0-9a-fA-F]+):\s+([0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})*|[0-9a-fA-F]{4,})\s+(.*)$/);
    if (!match) {
      continue;
    }
    const address = Number.parseInt(match[1], 16);
    if (!Number.isFinite(address)) {
      continue;
    }
    entries.push({
      address,
      line: index + 1,
      text: line,
      sourceLine: null,
    });
  }
  entries.sort((left, right) => left.address - right.address);
  return entries;
};

const annotateDisassemblyEntriesWithSource = (lineEntries, disasmEntries) => {
  if (!Array.isArray(disasmEntries) || disasmEntries.length === 0) {
    return [];
  }
  return disasmEntries.map((entry) => {
    const sourceEntry = findNearestSourceEntryByAddress(lineEntries, Number(entry.address));
    return {
      ...entry,
      sourceLine: Number.isInteger(sourceEntry?.line) ? sourceEntry.line : null,
      sourceFile: sourceEntry?.file || '',
    };
  });
};

const findNearestDisassemblyEntryByAddress = (entries, address) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  if (!Number.isFinite(address)) {
    return null;
  }
  let left = 0;
  let right = entries.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const currentAddress = Number(entries[mid]?.address);
    if (!Number.isFinite(currentAddress)) {
      break;
    }
    if (currentAddress <= address) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (best < 0) {
    return null;
  }
  return entries[best] || null;
};

const lookupExpandedSourceByPc = (pcValue) => {
  const pc = Number(pcValue);
  const entry = findNearestDisassemblyEntryByAddress(debugDisassemblyEntries, pc);
  if (!entry || !Number.isInteger(entry.line) || entry.line <= 0) {
    return null;
  }
  return {
    line: entry.line,
    sourceLine: Number.isInteger(entry.sourceLine) && entry.sourceLine > 0 ? entry.sourceLine : null,
    text: String(entry.text || ''),
    section: 'objdump',
  };
};

const lookupUploadDisasmLineByPc = (pcValue) => {
  const pc = Number(pcValue);
  const entry = findNearestDisassemblyEntryByAddress(debugDisassemblyEntries, pc);
  if (!entry || !Number.isInteger(entry.line) || entry.line <= 0) {
    return null;
  }
  return entry.line;
};

const parsePcValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return Number.NaN;
    }
    if (text.startsWith('0x') || text.startsWith('0X')) {
      return Number.parseInt(text.slice(2), 16);
    }
    return Number(text);
  }
  return Number.NaN;
};

const augmentStateWithSourceLine = (state) => {
  if (!state || typeof state !== 'object') {
    return state;
  }
  const pc = parsePcValue(state.pc);
  const sourceEntry = lookupSourceEntryByPc(pc);
  const sourceLine = Number(sourceEntry?.line);
  if (Number.isInteger(sourceLine) && sourceLine > 0) {
    state.sourceLine = sourceLine;
  }
  if (sourceEntry?.file) {
    state.sourceFile = sourceEntry.file;
  }
  if (debugLineFile) {
    state.debugLineFile = debugLineFile;
  }
  const expandedSource = lookupExpandedSourceByPc(pc);
  if (expandedSource) {
    state.expandedSourceLine = expandedSource.line;
    if (Number.isInteger(expandedSource.sourceLine) && expandedSource.sourceLine > 0) {
      state.expandedSourceOriginLine = expandedSource.sourceLine;
    } else if (sourceLine !== null) {
      state.expandedSourceOriginLine = sourceLine;
    }
    state.expandedSourceText = expandedSource.text;
    state.expandedSourceSection = expandedSource.section;
  }
  if (expandedSourceFile) {
    state.expandedSourceFile = expandedSourceFile;
  }
  const uploadDisasmLine = lookupUploadDisasmLineByPc(pc);
  if (uploadDisasmLine !== null) {
    state.uploadDisasmLine = uploadDisasmLine;
  }
  const lastCommittedPc = parsePcValue(state.lastCommittedPc);
  if (Number.isFinite(lastCommittedPc)) {
    const lastCommittedExpanded = lookupExpandedSourceByPc(lastCommittedPc);
    if (lastCommittedExpanded && Number.isInteger(lastCommittedExpanded.line) && lastCommittedExpanded.line > 0) {
      state.lastCommittedExpandedSourceLine = lastCommittedExpanded.line;
    }
    const lastCommittedSourceEntry = lookupSourceEntryByPc(lastCommittedPc);
    const lastCommittedSourceLine = Number(lastCommittedSourceEntry?.line);
    if (Number.isInteger(lastCommittedSourceLine) && lastCommittedSourceLine > 0) {
      state.lastCommittedSourceLine = lastCommittedSourceLine;
    }
    if (lastCommittedSourceEntry?.file) {
      state.lastCommittedSourceFile = lastCommittedSourceEntry.file;
    }
  }
  return state;
};

const refreshLineMapFromElf = async ({
  requestId,
  baseUrl,
  cacheBust,
  elfBytes,
  elfPath = `${UPLOAD_TMP_DIR}/upload.elf`,
}) => {
  debugLineEntries = null;
  debugLineFile = '';
  const factory = getReadelfFactory({ baseUrl, cacheBust });
  const decodedLine = await runBinutilsModule({
    requestId,
    factory,
    label: 'readelf',
    args: ['--debug-dump=decodedline', elfPath],
    preRun: (module) => {
      module.FS.writeFile(elfPath, new Uint8Array(elfBytes));
    },
    silent: true,
  });
  const parsed = parseReadelfDecodedLine(decodedLine.stdoutLines);
  if (parsed.entries.length > 0) {
    debugLineEntries = parsed.entries;
    debugLineFile = parsed.sourceFile;
  }
  return parsed.entries.length;
};

const clearExpandedSourceMap = () => {
  expandedSourceEntries = null;
  expandedSourceText = '';
  expandedSourceFile = '';
  expandedSourceLinks = [];
};

const clearDisassemblyText = () => {
  debugDisassemblyText = '';
  debugDisassemblyEntries = null;
};

const refreshExpandedSourceMapFromDisassembly = (disassemblyText, disassemblyEntries, elfPath) => {
  clearExpandedSourceMap();
  if (typeof disassemblyText !== 'string' || !disassemblyText.trim()) {
    return 0;
  }
  expandedSourceText = disassemblyText;
  expandedSourceEntries = Array.isArray(disassemblyEntries) ? disassemblyEntries : [];
  expandedSourceLinks = buildSourceToDisasmLinks(debugLineEntries, expandedSourceEntries, 'program.S');
  const elfName = basenameFromPath(elfPath, 'generated_program.elf');
  expandedSourceFile = `${elfName} (objdump)`;
  return expandedSourceLinks.length;
};

const expandedSourcePayload = () => ({
  expandedSourceText,
  expandedSourceFile,
  expandedSourceLinks,
  expandedSourceEntries: Array.isArray(expandedSourceEntries) ? expandedSourceEntries.length : 0,
  disassemblyText: debugDisassemblyText,
});

const refreshDisassemblyFromElf = async ({
  requestId,
  baseUrl,
  cacheBust,
  elfBytes,
  elfPath = `${UPLOAD_TMP_DIR}/upload.elf`,
}) => {
  clearDisassemblyText();
  let factory = null;
  try {
    factory = getObjdumpFactory({ baseUrl, cacheBust });
  } catch {
    return '';
  }
  const result = await runBinutilsModule({
    requestId,
    factory,
    label: 'objdump',
    args: ['-d', '-M', 'no-aliases', elfPath],
    preRun: (module) => {
      module.FS.writeFile(elfPath, new Uint8Array(elfBytes));
    },
    silent: true,
  });
  const text = result.stdoutLines.join('\n');
  debugDisassemblyText = text;
  debugDisassemblyEntries = annotateDisassemblyEntriesWithSource(
    debugLineEntries,
    parseObjdumpAddressMap(text)
  );
  refreshExpandedSourceMapFromDisassembly(text, debugDisassemblyEntries, elfPath);
  return text;
};

const requireSession = (Module) => {
  if (!debugSessionReady) {
    throw new Error('Debug session is not initialized. Click Build + Init or Init ELF first.');
  }
  if (!Module || typeof Module._debug_state_json !== 'function') {
    throw new Error('Debug runtime is not available.');
  }
};

const getStepAnchor = (state) => {
  if (!state || typeof state !== 'object') {
    return 'none';
  }
  const sourceLine = Number(state.sourceLine);
  if (Number.isInteger(sourceLine) && sourceLine > 0) {
    return `src:${sourceLine}`;
  }
  const uploadLine = Number(state.uploadDisasmLine);
  if (Number.isInteger(uploadLine) && uploadLine > 0) {
    return `upload:${uploadLine}`;
  }
  const expandedLine = Number(state.expandedSourceLine);
  if (Number.isInteger(expandedLine) && expandedLine > 0) {
    return `expanded:${expandedLine}`;
  }
  if (typeof state.pc === 'string' && state.pc) {
    return `pc:${state.pc}`;
  }
  return 'none';
};

const startSession = async ({
  requestId,
  baseUrl,
  cacheBust,
  configText,
  elfBytes,
  elfName,
  traceEnabled = true,
}) => {
  const Module = await getDebugModule(baseUrl, cacheBust);
  const elfPath = toUploadElfPath(elfName, 'upload.elf');
  clearOutput();
  clearExpandedSourceMap();
  clearDisassemblyText();
  await refreshLineMapFromElf({ requestId, baseUrl, cacheBust, elfBytes, elfPath });
  await refreshDisassemblyFromElf({ requestId, baseUrl, cacheBust, elfBytes, elfPath });
  return {
    ...(initDebugSessionWithElf({
      requestId,
      Module,
      configText,
      elfBytes,
      traceEnabled,
    })),
    ...expandedSourcePayload(),
  };
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
  traceEnabled = true,
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
  clearDisassemblyText();
  const sourcePath = `${EDIT_TMP_DIR}/program.S`;
  const objectPath = `${EDIT_TMP_DIR}/program.o`;
  const linkerPath = `${EDIT_TMP_DIR}/link.ld`;
  const generatedElfPath = `${EDIT_TMP_DIR}/generated_program.elf`;

  pushOutputLine(`Running in worker: assembling ${sourcePath}`);
  flushOutput(requestId, false);

  const asFactory = getGasFactory({ baseUrl, cacheBust });
  const linkerFactory = getLdFactory({ baseUrl, cacheBust });

  const commonGasArgs = [
    '-g',
    `-march=${String(gasMarch || 'rv64imac')}`,
    `-mabi=${String(gasAbi || 'lp64')}`,
  ];
  const gasArgs = [
    ...commonGasArgs,
    '-o',
    objectPath,
    sourcePath,
  ];
  const gasResult = await runBinutilsModule({
    requestId,
    factory: asFactory,
    label: 'gas',
    args: gasArgs,
    preRun: (gasModule) => {
      gasModule.FS.writeFile(sourcePath, sourceText);
    },
  });

  let objectFile = null;
  try {
    objectFile = gasResult.module.FS.readFile(objectPath);
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

  pushOutputLine(`gas: produced ${objectPath} (${objectFile.length} bytes)`);
  flushOutput(requestId, false);

  const ldArgs = [
    '-m',
    'elf64lriscv',
    '-T',
    linkerPath,
    '-o',
    generatedElfPath,
    objectPath,
  ];
  const ldResult = await runBinutilsModule({
    requestId,
    factory: linkerFactory,
    label: 'ld',
    args: ldArgs,
    preRun: (ldModule) => {
      ldModule.FS.writeFile(objectPath, objectFile);
      ldModule.FS.writeFile(linkerPath, linkerText);
    },
  });

  let elfBytes = null;
  try {
    elfBytes = ldResult.module.FS.readFile(generatedElfPath);
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

  pushOutputLine(`ld: produced ${generatedElfPath} (${elfBytes.length} bytes)`);
  flushOutput(requestId, false);

  const lineCount = await refreshLineMapFromElf({
    requestId,
    baseUrl,
    cacheBust,
    elfBytes,
    elfPath: generatedElfPath,
  });
  await refreshDisassemblyFromElf({
    requestId,
    baseUrl,
    cacheBust,
    elfBytes,
    elfPath: generatedElfPath,
  });
  const expandedCount = expandedSourceLinks.length;
  if (lineCount > 0) {
    pushOutputLine(`readelf: loaded ${lineCount} debug line entries`);
    flushOutput(requestId, false);
  }
  if (expandedCount > 0) {
    pushOutputLine(`objdump: mapped ${expandedCount} source/disasm groups`);
    flushOutput(requestId, false);
  }

  return {
    ...(initDebugSessionWithElf({
      requestId,
      Module,
      configText,
      elfBytes,
      traceEnabled,
    })),
    ...expandedSourcePayload(),
    elfSize: elfBytes.length,
    lineMapEntries: lineCount,
    expandedMapEntries: expandedCount,
  };
};

const stepSession = async ({ requestId, steps = 1 }) => {
  const Module = debugModuleInstance;
  requireSession(Module);
  if (typeof Module._debug_set_trace === 'function') {
    Module._debug_set_trace(1);
  }
  const outputStart = outputLines.length;

  const committed = Number(Module._debug_step(Math.max(1, steps | 0)));
  if (committed < 0) {
    throw new Error(readDebugError(Module) || `debug_step failed (${committed})`);
  }

  const state = augmentStateWithSourceLine(readDebugState(Module));
  flushOutput(requestId, false);
  const traceRegWrites = extractTraceRegWrites(
    collectOutputSince(outputStart),
    state?.lastCommittedPc ?? null
  );
  return {
    state,
    committed,
    traceRegWrites,
  };
};

const stepLineSession = async ({ requestId, maxSteps = 4096 }) => {
  const Module = debugModuleInstance;
  requireSession(Module);
  if (typeof Module._debug_set_trace === 'function') {
    Module._debug_set_trace(1);
  }
  const outputStart = outputLines.length;

  const initialState = augmentStateWithSourceLine(readDebugState(Module));
  const initialAnchor = getStepAnchor(initialState);
  const maxCount = Math.max(1, Math.min(200000, maxSteps | 0));
  let committedTotal = 0;
  let latestState = initialState;

  while (committedTotal < maxCount && Module._debug_is_halted() !== 1) {
    const committed = Number(Module._debug_step(1));
    if (committed < 0) {
      throw new Error(readDebugError(Module) || `debug_step failed (${committed})`);
    }
    if (committed === 0 && Module._debug_is_halted() !== 1) {
      throw new Error(readDebugError(Module) || 'debug runtime made no progress');
    }
    committedTotal += committed;
    latestState = augmentStateWithSourceLine(readDebugState(Module));
    const latestAnchor = getStepAnchor(latestState);
    if (latestAnchor !== initialAnchor) {
      const committedPc = latestState?.lastCommittedPc ?? null;
      flushOutput(requestId, false);
      const traceRegWrites = extractTraceRegWrites(
        collectOutputSince(outputStart),
        committedPc
      );
      return {
        state: latestState,
        committed: committedTotal,
        reachedNext: true,
        traceRegWrites,
      };
    }
  }

  const committedPc = latestState?.lastCommittedPc ?? null;
  flushOutput(requestId, false);
  const traceRegWrites = extractTraceRegWrites(
    collectOutputSince(outputStart),
    committedPc
  );
  return {
    state: latestState,
    committed: committedTotal,
    reachedNext: false,
    traceRegWrites,
  };
};

const runSession = async ({ requestId, chunk = 5000, watchdogMs = 15000 }) => {
  const Module = debugModuleInstance;
  requireSession(Module);
  if (typeof Module._debug_set_trace === 'function') {
    Module._debug_set_trace(1);
  }
  const outputStart = outputLines.length;

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
  const state = augmentStateWithSourceLine(readDebugState(Module));
  const traceRegWrites = extractTraceRegWrites(
    collectOutputSince(outputStart),
    state?.lastCommittedPc ?? null
  );
  return {
    state,
    committed: committedTotal,
    traceRegWrites,
  };
};

const resetSession = async () => {
  if (debugModuleInstance && typeof debugModuleInstance._debug_reset === 'function') {
    debugModuleInstance._debug_reset();
  }
  debugSessionReady = false;
  debugLineEntries = null;
  debugLineFile = '';
  clearExpandedSourceMap();
  clearDisassemblyText();
  clearOutput();
  return { state: null, committed: 0, ...expandedSourcePayload() };
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
    ...expandedSourcePayload(),
  });
};

if (
  typeof globalThis !== 'undefined' &&
  globalThis.__SAIL_DEBUG_WORKER_TEST_API__ &&
  typeof globalThis.__SAIL_DEBUG_WORKER_TEST_API__ === 'object'
) {
  Object.assign(globalThis.__SAIL_DEBUG_WORKER_TEST_API__, {
    buildSourceToDisasmLinks,
    extractTraceRegWrites,
    findNearestSourceLineByAddress,
    parseObjdumpAddressMap,
  });
}

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
          elfName: message.elfName,
          traceEnabled: message.traceEnabled,
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
          traceEnabled: message.traceEnabled,
        });
        break;
      case 'step':
        result = await stepSession({
          requestId,
          steps: message.steps,
        });
        break;
      case 'stepLine':
        result = await stepLineSession({
          requestId,
          maxSteps: message.maxSteps,
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
          ...expandedSourcePayload(),
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
