export const BASE_PATH = import.meta.env.BASE_URL || '/';

export const withBase = (path) => {
  const base = BASE_PATH.endsWith('/') ? BASE_PATH.slice(0, -1) : BASE_PATH;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleaned}`;
};

export const maybeWithBase = (path) => (path.startsWith('http') ? path : withBase(path));
