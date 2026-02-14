import { test, expect } from 'vitest';

import {
  applyAsmSuggestionToInput,
  createAsmNames,
  createAsmSuggestions,
  createAsmTemplates,
  createRegisterSuggestions,
} from './asmAutocomplete';

const UDB_SAMPLE = [
  {
    name: 'addi',
    assembly: 'rd, rs1, imm',
    encodings: [
      {
        variables: [{ name: 'rd' }, { name: 'rs1' }, { name: 'imm' }],
      },
    ],
  },
  {
    name: 'add',
    assembly: 'rd, rs1, rs2',
    encodings: [
      {
        variables: [{ name: 'rd' }, { name: 'rs1' }, { name: 'rs2' }],
      },
    ],
  },
];

test('createAsmNames returns sorted unique instruction names', () => {
  const names = createAsmNames([...UDB_SAMPLE, UDB_SAMPLE[0]]);
  expect(names).toEqual(['add', 'addi']);
});

test('createAsmTemplates injects sensible default operands', () => {
  const templates = createAsmTemplates(UDB_SAMPLE);
  expect(templates.get('addi')).toBe('addi x1, x2, 0');
});

test('mnemonic suggestions expand to template form', () => {
  const suggestions = createAsmSuggestions({
    assemblyInput: 'addi',
    asmNames: createAsmNames(UDB_SAMPLE),
    registerSuggestions: createRegisterSuggestions(),
    asmTemplates: createAsmTemplates(UDB_SAMPLE),
  });
  expect(suggestions[0].insert).toBe('addi x1, x2, 0');
});

test('register suggestions use active token prefix', () => {
  const suggestions = createAsmSuggestions({
    assemblyInput: 'addi x1, x',
    asmNames: createAsmNames(UDB_SAMPLE),
    registerSuggestions: createRegisterSuggestions(),
    asmTemplates: createAsmTemplates(UDB_SAMPLE),
  });
  expect(suggestions[0].insert).toBe('x0');
});

test('operand suggestions stay available after trailing whitespace', () => {
  const suggestions = createAsmSuggestions({
    assemblyInput: 'addi ',
    asmNames: createAsmNames(UDB_SAMPLE),
    registerSuggestions: createRegisterSuggestions(),
    asmTemplates: createAsmTemplates(UDB_SAMPLE),
  });
  expect(suggestions.length).toBeGreaterThan(0);
  expect(suggestions[0].insert).toBe('x0');
});

test('operand suggestions include immediate literals', () => {
  const suggestions = createAsmSuggestions({
    assemblyInput: 'addi x1, x2, ',
    asmNames: createAsmNames(UDB_SAMPLE),
    registerSuggestions: createRegisterSuggestions(),
    asmTemplates: createAsmTemplates(UDB_SAMPLE),
  });
  expect(suggestions.some((item) => item.insert === '0')).toBe(true);
  expect(suggestions.some((item) => item.insert === '0x0')).toBe(true);
});

test('applyAsmSuggestionToInput replaces only trailing token', () => {
  const next = applyAsmSuggestionToInput('addi x1, x', {
    type: 'reg',
    insert: 'x2',
  });
  expect(next).toBe('addi x1, x2');
});
