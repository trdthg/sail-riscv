'use strict';

(function attachLineMappingInternal(globalScope) {
  const namespace =
    globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ ||
    (globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ = {});

  const parseReadelfDecodedLine = (lines) => {
    if (!Array.isArray(lines)) {
      return [];
    }
    const entries = [];
    for (const line of lines) {
      const m = String(line).match(/^\s*(0x)?([0-9a-fA-F]+)\s+(\d+)\s+(\d+)/);
      if (!m) {
        continue;
      }
      const addr = Number.parseInt(m[2], 16);
      const sourceLine = Number.parseInt(m[4], 10);
      if (!Number.isFinite(addr) || !Number.isFinite(sourceLine)) {
        continue;
      }
      entries.push({ address: addr, line: sourceLine });
    }
    entries.sort((left, right) => left.address - right.address);
    return entries;
  };

  const findNearestSourceLineByAddress = (lineEntries, address) => {
    if (!Array.isArray(lineEntries) || lineEntries.length === 0) {
      return null;
    }
    let left = 0;
    let right = lineEntries.length - 1;
    let best = null;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const entry = lineEntries[mid];
      if (entry.address <= address) {
        best = entry;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return best;
  };

  const parseObjdumpAddressMap = (text) => {
    const lines = String(text || '').split('\n');
    const entries = [];
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      const match = raw.match(/^\s*([0-9a-fA-F]+):\s+([0-9a-fA-F]{4,16})\s+/);
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
        text: raw,
      });
    }
    return entries;
  };

  const annotateDisassemblyEntriesWithSource = (lineEntries, disasmEntries) => {
    if (!Array.isArray(disasmEntries)) {
      return [];
    }
    return disasmEntries.map((entry) => {
      const sourceEntry = findNearestSourceLineByAddress(lineEntries, entry.address);
      return {
        ...entry,
        sourceLine: sourceEntry ? sourceEntry.line : null,
      };
    });
  };

  const buildSourceToDisasmLinks = (lineEntries, disasmEntries) => {
    if (!Array.isArray(lineEntries) || !lineEntries.length || !Array.isArray(disasmEntries)) {
      return [];
    }
    const sourceToLines = new Map();
    for (const disasmEntry of disasmEntries) {
      if (!disasmEntry || typeof disasmEntry !== 'object') {
        continue;
      }
      const sourceEntry = findNearestSourceLineByAddress(lineEntries, disasmEntry.address);
      const sourceLine = Number(sourceEntry?.line);
      const disasmLine = Number(disasmEntry.line);
      if (!Number.isInteger(sourceLine) || sourceLine <= 0) {
        continue;
      }
      if (!Number.isInteger(disasmLine) || disasmLine <= 0) {
        continue;
      }
      if (!sourceToLines.has(sourceLine)) {
        sourceToLines.set(sourceLine, new Set());
      }
      sourceToLines.get(sourceLine).add(disasmLine);
    }
    return Array.from(sourceToLines.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([sourceLine, lines]) => ({
        sourceLine,
        expandedLines: Array.from(lines).sort((left, right) => left - right),
      }));
  };

  const findNearestDisassemblyEntryByAddress = (entries, address) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }
    let left = 0;
    let right = entries.length - 1;
    let best = null;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const entry = entries[mid];
      if (entry.address <= address) {
        best = entry;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return best;
  };

  namespace.parseReadelfDecodedLine = parseReadelfDecodedLine;
  namespace.parseObjdumpAddressMap = parseObjdumpAddressMap;
  namespace.findNearestSourceLineByAddress = findNearestSourceLineByAddress;
  namespace.annotateDisassemblyEntriesWithSource = annotateDisassemblyEntriesWithSource;
  namespace.findNearestDisassemblyEntryByAddress = findNearestDisassemblyEntryByAddress;
  namespace.buildSourceToDisasmLinks = buildSourceToDisasmLinks;
})(self);
