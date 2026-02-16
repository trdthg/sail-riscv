import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.resolve(wasmRoot, 'web', 'public', 'binutils');

const sources = [
  {
    fromCandidates: [
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'gas', 'build', 'dist', 'cjs', 'riscv64-linux-gnu.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'gas', 'build', 'dist', 'riscv64-linux-gnu.js'),
    ],
    to: path.join(publicDir, 'riscv64-linux-gnu.js'),
  },
  {
    fromCandidates: [
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'ld.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'ld-new.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'ld.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'ld-new.js'),
    ],
    to: path.join(publicDir, 'ld.js'),
  },
  {
    fromCandidates: [
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'readelf.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'readelf.js'),
    ],
    to: path.join(publicDir, 'readelf.js'),
  },
  {
    fromCandidates: [
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'cjs', 'objdump.js'),
      path.resolve(wasmRoot, 'binutils-wasm', 'packages', 'binutils', 'build', 'dist', 'objdump.js'),
    ],
    to: path.join(publicDir, 'objdump.js'),
  },
];

fs.mkdirSync(publicDir, { recursive: true });
const requireAssets = process.env.REQUIRE_BINUTILS_ASSETS === '1';

const missing = [];
for (const item of sources) {
  const from = item.fromCandidates.find((candidate) => fs.existsSync(candidate));
  if (!from) {
    missing.push(item.fromCandidates.join(' | '));
    continue;
  }
  fs.copyFileSync(from, item.to);
}

if (missing.length > 0) {
  console.warn('[binutils] assets not found, Build + Init (asm) will be unavailable until built.');
  for (const item of missing) {
    console.warn(`[binutils] missing: ${item}`);
  }
  console.warn('[binutils] build commands:');
  console.warn('  pnpm -C wasm/binutils-wasm/packages/gas run build:wasm');
  console.warn('  pnpm -C wasm/binutils-wasm/packages/binutils run build:wasm');
  if (requireAssets) {
    process.exitCode = 1;
    throw new Error('[binutils] missing required assets for this build');
  }
} else {
  console.log(`[binutils] synced assets -> ${publicDir}`);
}
