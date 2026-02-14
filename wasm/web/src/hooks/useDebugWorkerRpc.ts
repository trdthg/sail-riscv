import { useCallback, useEffect, useRef } from 'react';
import { maybeWithBase } from '../lib/paths';
import type {
  CallDebugWorker,
  DebugWorkerMethod,
  DebugWorkerRequestMap,
  DebugWorkerResponseMap,
} from '../pages/runtime/services/debugWorkerTypes';

type DebugWorkerLineSink = ((lines: string[]) => void) | null;

export const useDebugWorkerRpc = () => {
  const debugWorkerRef = useRef(null);
  const debugWorkerCacheBustRef = useRef('');
  const debugRequestCounterRef = useRef(0);
  const debugWorkerLineSinkRef = useRef<DebugWorkerLineSink>(null);

  const setDebugWorkerLineSink = useCallback((sink: DebugWorkerLineSink) => {
    debugWorkerLineSinkRef.current = sink;
  }, []);

  const ensureDebugWorker = useCallback(() => {
    if (debugWorkerRef.current) {
      return debugWorkerRef.current;
    }
    const cacheBust = `${Date.now()}`;
    debugWorkerCacheBustRef.current = cacheBust;
    const worker = new Worker(`${maybeWithBase('/workers/debugWorker.js')}?v=${cacheBust}`);
    debugWorkerRef.current = worker;
    return worker;
  }, []);

  const callDebugWorker = useCallback<CallDebugWorker>(
    <M extends DebugWorkerMethod>(
      method: M,
      payload: DebugWorkerRequestMap[M] = {} as DebugWorkerRequestMap[M],
      transfer: ArrayBuffer[] = []
    ) => {
      const worker = ensureDebugWorker();
      const requestId = `${Date.now()}-${++debugRequestCounterRef.current}`;

      return new Promise<DebugWorkerResponseMap[M]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          reject(new Error(`Worker timeout: ${method}`));
        }, 60000);

        const onMessage = (event: MessageEvent) => {
          const message = (event.data || {}) as Record<string, unknown>;
          if (message.requestId !== requestId) {
            return;
          }

          if (message.type === 'lines') {
            if (typeof debugWorkerLineSinkRef.current === 'function') {
              const lines = Array.isArray(message.lines)
                ? message.lines.map((line) => String(line))
                : [];
              debugWorkerLineSinkRef.current(lines);
            }
            return;
          }

          if (message.type === 'result') {
            clearTimeout(timeout);
            worker.removeEventListener('message', onMessage);
            if (message.ok) {
              const { type, ok, requestId: _requestId, ...payloadOnly } = message;
              void type;
              void ok;
              void _requestId;
              resolve(payloadOnly as DebugWorkerResponseMap[M]);
            } else {
              reject(new Error(String(message.error || `Worker ${method} failed`)));
            }
          }
        };

        worker.addEventListener('message', onMessage);
        worker.postMessage(
          {
            type: 'rpc',
            method,
            requestId,
            baseUrl: import.meta.env.BASE_URL || '/',
            cacheBust: debugWorkerCacheBustRef.current,
            ...(payload as object),
          },
          transfer
        );
      });
    },
    [ensureDebugWorker]
  );

  useEffect(() => () => {
    if (debugWorkerRef.current) {
      debugWorkerRef.current.terminate();
      debugWorkerRef.current = null;
    }
  }, []);

  return {
    callDebugWorker,
    setDebugWorkerLineSink,
  };
};
