const ABI_SUGGESTIONS = [
  'zero', 'ra', 'sp', 'gp', 'tp',
  't0', 't1', 't2', 't3', 't4', 't5', 't6',
  's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  'ft0', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'ft7',
  'fs0', 'fs1', 'fs2', 'fs3', 'fs4', 'fs5', 'fs6', 'fs7', 'fs8', 'fs9', 'fs10', 'fs11',
  'fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'fa7',
  'ft8', 'ft9', 'ft10', 'ft11',
];

const OPERAND_LITERAL_SUGGESTIONS = ['0', '0x0', '1', '-1'];

const defaultForVar = (name) => {
  const key = name.toLowerCase();
  if (key === 'vm') return 'v0.t';
  if (key === 'rm') return 'rne';
  if (key === 'pred' || key === 'succ') return 'rwx';
  if (key === 'aq' || key === 'rl') return '0';
  if (key === 'csr' || key === 'zimm') return '0';
  if (/(^|_)imm\b/.test(key) || key.includes('imm') || key.includes('offset') || key.includes('shamt')) return '0';
  if (/^(xd|rd)$/.test(key)) return 'x1';
  if (/^(xs1|rs1)$/.test(key)) return 'x2';
  if (/^(xs2|rs2)$/.test(key)) return 'x3';
  if (/^(xs3|rs3)$/.test(key)) return 'x4';
  if (/^(rdp|rs1p)$/.test(key)) return 'x8';
  if (/^(rs2p)$/.test(key)) return 'x9';
  if (/^(rs3p)$/.test(key)) return 'x10';
  if (/^(fd)$/.test(key)) return 'f1';
  if (/^(fs1)$/.test(key)) return 'f2';
  if (/^(fs2)$/.test(key)) return 'f3';
  if (/^(fs3)$/.test(key)) return 'f4';
  if (/^(vd)$/.test(key)) return 'v1';
  if (/^(vs1)$/.test(key)) return 'v2';
  if (/^(vs2)$/.test(key)) return 'v3';
  if (/^(vs3)$/.test(key)) return 'v4';
  return '0';
};

export const createAsmNames = (entries) => {
  const set = new Set(entries.map((inst) => inst.name));
  return Array.from(set).sort();
};

export const createAsmTemplates = (entries) => {
  const defaults = new Map();
  for (const inst of entries) {
    if (defaults.has(inst.name)) continue;
    const template = (inst.assembly || '').trim();
    if (!template) {
      defaults.set(inst.name, inst.name);
      continue;
    }
    const varNames = new Set();
    for (const encoding of inst.encodings || []) {
      for (const variable of encoding.variables || []) {
        if (variable?.name) varNames.add(variable.name.toLowerCase());
      }
    }
    const rendered = template.replace(/\b[A-Za-z][A-Za-z0-9_]*\b/g, (word) => {
      const key = word.toLowerCase();
      if (!varNames.has(key)) return word;
      return defaultForVar(key);
    });
    defaults.set(inst.name, `${inst.name} ${rendered}`);
  }
  return defaults;
};

export const createRegisterSuggestions = () => {
  const xRegs = Array.from({ length: 32 }, (_, i) => `x${i}`);
  const fRegs = Array.from({ length: 32 }, (_, i) => `f${i}`);
  const vRegs = Array.from({ length: 32 }, (_, i) => `v${i}`);
  return [...xRegs, ...fRegs, ...vRegs, ...ABI_SUGGESTIONS];
};

export const createAsmSuggestions = ({
  assemblyInput,
  asmNames,
  registerSuggestions,
  asmTemplates,
}) => {
  const rawInput = String(assemblyInput || '');
  const trimmedInput = rawInput.trim();
  const parts = trimmedInput.split(/\s+/);
  const mnemonic = parts[0]?.toLowerCase();
  if (!mnemonic) return [];

  const hasOperands = /\s/.test(rawInput);
  if (!hasOperands) {
    return asmNames
      .filter((name) => name.toLowerCase().startsWith(mnemonic))
      .slice(0, 10)
      .map((name) => ({
        type: 'mnemonic',
        label: asmTemplates.get(name) || name,
        insert: asmTemplates.get(name) || name,
      }));
  }

  const endsOnOperandBoundary = /[\s,(]$/.test(rawInput);
  const lastToken = rawInput.split(/[\s,()]+/).filter(Boolean).pop() || '';
  const lower = endsOnOperandBoundary ? '' : lastToken.toLowerCase();
  const operandSuggestions = [...registerSuggestions, ...OPERAND_LITERAL_SUGGESTIONS];
  if (!lower) {
    const defaultOperands = [
      'x0',
      'x1',
      'x2',
      'x3',
      'a0',
      'a1',
      ...OPERAND_LITERAL_SUGGESTIONS,
      'f0',
      'v0',
    ];
    return defaultOperands.map((name) => ({ type: 'reg', label: name, insert: name }));
  }
  return operandSuggestions
    .filter((name) => name.toLowerCase().startsWith(lower))
    .slice(0, 10)
    .map((name) => ({ type: 'reg', label: name, insert: name }));
};

export const applyAsmSuggestionToInput = (assemblyInput, suggestion) => {
  const trimmed = assemblyInput;
  const hasOperands = trimmed.trim().includes(' ');
  if (!hasOperands || suggestion.type === 'mnemonic') {
    return suggestion.insert;
  }
  const raw = assemblyInput;
  const match = raw.match(/^(.*?)([^\s,()]+)\s*$/);
  const prefix = match ? match[1] : raw;
  const separator = prefix.endsWith(' ') || prefix.endsWith(',') || prefix.endsWith('(') ? '' : ' ';
  return `${prefix}${separator}${suggestion.insert}`;
};
