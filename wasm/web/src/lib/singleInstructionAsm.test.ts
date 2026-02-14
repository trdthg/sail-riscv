import { describe, expect, it } from 'vitest';

import { normalizeSingleInstructionAsmInput } from './singleInstructionAsm';

describe('normalizeSingleInstructionAsmInput', () => {
  it('accepts one instruction and strips comments', () => {
    expect(normalizeSingleInstructionAsmInput('addi x1, x2, 1   # comment')).toBe('addi x1, x2, 1');
  });

  it('rejects multi-line input', () => {
    expect(() => normalizeSingleInstructionAsmInput('addi x1, x2, 1\naddi x3, x4, 2')).toThrow(
      /exactly one instruction/
    );
  });

  it('rejects labels and directives', () => {
    expect(() => normalizeSingleInstructionAsmInput('loop: addi x1, x2, 1')).toThrow(/Labels are not supported/);
    expect(() => normalizeSingleInstructionAsmInput('.word 0')).toThrow(/Directives are not supported/);
  });
});
