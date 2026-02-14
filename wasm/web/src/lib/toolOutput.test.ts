import { test, expect } from 'vitest';

import { parseToolLines } from './toolOutput';

test('parseToolLines prefers JSON payload when present', () => {
  const parsed = parseToolLines([
    '{"type":"decode","asm":"addi x1, x2, 1","hex":"0x00110093","bin":"00000000000100010000000010010011","width":32}',
  ]);
  expect(parsed.type).toBe('decode');
  expect(parsed.asm).toBe('addi x1, x2, 1');
  expect(parsed.hex).toBe('0x00110093');
});

test('parseToolLines captures textual errors', () => {
  const parsed = parseToolLines(['Assembly did not match: addi x1, x2, 0']);
  expect(parsed.error).toMatch(/Assembly did not match/i);
});
