import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..', '..');
const udbInstDir = path.resolve(root, 'riscv-unified-db', 'spec', 'std', 'isa', 'inst');
const outDir = path.resolve(root, 'web', 'public', 'udb');
const outFile = path.join(outDir, 'inst_index.json');

const isInstruction = (doc) => doc && doc.kind === 'instruction' && doc.name && doc.encoding;

const readYaml = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(text);
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      files.push(full);
    }
  }
  return files;
};

const normalizeEncoding = (encoding) => {
  if (!encoding) return [];
  if (encoding.match) {
    return [{ xlen: 'ANY', match: encoding.match, variables: encoding.variables || [] }];
  }
  const out = [];
  if (encoding.RV32?.match) {
    out.push({ xlen: 'RV32', match: encoding.RV32.match, variables: encoding.RV32.variables || [] });
  }
  if (encoding.RV64?.match) {
    out.push({ xlen: 'RV64', match: encoding.RV64.match, variables: encoding.RV64.variables || [] });
  }
  return out;
};

const buildIndex = () => {
  const files = walk(udbInstDir);
  const entries = [];
  for (const filePath of files) {
    let doc;
    try {
      doc = readYaml(filePath);
    } catch {
      continue;
    }
    if (!isInstruction(doc)) continue;
    const encodings = normalizeEncoding(doc.encoding);
    if (!encodings.length) continue;
    entries.push({
      name: doc.name,
      longName: doc.long_name || null,
      description: doc.description || null,
      assembly: doc.assembly || '',
      definedBy: doc.definedBy || null,
      access: doc.access || null,
      operation: doc.operation || null,
      pseudoinstructions: doc.pseudoinstructions || null,
      encodingRaw: doc.encoding || null,
      full: doc,
      encodings,
    });
  }
  return entries;
};

fs.mkdirSync(outDir, { recursive: true });
const index = buildIndex();
fs.writeFileSync(outFile, JSON.stringify(index, null, 2));
console.log(`udb index: ${index.length} instructions -> ${outFile}`);
