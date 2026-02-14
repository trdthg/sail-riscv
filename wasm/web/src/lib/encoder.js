import {
  parseAsmInput,
  compileAsmRegex,
  parseLocation,
  parseImmediate,
  parseFenceMask,
  parseRoundingMode,
  parseRegister,
  registerMaps,
} from './parse.js';

export const encodeWithUdb = (asmLine, index, xlen) => {
  const parsedInput = parseAsmInput(asmLine);
  if (!parsedInput) return { error: 'empty assembly' };
  const { mnemonic, operands } = parsedInput;
  const candidates = index.filter((inst) => inst.name.toLowerCase() === mnemonic);
  if (!candidates.length) return { error: `unknown instruction: ${mnemonic}` };
  const xlenKey = xlen === 32 ? 'RV32' : 'RV64';

  for (const inst of candidates) {
    const encoding = inst.encodings.find((e) => e.xlen === xlenKey) || inst.encodings.find((e) => e.xlen === 'ANY');
    if (!encoding) continue;
    const template = inst.assembly || '';
    const varNames = new Set((encoding.variables || []).map((v) => v.name));
    const regex = compileAsmRegex(template, varNames);
    if (template.trim() === '' && operands.trim() !== '') continue;
    const match = template.trim() === '' ? { groups: {} } : regex.exec(operands);
    if (!match) continue;

    const width = encoding.match.length;
    const bits = encoding.match.split('');
    const vars = encoding.variables || [];
    const values = {};
    let ok = true;

    for (const variable of vars) {
      const name = variable.name;
      const token = match.groups ? match.groups[name] : undefined;
      let value = null;

      if (token !== undefined) {
        if (/^(rd|rs[123]|xs[123]?|xd)$/i.test(name)) {
          value = parseRegister(token, 'x', registerMaps.intAbiMap);
        } else if (/^(fd|fs[123])$/i.test(name)) {
          value = parseRegister(token, 'f', registerMaps.floatAbiMap);
        } else if (/^(vd|vs[123])$/i.test(name)) {
          value = parseRegister(token, 'v');
        } else if (name === 'vm') {
          const cleaned = token.toLowerCase();
          value = cleaned === 'v0.t' || cleaned === 'v0' ? 0 : Number(cleaned);
        } else if (name === 'pred' || name === 'succ') {
          value = parseFenceMask(token);
        } else if (name === 'rm') {
          value = parseRoundingMode(token);
        } else {
          const imm = parseImmediate(token);
          value = imm === null ? null : imm;
        }

        if (value === null || value === undefined || Number.isNaN(value)) {
          ok = false;
          break;
        }
      } else {
        if (Array.isArray(variable.not) && variable.not.includes(0)) {
          value = 1n;
        } else {
          value = 0n;
        }
      }

      values[name] = value;
    }

    if (!ok) continue;

    for (const variable of vars) {
      const name = variable.name;
      const locs = parseLocation(variable.location);
      const totalWidth = locs.reduce((sum, [hi, lo]) => sum + (hi - lo + 1), 0);
      let value = BigInt(values[name]);
      const leftShift = variable.left_shift ? Number(variable.left_shift) : 0;
      if (leftShift > 0) {
        const mask = (1n << BigInt(leftShift)) - 1n;
        if ((value & mask) !== 0n) {
          ok = false;
          break;
        }
        value >>= BigInt(leftShift);
      }
      const maxVal = 1n << BigInt(totalWidth);
      if (value < 0) {
        value = maxVal + value;
      }
      if (value < 0 || value >= maxVal) {
        ok = false;
        break;
      }

      const bitString = value.toString(2).padStart(totalWidth, '0');
      let cursor = 0;
      for (const [hi, lo] of locs) {
        for (let bit = hi; bit >= lo; bit -= 1) {
          const idx = width - 1 - bit;
          const b = bitString[cursor++];
          if (bits[idx] === '1' || bits[idx] === '0') {
            if (bits[idx] !== b) {
              ok = false;
              break;
            }
          }
          bits[idx] = b;
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (!ok) continue;

    const normalizedBits = bits.map((b) => (b === '-' ? '0' : b)).join('');
    let value = 0n;
    for (const bit of normalizedBits) {
      value = (value << 1n) | BigInt(bit === '1');
    }
    const hex = `0x${value.toString(16)}`;
    const bin = normalizedBits;
    return {
      asm: asmLine.trim(),
      width,
      hex,
      bin,
    };
  }

  return { error: `no encoding matched: ${asmLine.trim()}` };
};
