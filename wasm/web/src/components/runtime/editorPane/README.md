# `src/components/runtime/editorPane/`

Runtime editor-pane composition modules.

- `EditorPaneHeader.tsx` — top editor header with source/disassembly mapping hint.
- `SplitEditors.tsx` — editor/log split layout and dual-pane editor renderer.
- `LogsPane.tsx` — runtime log tabs + clear action.
- `useResizableGrid.ts` — shared drag-resize behavior for horizontal/vertical split bars.
- `useLinkedDecorations.ts` — Monaco linked-group decorations + active-line reveal.
- `useLensHistory.ts` — persistent inline register-lens history on disassembly lines.
