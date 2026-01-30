import { parseLocation } from './parse.js';

export const normalizeFieldName = (name) => {
  if (!name) return 'field';
  const lower = name.toLowerCase();
  if (/^(rd|xd)$/.test(lower)) return 'rd';
  if (/^(rs1|xs1)$/.test(lower)) return 'rs1';
  if (/^(rs2|xs2)$/.test(lower)) return 'rs2';
  if (/^(rs3|xs3)$/.test(lower)) return 'rs3';
  if (/^(fd)$/.test(lower)) return 'fd';
  if (/^(fs1)$/.test(lower)) return 'fs1';
  if (/^(fs2)$/.test(lower)) return 'fs2';
  if (/^(fs3)$/.test(lower)) return 'fs3';
  if (/^(vd)$/.test(lower)) return 'vd';
  if (/^(vs1)$/.test(lower)) return 'vs1';
  if (/^(vs2)$/.test(lower)) return 'vs2';
  if (/^(vs3)$/.test(lower)) return 'vs3';
  if (/^imm/.test(lower)) return 'imm';
  if (lower === 'csr') return 'csr';
  if (lower === 'shamt') return 'shamt';
  if (lower === 'rm') return 'rm';
  if (lower === 'pred') return 'pred';
  if (lower === 'succ') return 'succ';
  if (lower === 'aq') return 'aq';
  if (lower === 'rl') return 'rl';
  if (lower === 'vm') return 'vm';
  return lower;
};

export const matchEncoding = (match, bin) => {
  if (!match || match.length !== bin.length) return false;
  for (let i = 0; i < match.length; i += 1) {
    const m = match[i];
    if (m === '-') continue;
    if (m !== bin[i]) return false;
  }
  return true;
};

export const buildFieldMap = (encoding, width) => {
  const map = Array(width).fill(null);
  (encoding.variables || []).forEach((variable) => {
    const name = normalizeFieldName(variable.name);
    const locs = parseLocation(variable.location);
    locs.forEach(([hi, lo]) => {
      for (let bit = hi; bit >= lo; bit -= 1) {
        map[width - 1 - bit] = name;
      }
    });
  });
  return map;
};

export const buildSegments = (bin, fieldMap) => {
  const segments = [];
  let current = null;
  for (let i = 0; i < bin.length; i += 1) {
    const label = fieldMap[i] || 'fixed';
    if (!current || current.label !== label) {
      current = { label, bits: '', start: i };
      segments.push(current);
    }
    current.bits += bin[i];
  }
  return segments;
};

export const labelColors = {
  rd: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rs1: 'bg-sky-100 text-sky-800 border-sky-200',
  rs2: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  rs3: 'bg-purple-100 text-purple-800 border-purple-200',
  fd: 'bg-teal-100 text-teal-800 border-teal-200',
  fs1: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  fs2: 'bg-blue-100 text-blue-800 border-blue-200',
  fs3: 'bg-violet-100 text-violet-800 border-violet-200',
  vd: 'bg-lime-100 text-lime-800 border-lime-200',
  vs1: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  vs2: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  vs3: 'bg-violet-100 text-violet-800 border-violet-200',
  imm: 'bg-amber-100 text-amber-800 border-amber-200',
  opcode: 'bg-slate-200 text-slate-700 border-slate-300',
  funct3: 'bg-orange-100 text-orange-800 border-orange-200',
  funct7: 'bg-rose-100 text-rose-800 border-rose-200',
  csr: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  shamt: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  rm: 'bg-pink-100 text-pink-800 border-pink-200',
  pred: 'bg-stone-100 text-stone-800 border-stone-200',
  succ: 'bg-stone-100 text-stone-800 border-stone-200',
  aq: 'bg-slate-100 text-slate-700 border-slate-200',
  rl: 'bg-slate-100 text-slate-700 border-slate-200',
  vm: 'bg-slate-200 text-slate-800 border-slate-300',
  fixed: 'bg-slate-50 text-slate-500 border-slate-200',
};
