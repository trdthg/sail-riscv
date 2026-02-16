import { atom } from 'jotai';
import { loadable } from 'jotai/utils';

import { configEditorAtom, configPathAtom, configsLoadableAtom } from './configAtoms.js';
import { maybeWithBase } from '../lib/paths';
import { getRuntimeModule } from '../lib/sailRuntime.js';

const isaRefreshAtom = atom(0);

const isaAtom = atom(async (get) => {
  get(isaRefreshAtom);
  const configsState = get(configsLoadableAtom);
  const currentPath = get(configPathAtom);
  if (!currentPath || configsState.state !== 'hasData') return '';
  const editorConfigText = get(configEditorAtom);
  let configText = typeof editorConfigText === 'string' ? editorConfigText : '';

  if (!configText.trim()) {
    if (currentPath === '/config.json') {
      return '';
    }
    const configResp = await fetch(`${maybeWithBase(currentPath)}?${Date.now()}`);
    if (!configResp.ok) {
      throw new Error(`config: ${configResp.status} ${configResp.statusText}`);
    }
    configText = await configResp.text();
  }

  const Module = await getRuntimeModule();
  if (!Module.FS || !Module.FS.writeFile) {
    return '';
  }
  Module.FS.writeFile('/config.json', configText);
  if (!window.__sailOutputLines) {
    window.__sailOutputLines = [];
  }
  const lines = window.__sailOutputLines;
  lines.length = 0;
  const prevSink = window.__sailOutputSink;
  window.__sailOutputSink = null;
  try {
    if (typeof Module.callMain === 'function') {
      Module.callMain(['web', '--config', '/config.json', '--print-isa-string']);
    }
  } finally {
    window.__sailOutputSink = prevSink || null;
  }
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  return cleaned.length ? cleaned[cleaned.length - 1] : '';
});

export const isaLoadableAtom = loadable(isaAtom);
export { isaRefreshAtom };
