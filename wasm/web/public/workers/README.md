# `public/workers/`

Web Worker entry points.

- `debugWorker.js` is the thin worker bootstrap (loads `internal/*.js`).
- `internal/rpcHandlers.js` owns the worker RPC lifecycle (`start`, `assembleStart`, `step`, `stepLine`, `run`, `reset`, `state`).
- `internal/outputBuffer.js`, `internal/traceExtract.js`, `internal/lineMapping.js`, `internal/binutilsPipeline.js` provide reusable worker internals.

Keep this file browser-worker compatible (no Node APIs).
