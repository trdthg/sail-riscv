# sail-riscv web

Browser UI for the `sail-riscv` WebAssembly runtime:

- Instruction explorer (encode/decode + unified-db metadata)
- Assembly runtime/debugger (edit/upload ELF, build, step, run, logs, registers)

## Commands

- `pnpm -C wasm/web dev` — start local dev server
- `pnpm -C wasm/web lint` — run ESLint
- `pnpm -C wasm/web test` — run unit tests (`vitest`, node environment)
- `pnpm -C wasm/web test:ui` — run UI regression test(s) (`vitest`)
- `pnpm -C wasm/web check` — lint + unit + UI tests
- `pnpm -C wasm/web build` — production build

## Quality gates

- Lint is executed in GitHub Actions (`.github/workflows/gh-pages.yml`).
- Unit and UI tests are executed before deploy.
- New feature work should include tests close to the changed module (`src/**/*.test.ts`/`tsx` or UI tests).

## Source layout

- `src/` — application source (see folder-level READMEs)
- `public/` — static assets copied as-is by Vite
- `scripts/` — build-time asset generators/sync scripts

## TSX migration evaluation (current status)

- Current codebase is JS/JSX with lint + tests.
- TypeScript baseline is enabled (`tsconfig.json`, `pnpm -C wasm/web typecheck`).
- Initial migration completed for runtime hooks (`src/hooks/*.ts`), key utility libs (`src/lib/*.ts`), and header component (`src/components/AppHeader.tsx`).
- Unit tests run on Vitest node environment to support mixed JS/TS modules.
- Migration to TS/TSX is feasible but should be incremental:
  1. Keep `allowJs` while JS/JSX files remain (current setup).
  2. Continue converting page/components from leaf to container.
  3. Turn on stricter TS options (`checkJs` / `noImplicitAny`) after conversion reaches critical mass.
- This keeps velocity while improving static guarantees without a high-risk full rewrite.
