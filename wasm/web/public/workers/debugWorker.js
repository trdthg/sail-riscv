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
let debugSectionAddresses = {};
let expandedSourceEntries = null;
let expandedSourceText = '';
let expandedSourceFile = '';
let debugDisassemblyText = '';
let debugDisassemblyEntries = null;

let outputLines = [];
let emittedLineCount = 0;

const MAX_OUTPUT_LINES = 40000;
const TMP_ROOT_DIR = '/tmp';
const EDIT_TMP_DIR = '/tmp/edit';
const UPLOAD_TMP_DIR = '/tmp/upload';

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

const parseReadelfSectionAddresses = (lines) => {
  const sections = {};
  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const match = line.match(/^\s*\[\s*\d+\]\s+(\S+)\s+\S+\s+([0-9a-fA-F]{8,16})\s+[0-9a-fA-F]+\b/);
    if (!match) {
      continue;
    }
    const name = match[1];
    const address = Number.parseInt(match[2], 16);
    if (!Number.isFinite(address)) {
      continue;
    }
    sections[name] = address;
  }
  return sections;
};

const resolveSectionAddress = (sectionAddresses, sectionName) => {
  if (!sectionName) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(sectionAddresses, sectionName)) {
    return sectionAddresses[sectionName];
  }
  if (sectionName.startsWith('.text') && Object.prototype.hasOwnProperty.call(sectionAddresses, '.text')) {
    return sectionAddresses['.text'];
  }
  if (sectionName.startsWith('.rodata') && Object.prototype.hasOwnProperty.call(sectionAddresses, '.rodata')) {
    return sectionAddresses['.rodata'];
  }
  if (sectionName.startsWith('.data') && Object.prototype.hasOwnProperty.call(sectionAddresses, '.data')) {
    return sectionAddresses['.data'];
  }
  return null;
};

const detectSectionFromListingText = (rawText, currentSection) => {
  const text = String(rawText || '').replace(/^>\s*/, '').trim();
  if (!text) {
    return currentSection;
  }
  const sectionMatch = text.match(/^\.section\s+([^\s,]+)/);
  if (sectionMatch) {
    return sectionMatch[1];
  }
  if (/^\.text\b/.test(text)) {
    return '.text';
  }
  if (/^\.rodata\b/.test(text)) {
    return '.rodata';
  }
  if (/^\.data\b/.test(text)) {
    return '.data';
  }
  if (/^\.bss\b/.test(text)) {
    return '.bss';
  }
  return currentSection;
};

const parseListingAddressMap = (listingText, sectionAddresses) => {
  const lines = String(listingText || '').split(/\r?\n/);
  const entries = [];
  const perSectionCursor = {};
  let currentSection = '.text';

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const splitAt = rawLine.indexOf('\t');
    const left = splitAt >= 0 ? rawLine.slice(0, splitAt) : rawLine;
    const right = splitAt >= 0 ? rawLine.slice(splitAt + 1) : '';
    const sourceText = right.trimEnd();
    currentSection = detectSectionFromListingText(sourceText, currentSection);

    const columns = left.trim();
    if (!columns) {
      continue;
    }
    const tokens = columns.split(/\s+/);
    if (tokens.length < 2 || !/^\d+$/.test(tokens[0])) {
      continue;
    }

    const sourceLine = Number.parseInt(tokens[0], 10);
    const second = tokens[1] || '';
    const third = tokens[2] || '';
    const hasAddressToken = /^[0-9a-fA-F?]{4,16}$/.test(second) && /^[0-9a-fA-F]+$/.test(third);
    const hasBytesOnly = !hasAddressToken && /^[0-9a-fA-F]+$/.test(second);
    if (!hasAddressToken && !hasBytesOnly) {
      continue;
    }

    const bytesToken = hasAddressToken ? third : second;
    if (!bytesToken || !/^[0-9a-fA-F]+$/.test(bytesToken)) {
      continue;
    }

    const sizeBytes = Math.max(1, Math.ceil(bytesToken.length / 2));
    const sectionKey = currentSection || '.text';
    const cursor = perSectionCursor[sectionKey] || { lastOffset: null, lastSize: 0 };

    let offset = null;
    if (hasAddressToken && /^[0-9a-fA-F]+$/.test(second)) {
      offset = Number.parseInt(second, 16);
    } else if (cursor.lastOffset !== null) {
      offset = cursor.lastOffset + cursor.lastSize;
    }
    if (!Number.isFinite(offset)) {
      continue;
    }

    cursor.lastOffset = offset;
    cursor.lastSize = sizeBytes;
    perSectionCursor[sectionKey] = cursor;

    const sectionAddress = resolveSectionAddress(sectionAddresses, sectionKey);
    if (!Number.isFinite(sectionAddress)) {
      continue;
    }

    entries.push({
      address: sectionAddress + offset,
      line: lineNumber,
      sourceLine: Number.isFinite(sourceLine) ? sourceLine : null,
      section: sectionKey,
      text: sourceText.replace(/^>\s*/, ''),
    });
  }

  entries.sort((left, right) => left.address - right.address);
  return {
    sourceText: lines.join('\n'),
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

const lookupExpandedSourceByPc = (pcValue) => {
  if (!Array.isArray(expandedSourceEntries) || expandedSourceEntries.length === 0) {
    return null;
  }
  const pc = Number(pcValue);
  if (!Number.isFinite(pc)) {
    return null;
  }
  let left = 0;
  let right = expandedSourceEntries.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const address = expandedSourceEntries[mid].address;
    if (address <= pc) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (best < 0) {
    return null;
  }
  const entry = expandedSourceEntries[best];
  if (!entry || !Number.isInteger(entry.line) || entry.line <= 0) {
    return null;
  }
  return entry;
};

const parseObjdumpAddressMap = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*([0-9a-fA-F]+):\s+([0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})*|[0-9a-fA-F]{4,})\s+\S/);
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
    });
  }
  entries.sort((left, right) => left.address - right.address);
  return entries;
};

const lookupUploadDisasmLineByPc = (pcValue) => {
  if (!Array.isArray(debugDisassemblyEntries) || debugDisassemblyEntries.length === 0) {
    return null;
  }
  const pc = Number(pcValue);
  if (!Number.isFinite(pc)) {
    return null;
  }
  let left = 0;
  let right = debugDisassemblyEntries.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const address = debugDisassemblyEntries[mid].address;
    if (address <= pc) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (best < 0) {
    return null;
  }
  const entry = debugDisassemblyEntries[best];
  if (!entry || !Number.isInteger(entry.line) || entry.line <= 0) {
    return null;
  }
  return entry.line;
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
  const expandedSource = lookupExpandedSourceByPc(pc);
  if (expandedSource) {
    state.expandedSourceLine = expandedSource.line;
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
  debugSectionAddresses = {};
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
  const sectionHeaders = await runBinutilsModule({
    requestId,
    factory,
    label: 'readelf',
    args: ['-S', elfPath],
    preRun: (module) => {
      module.FS.writeFile(elfPath, new Uint8Array(elfBytes));
    },
    silent: true,
  });
  debugSectionAddresses = parseReadelfSectionAddresses(sectionHeaders.stdoutLines);
  return parsed.entries.length;
};

const clearExpandedSourceMap = () => {
  expandedSourceEntries = null;
  expandedSourceText = '';
  expandedSourceFile = '';
};

const clearDisassemblyText = () => {
  debugDisassemblyText = '';
  debugDisassemblyEntries = null;
};

const refreshExpandedSourceMapFromListing = (listingText) => {
  clearExpandedSourceMap();
  const parsed = parseListingAddressMap(listingText, debugSectionAddresses);
  if (parsed.entries.length > 0) {
    expandedSourceEntries = parsed.entries;
    expandedSourceText = parsed.sourceText;
    expandedSourceFile = `${EDIT_TMP_DIR}/program.S (expanded listing)`;
  }
  return parsed.entries.length;
};

const expandedSourcePayload = () => ({
  expandedSourceText,
  expandedSourceFile,
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
  debugDisassemblyEntries = parseObjdumpAddressMap(text);
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

const startSession = async ({ requestId, baseUrl, cacheBust, configText, elfBytes, elfName }) => {
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
  const listingPath = `${EDIT_TMP_DIR}/program.lst`;
  const objectPath = `${EDIT_TMP_DIR}/program.o`;
  const linkerPath = `${EDIT_TMP_DIR}/link.ld`;
  const generatedElfPath = `${EDIT_TMP_DIR}/generated_program.elf`;

  pushOutputLine(`Running in worker: assembling ${sourcePath}`);
  flushOutput(requestId, false);

  const asFactory = getGasFactory({ baseUrl, cacheBust });
  const linkerFactory = getLdFactory({ baseUrl, cacheBust });

  const gasArgs = [
    '-g',
    `-almhnd=${listingPath}`,
    `-march=${String(gasMarch || 'rv64imac')}`,
    `-mabi=${String(gasAbi || 'lp64')}`,
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

  let listingText = '';
  try {
    listingText = gasResult.module.FS.readFile(listingPath, { encoding: 'utf8' });
  } catch {
    listingText = '';
  }

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
  const expandedCount = refreshExpandedSourceMapFromListing(listingText);
  if (lineCount > 0) {
    pushOutputLine(`readelf: loaded ${lineCount} debug line entries`);
    flushOutput(requestId, false);
  }
  if (expandedCount > 0) {
    pushOutputLine(`gas: loaded ${expandedCount} expanded listing entries`);
    flushOutput(requestId, false);
  }

  return {
    ...(initDebugSessionWithElf({
      requestId,
      Module,
      configText,
      elfBytes,
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
  debugSectionAddresses = {};
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
