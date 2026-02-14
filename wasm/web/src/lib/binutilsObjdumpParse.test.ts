import { describe, expect, it } from 'vitest';

import { parseSingleInstructionFromObjdump } from './binutilsObjdumpParse';

describe('parseSingleInstructionFromObjdump', () => {
  it('parses a single 32-bit instruction and normalizes little-endian bytes', () => {
    const text = `
tmp.o:     file format elf64-littleriscv

Disassembly of section .text:

0000000000000000 <.text>:
   0:   93 00 11 00     addi    x1,x2,1
`;
    expect(parseSingleInstructionFromObjdump(text)).toEqual({
      asm: 'addi    x1,x2,1',
      hex: '0x00110093',
      bin: '00000000000100010000000010010011',
      width: 32,
    });
  });

  it('parses a single 16-bit compressed instruction', () => {
    const text = `
   0:   82 9b           c.jr    x23
`;
    expect(parseSingleInstructionFromObjdump(text)).toEqual({
      asm: 'c.jr    x23',
      hex: '0x9b82',
      bin: '1001101110000010',
      width: 16,
    });
  });

  it('rejects multiple instructions', () => {
    const text = `
   0:   13 00 00 00     addi    x0,x0,0
   4:   93 00 11 00     addi    x1,x2,1
`;
    expect(() => parseSingleInstructionFromObjdump(text)).toThrow(/exactly one instruction/);
  });
});
