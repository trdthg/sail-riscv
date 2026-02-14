'use strict';

(function attachTraceExtractInternal(globalScope) {
  const namespace =
    globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ ||
    (globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ = {});

  const TRACE_INSN_PC_PATTERN = /\[\d+\]\s+\[[A-Z]\]:\s+0x([0-9a-fA-F]+)/;
  const TRACE_REG_WRITE_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)\s*<-\s*(0x[0-9a-fA-F]+)/;
  const TRACE_MEM_WRITE_PATTERN = /mem\[([A-Za-z]),0x([0-9a-fA-F]+)\]\s*<-\s*0x([0-9a-fA-F]+)/i;
  const TRACE_HTIF_WRITE_PATTERN = /htif\[0x([0-9a-fA-F]+)\]\s*<-\s*0x([0-9a-fA-F]+)/i;

  const parsePcValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.toLowerCase();
    const parsed = normalized.startsWith('0x')
      ? Number.parseInt(normalized, 16)
      : Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const extractTraceRegWrites = (lines, committedPcValue) => {
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
        const regMatch = trimmed.match(TRACE_REG_WRITE_PATTERN);
        if (regMatch) {
          if (!currentBlock) {
            currentBlock = { pc: null, writes: [] };
          }
          currentBlock.writes.push({
            kind: 'reg',
            name: regMatch[1],
            value: regMatch[2],
          });
          continue;
        }
        const memMatch = trimmed.match(TRACE_MEM_WRITE_PATTERN);
        if (!memMatch) {
          const htifMatch = trimmed.match(TRACE_HTIF_WRITE_PATTERN);
          if (!htifMatch) {
            continue;
          }
          if (!currentBlock) {
            currentBlock = { pc: null, writes: [] };
          }
          currentBlock.writes.push({
            kind: 'mem',
            access: 'W',
            address: `0x${String(htifMatch[1] || '').toUpperCase()}`,
            value: `0x${String(htifMatch[2] || '').toUpperCase()}`,
          });
          continue;
        }
        if (!currentBlock) {
          currentBlock = { pc: null, writes: [] };
        }
        currentBlock.writes.push({
          kind: 'mem',
          access: String(memMatch[1] || '').toUpperCase(),
          address: `0x${String(memMatch[2] || '').toUpperCase()}`,
          value: `0x${String(memMatch[3] || '').toUpperCase()}`,
        });
      }
    }
    pushCurrentBlock();

    if (!blocks.length) {
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
          if (blocks[index].pc === committedPc) {
            selectedBlock = blocks[index];
            break;
          }
        }
      }
    }
    if (!selectedBlock) {
      for (let index = blocks.length - 1; index >= 0; index -= 1) {
        if (Array.isArray(blocks[index].writes) && blocks[index].writes.length > 0) {
          selectedBlock = blocks[index];
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

  namespace.parsePcValue = parsePcValue;
  namespace.extractTraceRegWrites = extractTraceRegWrites;
})(self);
