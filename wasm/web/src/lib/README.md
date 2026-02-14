# `src/lib/`

Pure logic modules (no React rendering).

- `bits.js` — bitfield matching/layout helpers.
- `encoder.js` / `parse.js` — unified-db based assembly encoding pipeline.
- `instructionInput.ts` — hex/bin normalization + conversion helpers.
- `asmAutocomplete.ts` — autocomplete template/suggestion generation.
- `configArch.ts` — derive `-march/-mabi` from runtime config text (JSONC).
- `singleInstructionAsm.ts` — strict single-instruction validation/normalization for Explorer assembly mode.
- `binutilsObjdumpParse.ts` — parse one instruction from `objdump` output into `{hex, bin, width}`.
- `monacoPrewarm.ts` — idle-time Monaco loader prewarm (strict-mode safe, once-only).
- `sailRuntime.js` — Sail debug WASM module loader.
- `toolOutput.ts` — parser for tool output streams.
- `paths.ts` / `udbIndex.js` — base-path helpers and unified-db load atom.

Tests are colocated as `*.test.ts` for utility coverage.
