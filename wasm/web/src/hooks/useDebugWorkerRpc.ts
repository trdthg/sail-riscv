import { useCallback, useEffect, useRef } from 'react';
import { maybeWithBase } from '../lib/paths';

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

  const callDebugWorker = useCallback((method, payload = {}, transfer = []) => {
    const worker = ensureDebugWorker();
    const requestId = `${Date.now()}-${++debugRequestCounterRef.current}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error(`Worker timeout: ${method}`));
      }, 60000);

      const onMessage = (event) => {
        const message = event.data || {};
        if (message.requestId !== requestId) {
          return;
        }

        if (message.type === 'lines') {
          if (typeof debugWorkerLineSinkRef.current === 'function') {
            debugWorkerLineSinkRef.current(message.lines || []);
          }
          return;
        }

        if (message.type === 'result') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          if (message.ok) {
            resolve(message);
          } else {
            reject(new Error(message.error || `Worker ${method} failed`));
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
          ...payload,
        },
        transfer
      );
    });
  }, [ensureDebugWorker]);

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
