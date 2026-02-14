export const MAX_BITS = 32;
export const MAX_HEX = MAX_BITS / 4;

export const normalizeHex = (value) => value.trim().toLowerCase().replace(/^0x/, '').replace(/\s+/g, '');

export const isHex = (value) => /^[0-9a-f]+$/i.test(value);

export const normalizeBin = (value) => value.replace(/[\s_]+/g, '');

export const isBin = (value) => /^[01]+$/.test(value);

export const formatBin = (value) => value.replace(/(.{4})/g, '$1 ').trim();

export const formatBinWithCursor = (raw, cursorPos) => {
  const clean = normalizeBin(raw).replace(/[^01]/g, '').slice(0, MAX_BITS);
  const display = formatBin(clean);
  const bitsBefore = normalizeBin(raw.slice(0, cursorPos)).replace(/[^01]/g, '').length;
  if (bitsBefore <= 0) return { display, cursor: 0 };
  const maxSpaces = Math.max(0, Math.floor((clean.length - 1) / 4));
  const spacesBefore = Math.min(Math.floor(bitsBefore / 4), maxSpaces);
  return { display, cursor: bitsBefore + spacesBefore };
};

export const clampHex = (value) => {
  const clean = normalizeHex(value).replace(/[^0-9a-f]/gi, '');
  return clean.slice(0, MAX_HEX);
};

export const hexToBin = (hexValue) => {
  const clean = normalizeHex(hexValue);
  if (!clean) return '';
  if (!isHex(clean)) return null;
  const bits = clean.length * 4;
  const bin = BigInt(`0x${clean}`).toString(2).padStart(bits, '0');
  return formatBin(bin);
};

export const binToHex = (binValue) => {
  const clean = normalizeBin(binValue);
  if (!clean) return '';
  if (!isBin(clean)) return null;
  const paddedLen = Math.ceil(clean.length / 4) * 4;
  const padded = clean.padStart(paddedLen, '0');
  return BigInt(`0b${padded}`).toString(16).padStart(paddedLen / 4, '0');
};
