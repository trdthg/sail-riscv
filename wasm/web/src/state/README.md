# `src/state/`

Application state modules.

- `runtimeWorkspaceState.js` — reducer + defaults for runtime workspace mode/files/debug UI.
- `configAtoms.js` — config file load + editor atoms.
- `isaAtoms.js` — ISA string load/refresh atoms.

Reducer behavior is tested in `runtimeWorkspaceState.test.ts`.
