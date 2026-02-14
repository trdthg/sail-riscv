# `src/` overview

Top-level application source for the web UI.

- `App.jsx` — app composition + top-level state wiring between explorer/runtime pages.
- `main.jsx` — React bootstrap.
- `index.css` — global styles and theme tokens.
- `components/` — reusable UI building blocks.
- `pages/` — page-level layouts (`ExplorerPage`, `RuntimePage`).
- `hooks/` — local feature hooks (debug worker RPC, editor state, autocomplete).
- `lib/` — pure utility modules (encoding/parsing/runtime log helpers).
- `state/` — state containers/reducers/atoms.
