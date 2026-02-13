import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.resolve(wasmRoot, 'web', 'public', 'binutils');

const sources = [
  {
    from: path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'gas', 'build', 'dist', 'cjs', 'riscv64-linux-gnu.js'),
    to: path.join(publicDir, 'riscv64-linux-gnu.js'),
  },
  {
    from: path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'ld.js'),
    to: path.join(publicDir, 'ld.js'),
  },
  {
    from: path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'readelf.js'),
    to: path.join(publicDir, 'readelf.js'),
  },
];

fs.mkdirSync(publicDir, { recursive: true });

const missing = [];
for (const item of sources) {
  if (!fs.existsSync(item.from)) {
    missing.push(item.from);
    continue;
  }
  fs.copyFileSync(item.from, item.to);
}

if (missing.length > 0) {
  console.warn('[binutils] assets not found, Build + Init (asm) will be unavailable until built.');
  for (const item of missing) {
    console.warn(`[binutils] missing: ${item}`);
  }
  console.warn('[binutils] build commands:');
  console.warn('  pnpm -C wasm/binutils-wasm/packages/gas run build:wasm');
  console.warn('  pnpm -C wasm/binutils-wasm/packages/binutils run build:wasm');
} else {
  console.log(`[binutils] synced assets -> ${publicDir}`);
}
