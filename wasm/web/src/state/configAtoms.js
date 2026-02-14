import { atom } from 'jotai';
import { loadable } from 'jotai/utils';

import { withBase, maybeWithBase } from '../lib/paths';

const PREFERRED_DEFAULT_CONFIG_PATH = '/config/rv64d_v128_e64.json';

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
  if (currentPath === '/config.json') {
    const editorMap = get(configEditorMapAtom);
    const edited = editorMap[currentPath];
    if (typeof edited === 'string') {
      return edited;
    }
    const selected = get(selectedConfigAtom);
    const configs = Array.isArray(configsState.data) ? configsState.data : [];
    const preferredTemplate = configs.find((cfg) => cfg.path === PREFERRED_DEFAULT_CONFIG_PATH);
    const selectedTemplate = configs.find((cfg) => cfg.path === selected && cfg.path !== '/config.json');
    const defaultTemplate = configs.find((cfg) => cfg.default && cfg.path !== '/config.json');
    const firstTemplate = configs.find((cfg) => cfg.path !== '/config.json');
    const fallbackPath =
      preferredTemplate?.path ||
      selectedTemplate?.path ||
      defaultTemplate?.path ||
      firstTemplate?.path ||
      '';
    if (!fallbackPath) {
      return '';
    }
    const fallbackResp = await fetch(`${maybeWithBase(fallbackPath)}?${Date.now()}`);
    if (!fallbackResp.ok) {
      throw new Error(`config: ${fallbackResp.status} ${fallbackResp.statusText}`);
    }
    return await fallbackResp.text();
  }
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

export const configEditorByPathAtom = atom(
  null,
  (_get, set, next) => {
    const path = typeof next?.path === 'string' ? next.path : '';
    if (!path) return;
    set(configEditorMapAtom, (prev) => ({ ...prev, [path]: String(next?.text ?? '') }));
  },
);

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
