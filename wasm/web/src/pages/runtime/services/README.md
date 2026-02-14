# `src/pages/runtime/services/`

Pure runtime-domain helpers used by hooks and providers.

- `debugWorkerTypes.ts` — typed worker RPC method/request/response map.
- `traceWrites.ts` — trace write normalization + register/memory change projection.
- `debugStateProjector.ts` — debug-state + previous-register snapshot projection to UI patch.
- `sessionTransitions.ts` — reusable runtime session patch builders.
- `statusText.ts` — status/error text helpers and state-derived exit/halt helpers.
- `debugOperations.ts` — async runtime operations (`init/build/step/run/reset`) with injected side effects.

Tests:
- `traceWrites.test.ts`
- `debugStateProjector.test.ts`
- `sessionTransitions.test.ts`
