# `public/workers/`

Web Worker entry points.

- `debugWorker.js` handles:
  - Sail debug runtime lifecycle (`start`, `assembleStart`, `step`, `stepLine`, `run`, `reset`)
  - in-worker gas/ld/readelf/objdump execution
  - streaming structured lines back to the UI

Keep this file browser-worker compatible (no Node APIs).
