import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn(() => Promise.resolve({}));

vi.mock('@monaco-editor/react', () => ({
  loader: {
    init: initMock,
  },
}));

describe('monacoPrewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).requestIdleCallback;
  });

  it('initializes monaco only once', async () => {
    const module = await import('./monacoPrewarm');
    await module.prewarmMonacoOnce();
    await module.prewarmMonacoOnce();
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('schedules prewarm via requestIdleCallback when available', async () => {
    const requestIdleCallbackMock = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    (globalThis as Record<string, unknown>).requestIdleCallback =
      requestIdleCallbackMock;

    const module = await import('./monacoPrewarm');
    module.scheduleMonacoPrewarm();
    await Promise.resolve();

    expect(requestIdleCallbackMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    const module = await import('./monacoPrewarm');
    module.scheduleMonacoPrewarm();

    expect(initMock).toHaveBeenCalledTimes(0);
    await vi.runAllTimersAsync();
    expect(initMock).toHaveBeenCalledTimes(1);
  });
});
