export type ParsedObjdumpInstruction = {
  asm: string;
  hex: string;
  bin: string;
  width: 16 | 32;
};

export const parseSingleInstructionFromObjdump = (text: string): ParsedObjdumpInstruction => {
  const matches: Array<{ bytes: string; asm: string }> = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = String(rawLine || '');
    const match = line.match(/^\s*[0-9a-fA-F]+:\s+([0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})*|[0-9a-fA-F]{4,})\s+(.+)$/);
    if (!match) {
      continue;
    }
    const bytes = match[1].replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]+$/.test(bytes) || bytes.length % 2 !== 0) {
      continue;
    }
    matches.push({
      bytes,
      asm: String(match[2] || '').trim(),
    });
  }

  if (matches.length === 0) {
    throw new Error('objdump did not produce a decodable instruction.');
  }
  if (matches.length !== 1) {
    throw new Error(`expected exactly one instruction, got ${matches.length}`);
  }

  const { bytes, asm } = matches[0];
  const byteCount = bytes.length / 2;
  const width = byteCount * 8;
  if (width !== 16 && width !== 32) {
    throw new Error(`unsupported instruction width from objdump: ${width}`);
  }

  let value = 0n;
  for (let i = 0; i < byteCount; i += 1) {
    const byteValue = BigInt(Number.parseInt(bytes.slice(i * 2, i * 2 + 2), 16));
    value |= byteValue << BigInt(i * 8);
  }

  return {
    asm,
    hex: `0x${value.toString(16).padStart(width / 4, '0')}`,
    bin: value.toString(2).padStart(width, '0'),
    width: width as 16 | 32,
  };
};
