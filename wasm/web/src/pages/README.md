# `src/pages/`

Page-level composition components.

- `ExplorerPage.jsx` — instruction encode/decode + metadata explorer.
- `RuntimePage.jsx` — debugger workspace shell; mounts runtime providers and page layout.
- `runtime/` — runtime page domain modules.

Runtime page lifecycle notes:
- App keeps Runtime mounted after first visit (keep-alive), then toggles visibility on page switch.
- Runtime page only binds debug-worker output sink while active.
