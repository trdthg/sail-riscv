# `scripts/`

Build-time generators executed by `predev` / `prebuild`.

- `build-udb-index.mjs` — scans `riscv-unified-db` YAML and emits `public/udb/inst_index.json`.
- `sync-binutils-assets.mjs` — copies wasm-binutils artifacts into `public/binutils`.

These scripts must remain deterministic for reproducible CI builds.
