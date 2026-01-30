import { atom } from 'jotai';
import { loadable } from 'jotai/utils';

import { withBase } from './paths.js';

const udbIndexAtom = atom(async () => {
  const resp = await fetch(`${withBase('/udb/inst_index.json')}?${Date.now()}`);
  if (!resp.ok) {
    throw new Error(`udb index: ${resp.status} ${resp.statusText}`);
  }
  return await resp.json();
});

export const udbIndexLoadableAtom = loadable(udbIndexAtom);
