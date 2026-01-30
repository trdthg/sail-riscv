const intAbiMap = new Map([
  ['zero', 0], ['ra', 1], ['sp', 2], ['gp', 3], ['tp', 4],
  ['t0', 5], ['t1', 6], ['t2', 7],
  ['s0', 8], ['fp', 8], ['s1', 9],
  ['a0', 10], ['a1', 11], ['a2', 12], ['a3', 13], ['a4', 14], ['a5', 15], ['a6', 16], ['a7', 17],
  ['s2', 18], ['s3', 19], ['s4', 20], ['s5', 21], ['s6', 22], ['s7', 23], ['s8', 24], ['s9', 25],
  ['s10', 26], ['s11', 27],
  ['t3', 28], ['t4', 29], ['t5', 30], ['t6', 31],
]);

const floatAbiMap = new Map([
  ['ft0', 0], ['ft1', 1], ['ft2', 2], ['ft3', 3], ['ft4', 4], ['ft5', 5], ['ft6', 6], ['ft7', 7],
  ['fs0', 8], ['fs1', 9],
  ['fa0', 10], ['fa1', 11], ['fa2', 12], ['fa3', 13], ['fa4', 14], ['fa5', 15], ['fa6', 16], ['fa7', 17],
  ['fs2', 18], ['fs3', 19], ['fs4', 20], ['fs5', 21], ['fs6', 22], ['fs7', 23], ['fs8', 24], ['fs9', 25],
  ['fs10', 26], ['fs11', 27],
  ['ft8', 28], ['ft9', 29], ['ft10', 30], ['ft11', 31],
]);

export const parseRegister = (token, prefix, abiMap) => {
  const cleaned = token.toLowerCase().replace(/\./g, '');
  if (cleaned.startsWith(prefix)) {
    const num = Number(cleaned.slice(prefix.length));
    if (Number.isInteger(num) && num >= 0 && num <= 31) return num;
  }
  if (abiMap && abiMap.has(cleaned)) return abiMap.get(cleaned);
  return null;
};

export const parseImmediate = (token) => {
  const cleaned = token.toLowerCase();
  if (/^-?0b[01]+$/.test(cleaned)) return BigInt(cleaned);
  if (/^-?0x[0-9a-f]+$/.test(cleaned)) return BigInt(cleaned);
  if (/^-?\d+$/.test(cleaned)) return BigInt(cleaned);
  return null;
};

export const parseFenceMask = (token) => {
  const cleaned = token.toLowerCase();
  let value = 0;
  if (cleaned.includes('i')) value |= 0b1000;
  if (cleaned.includes('o')) value |= 0b0100;
  if (cleaned.includes('r')) value |= 0b0010;
  if (cleaned.includes('w')) value |= 0b0001;
  return value;
};

export const parseRoundingMode = (token) => {
  const map = new Map([
    ['rne', 0], ['rtz', 1], ['rdn', 2], ['rup', 3], ['rmm', 4], ['dyn', 7],
  ]);
  const cleaned = token.toLowerCase();
  if (map.has(cleaned)) return map.get(cleaned);
  return null;
};

export const parseAsmInput = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const mnemonic = parts.shift();
  const operands = trimmed.slice(mnemonic.length).trim();
  return { mnemonic: mnemonic.toLowerCase(), operands };
};

export const compileAsmRegex = (template, varNames) => {
  const names = [...varNames].sort((a, b) => b.length - a.length);
  let regex = '^\\s*';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (/[A-Za-z0-9_]/.test(ch)) {
      let j = i + 1;
      while (j < template.length && /[A-Za-z0-9_]/.test(template[j])) j++;
      const word = template.slice(i, j);
      const match = names.find((name) => name === word);
      if (match) {
        regex += `(?<${match}>[^,()\\s]+)`;
      } else {
        regex += word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      i = j;
      continue;
    }
    if (/\s/.test(ch)) {
      regex += '\\s*';
    } else if (ch === ',') {
      regex += '\\s*,\\s*';
    } else if (ch === '(') {
      regex += '\\s*\\(\\s*';
    } else if (ch === ')') {
      regex += '\\s*\\)\\s*';
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    i += 1;
  }
  regex += '\\s*$';
  return new RegExp(regex);
};

export const parseLocation = (loc) => {
  if (typeof loc === 'number') return [[loc, loc]];
  if (typeof loc !== 'string') return [];
  return loc.split('|').map((part) => {
    if (part.includes('-')) {
      const [hi, lo] = part.split('-').map((v) => Number(v));
      return [hi, lo];
    }
    const bit = Number(part);
    return [bit, bit];
  });
};

export const registerMaps = {
  intAbiMap,
  floatAbiMap,
};
