import { loader } from '@monaco-editor/react';

let prewarmPromise: Promise<void> | null = null;
let isScheduled = false;

const runPrewarm = () => {
  isScheduled = false;
  void prewarmMonacoOnce();
};

export const prewarmMonacoOnce = (): Promise<void> => {
  if (!prewarmPromise) {
    prewarmPromise = loader
      .init()
      .then(() => undefined)
      .catch((error) => {
        console.warn('monaco prewarm failed:', error);
      });
  }
  return prewarmPromise;
};

export const scheduleMonacoPrewarm = (): void => {
  if (isScheduled || prewarmPromise) {
    return;
  }
  isScheduled = true;

  const globalObject = globalThis as {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number }
    ) => number;
    setTimeout: (callback: () => void, timeout?: number) => number;
  };

  if (typeof globalObject.requestIdleCallback === 'function') {
    globalObject.requestIdleCallback(runPrewarm, { timeout: 180 });
    return;
  }

  globalObject.setTimeout(runPrewarm, 80);
};
