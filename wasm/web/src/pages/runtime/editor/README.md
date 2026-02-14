# `src/pages/runtime/editor/`

Runtime editor domain state and command bus.

- `runtimeEditorReducer.ts` — editor buffers/options state + reducer.
- `runtimeEditorContext.ts` — context contract for editor state/actions.
- `runtimeEditorSelectors.ts` — pure editor-mode/tab/line selectors.
- `RuntimeEditorProvider.tsx` — editor context provider.
- `useRuntimeEditor.ts` — editor state/actions/derived selectors hooks.
- `runtimeEditorCommandsContext.ts` — context contract for command bus dispatch/registration.
- `RuntimeEditorCommandsProvider.tsx` — typed command dispatch + capability registration provider.
- `useRuntimeEditorCommands.ts` — command bus hook.
