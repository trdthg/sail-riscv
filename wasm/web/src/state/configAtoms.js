import { atom } from 'jotai';
import { loadable } from 'jotai/utils';

import { withBase, maybeWithBase } from '../lib/paths.js';

const configsAtom = atom(async () => {
  const resp = await fetch(`${withBase('/config/configs.json')}?${Date.now()}`);
  if (!resp.ok) {
    throw new Error(`config list: ${resp.status} ${resp.statusText}`);
  }
  const list = await resp.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('config list is empty');
  }
  return list;
});

export const configsLoadableAtom = loadable(configsAtom);

const configContentAtom = atom(async (get) => {
  const configsState = get(configsLoadableAtom);
  const currentPath = get(configPathAtom);
  if (!currentPath || configsState.state !== 'hasData') return '';
  const resp = await fetch(`${maybeWithBase(currentPath)}?${Date.now()}`);
  if (!resp.ok) {
    throw new Error(`config: ${resp.status} ${resp.statusText}`);
  }
  return await resp.text();
});

export const configContentLoadableAtom = loadable(configContentAtom);

const selectedConfigAtom = atom(null);

export const configPathAtom = atom(
  (get) => {
    const configsState = get(configsLoadableAtom);
    if (configsState.state !== 'hasData' || !Array.isArray(configsState.data)) {
      return '';
    }
    const configs = configsState.data;
    if (configs.length === 0) return '';
    const selected = get(selectedConfigAtom);
    if (selected) return selected;
    const defaultItem = configs.find((cfg) => cfg.default);
    return (defaultItem || configs[0]).path;
  },
  (_get, set, next) => {
    set(selectedConfigAtom, next);
  },
);

const configEditorMapAtom = atom({});

export const configEditorAtom = atom(
  (get) => {
    const path = get(configPathAtom);
    const map = get(configEditorMapAtom);
    if (path && map[path] !== undefined) return map[path];
    const contentState = get(configContentLoadableAtom);
    if (contentState.state === 'hasData') return contentState.data;
    return '';
  },
  (get, set, next) => {
    const path = get(configPathAtom);
    if (!path) return;
    set(configEditorMapAtom, (prev) => ({ ...prev, [path]: next }));
  },
);
