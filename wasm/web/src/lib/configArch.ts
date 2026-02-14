import { parse } from 'yaml';

export type DerivedGasConfig = {
  gasMarch: string;
  gasAbi: string;
};

const stripJsoncComments = (text: string): string => (
  String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^\\:])\/\/.*$/gm, '$1')
);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const readBooleanField = (
  parent: Record<string, unknown> | null,
  key: string,
  fallback = false
): boolean => {
  if (!parent) {
    return fallback;
  }
  const value = parent[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
};

const hasVectorSupport = (extensions: Record<string, unknown> | null): boolean => {
  const vRecord = asRecord(extensions?.V);
  if (!vRecord) {
    return false;
  }
  if (typeof vRecord.support_level === 'string') {
    return vRecord.support_level.toLowerCase() !== 'disabled';
  }
  return readBooleanField(vRecord, 'supported', false);
};

const hasSimpleExtension = (
  extensions: Record<string, unknown> | null,
  name: 'M' | 'A' | 'F' | 'D' | 'C'
): boolean => {
  const extRecord = asRecord(extensions?.[name]);
  return readBooleanField(extRecord, 'supported', false);
};

export const deriveGasConfigFromConfigText = (configText: string): DerivedGasConfig => {
  const parsed = parse(stripJsoncComments(configText));
  const root = asRecord(parsed);
  if (!root) {
    throw new Error('Config must be an object.');
  }

  const base = asRecord(root.base);
  if (!base) {
    throw new Error('Missing base section in config.');
  }

  const xlen = Number(base.xlen);
  if (xlen !== 32 && xlen !== 64) {
    throw new Error(`Unsupported xlen: ${String(base.xlen)}`);
  }
  const useEmbeddedBase = readBooleanField(base, 'E', false);

  const extensions = asRecord(root.extensions);
  const hasM = hasSimpleExtension(extensions, 'M');
  const hasA = hasSimpleExtension(extensions, 'A');
  const hasF = hasSimpleExtension(extensions, 'F');
  const hasD = hasSimpleExtension(extensions, 'D');
  const hasC = hasSimpleExtension(extensions, 'C');
  const hasV = hasVectorSupport(extensions);

  let march = `rv${xlen}${useEmbeddedBase ? 'e' : 'i'}`;
  if (hasM) march += 'm';
  if (hasA) march += 'a';
  if (hasF) march += 'f';
  if (hasD) march += 'd';
  if (hasC) march += 'c';
  if (hasV) march += 'v';
  march += '_zicsr_zifencei';

  const hasFpDouble = hasD;
  const hasFpSingle = hasF || hasD;
  let abi = xlen === 32 ? 'ilp32' : 'lp64';
  if (hasFpDouble) {
    abi += 'd';
  } else if (hasFpSingle) {
    abi += 'f';
  }

  return {
    gasMarch: march,
    gasAbi: abi,
  };
};
