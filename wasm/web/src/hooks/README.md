# `src/hooks/`

Feature hooks that keep `App.jsx` and page components smaller.

- `useAsmAutocomplete.ts` — assembly suggestion list, dropdown state, apply behavior.
- `useDebugWorkerRpc.ts` — RPC transport/lifecycle for `public/workers/debugWorker.js`.
- `useExplorerState.ts` — explorer page state, encode/decode orchestration, and bit/instruction matching.
- `useRuntimeOutput.ts` — output sink, parsed runtime buckets, and log-tab text derivation.

Runtime-page-only hooks live in `src/pages/runtime/hooks/`.
