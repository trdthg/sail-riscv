# `public/`

Static assets served/copied by Vite without bundler transforms.

- `workers/debugWorker.js` — dedicated worker for runtime/debug RPC + binutils orchestration.
- `config/` — runtime JSON configs exposed in UI.
- `udb/inst_index.json` — generated unified-db instruction index.
- `binutils/` — wasm binutils tool wrappers/assets used by the debug worker.
- `wasm/` and top-level `sail_riscv_debug.{js,wasm}` — generated Sail debug WASM artifact.

Do not import JS files from `public/` directly in source modules; load them via URL/worker APIs.
