'use strict';

(function attachOutputBufferInternal(globalScope) {
  const namespace =
    globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ ||
    (globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ = {});

  namespace.createOutputBuffer = function createOutputBuffer(maxLines) {
    const limit = Number.isFinite(maxLines) ? Number(maxLines) : 40000;
    let outputLines = [];
    let emittedLineCount = 0;

    const pushLine = (line) => {
      outputLines.push(String(line));
      if (outputLines.length > limit) {
        const overflow = outputLines.length - limit;
        outputLines.splice(0, overflow);
        emittedLineCount = Math.max(0, emittedLineCount - overflow);
      }
    };

    const clear = () => {
      outputLines = [];
      emittedLineCount = 0;
    };

    const flush = (postMessage, requestId, force) => {
      if (!force && emittedLineCount >= outputLines.length) {
        return;
      }
      const lines = outputLines.slice(emittedLineCount);
      emittedLineCount = outputLines.length;
      if (lines.length > 0 || force) {
        postMessage({ type: 'lines', requestId, lines });
      }
    };

    const collectSince = (startIndex) => {
      const start = Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : 0;
      if (start >= outputLines.length) {
        return [];
      }
      return outputLines.slice(start).map((line) => String(line));
    };

    const size = () => outputLines.length;

    return {
      pushLine,
      clear,
      flush,
      collectSince,
      size,
    };
  };
})(self);
