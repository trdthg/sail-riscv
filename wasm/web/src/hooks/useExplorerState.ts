import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFieldMap, buildSegments, matchEncoding } from '../lib/bits.js';
import { encodeWithUdb } from '../lib/encoder.js';
import {
  formatBin,
  hexToBin,
  isHex,
  normalizeBin,
  normalizeHex,
} from '../lib/instructionInput';
import { normalizeSingleInstructionAsmInput } from '../lib/singleInstructionAsm';
import { parseToolLines } from '../lib/toolOutput';

type ExplorerStateArgs = {
  append: (line: string) => void;
  runTool: (args: string[]) => Promise<string[] | undefined>;
  configPath: string;
  udbState: any;
  isaState: any;
};

const resolveBin = (binInput: string, hexInput: string) => {
  const binClean = binInput ? normalizeBin(binInput) : '';
  const fallbackHex = normalizeHex(hexInput);
  if (binClean) {
    return binClean;
  }
  if (!fallbackHex || !isHex(fallbackHex)) {
    return '';
  }
  return normalizeBin(hexToBin(hexInput) || '');
};

const applyAssembleResultToInputs = (
  result: {
    hex?: unknown;
    bin?: unknown;
    width?: unknown;
  },
  setHexInput: (value: string) => void,
  setBinInput: (value: string) => void
) => {
  let hexValue = typeof result.hex === 'string' ? result.hex : '';
  const width = Number(result.width);

  if (hexValue && /^0x/i.test(hexValue) && (width === 16 || width === 32)) {
    const raw = hexValue.replace(/^0x/i, '');
    hexValue = `0x${raw.padStart(width / 4, '0')}`;
  }
  if (hexValue) {
    setHexInput(hexValue);
  }

  if (typeof result.bin === 'string' && result.bin) {
    setBinInput(formatBin(result.bin));
    return;
  }

  const nextBin = hexValue ? hexToBin(hexValue) : null;
  if (nextBin !== null) {
    setBinInput(nextBin);
  }
};

export const useExplorerState = ({
  append,
  runTool,
  configPath,
  udbState,
  isaState,
}: ExplorerStateArgs) => {
  const [hexInput, setHexInput] = useState('');
  const [binInput, setBinInput] = useState('');
  const [assemblyInput, setAssemblyInput] = useState('');
  const [assemblyStatus, setAssemblyStatus] = useState<'waiting' | 'updating' | 'updated' | 'empty' | 'error'>('waiting');
  const [assemblyMessage, setAssemblyMessage] = useState('');
  const [decodeMode, setDecodeMode] = useState<'auto' | '16' | '32'>('auto');

  const decodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assembleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assembleRequestRef = useRef(0);
  const lastEditedRef = useRef('');
  const binInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!lines || !lines.length) {
      return;
    }
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
    if (lastEditedRef.current === 'asm') {
      return;
    }
    const trimmed = normalizeHex(hexInput);
    if (!trimmed || !isHex(trimmed)) {
      return;
    }
    decodeTimerRef.current = setTimeout(() => {
      void runDecode();
    }, 1000);
    return () => {
      if (decodeTimerRef.current) {
        clearTimeout(decodeTimerRef.current);
      }
    };
  }, [configPath, hexInput, runDecode]);

  const encodeWithUdbPrimary = useCallback((trimmedAsm: string) => {
    if (udbState.state === 'loading') {
      return { ok: false as const, error: 'Unified-DB index is still loading.' };
    }
    if (udbState.state === 'hasError') {
      const message = udbState.error?.message
        ? `Unified-DB load failed: ${udbState.error.message}`
        : 'Unified-DB index not loaded.';
      return { ok: false as const, error: message };
    }
    if (udbState.state !== 'hasData') {
      return { ok: false as const, error: 'Unified-DB index not loaded.' };
    }
    const isa = isaState.state === 'hasData' ? isaState.data.toLowerCase() : '';
    const xlen = isa.startsWith('rv32') ? 32 : 64;
    const result = encodeWithUdb(trimmedAsm, udbState.data, xlen);
    if (result.error) {
      return { ok: false as const, error: String(result.error) };
    }
    return { ok: true as const, result };
  }, [isaState, udbState]);

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
      setAssemblyMessage('');
      return;
    }
    const requestId = ++assembleRequestRef.current;
    assembleTimerRef.current = setTimeout(() => {
      if (requestId !== assembleRequestRef.current) {
        return;
      }

      setAssemblyStatus('updating');
      setAssemblyMessage('Encoding with UDB...');

      let normalizedAsm = '';
      try {
        normalizedAsm = normalizeSingleInstructionAsmInput(trimmed);
      } catch (validationError) {
        if (requestId !== assembleRequestRef.current) {
          return;
        }
        setAssemblyStatus('error');
        setAssemblyMessage(validationError instanceof Error ? validationError.message : String(validationError));
        return;
      }

      const encoded = encodeWithUdbPrimary(normalizedAsm);
      if (requestId !== assembleRequestRef.current) {
        return;
      }
      if (!encoded.ok) {
        setAssemblyStatus('error');
        setAssemblyMessage(encoded.error);
        return;
      }

      applyAssembleResultToInputs(encoded.result, setHexInput, setBinInput);
      setAssemblyStatus('updated');
      setAssemblyMessage('');
    }, 1000);
    return () => {
      if (assembleTimerRef.current) {
        clearTimeout(assembleTimerRef.current);
      }
    };
  }, [assemblyInput, encodeWithUdbPrimary]);

  const bitLayout = useMemo(() => {
    if (udbState.state !== 'hasData') {
      return null;
    }
    const resolvedBin = resolveBin(binInput, hexInput);
    if (resolvedBin.length !== 32) {
      return null;
    }
    const mnemonic = assemblyInput.trim().split(/\s+/)[0]?.toLowerCase();
    const entries = udbState.data;
    const nameFiltered = mnemonic
      ? entries.filter((inst: any) => inst.name.toLowerCase() === mnemonic)
      : entries;

    const findEncoding = (list: any[]) => {
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
    if (!encoding) {
      return null;
    }

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
    if (udbState.state !== 'hasData') {
      return null;
    }
    const entries = udbState.data;
    const resolvedBin = resolveBin(binInput, hexInput);
    const mnemonic = assemblyInput.trim().split(/\s+/)[0]?.toLowerCase();

    if (resolvedBin.length === 32) {
      const nameFiltered = mnemonic
        ? entries.filter((inst: any) => inst.name.toLowerCase() === mnemonic)
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
      const inst = entries.find((item: any) => item.name.toLowerCase() === mnemonic);
      if (inst) {
        return { inst, encoding: inst.encodings?.[0] || null, bin: resolvedBin || null };
      }
    }
    return null;
  }, [assemblyInput, binInput, hexInput, udbState]);

  return {
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
  };
};
