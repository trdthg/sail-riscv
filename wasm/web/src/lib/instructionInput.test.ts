import { test, expect } from 'vitest';

import {
  MAX_HEX,
  binToHex,
  clampHex,
  formatBinWithCursor,
  hexToBin,
  normalizeBin,
  normalizeHex,
} from './instructionInput';

test('normalize helpers strip prefixes and separators', () => {
  expect(normalizeHex('  0xAb cd  ')).toBe('abcd');
  expect(normalizeBin('1010 0011_11')).toBe('1010001111');
});

test('clampHex enforces instruction width', () => {
  expect(clampHex('0x123456789')).toBe('12345678');
  expect(MAX_HEX).toBe(8);
});

test('hex/bin conversion roundtrip preserves value', () => {
  const bin = hexToBin('0x13');
  expect(bin).toBe('0001 0011');
  expect(binToHex(bin)).toBe('13');
});

test('formatBinWithCursor keeps logical cursor position', () => {
  const result = formatBinWithCursor('10100011', 8);
  expect(result.display).toBe('1010 0011');
  expect(result.cursor).toBe(9);
});
