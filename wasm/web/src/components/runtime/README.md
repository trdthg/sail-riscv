# `src/components/runtime/`

Runtime debugger UI pieces.

- `RuntimeToolbar.jsx` — mode/config/build/step controls (consumes runtime providers).
- `RuntimeEditorPane.jsx` — Monaco editor area + split/log panel; registers editor capabilities.
- `RuntimeSidebar.jsx` — register/state panels (selector-driven).
- `RuntimeKeepAliveSlot.tsx` — keeps Runtime page mounted after first activation and toggles visibility by active page.
- `RuntimeToolbar.ui.test.tsx` — UI regression test for toolbar mode behavior.
- `RuntimeEditorPane.ui.test.tsx` — command/capability integration regression tests.
- `RuntimeKeepAliveSlot.ui.test.tsx` — verifies Runtime subtree mounts once and survives page toggles.
