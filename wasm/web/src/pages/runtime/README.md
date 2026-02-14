# `src/pages/runtime/`

Runtime page domain modules.

- `editorCommands.ts` — command schema + validation/helpers for editor capability events.
- `editor/` — editor domain state, selectors, provider, and command bus integration.
- `session/` — debug session domain state, selectors, provider, and actions.
- `hooks/` — runtime workflow hooks that orchestrate worker calls and editor behavior.
- `services/` — pure runtime orchestration helpers (worker RPC typing, state projection, trace parsing, status text).

State ownership rules:
- Component-local UI state stays in components (split ratios, drag state, local toggles).
- Shared runtime state lives in `session/` and `editor/` providers.
- Cross-component editor coordination must use typed commands + capabilities (`editorCommands.ts`).
