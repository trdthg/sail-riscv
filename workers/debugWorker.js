'use strict';

if (typeof importScripts !== 'function') {
  throw new Error('debugWorker requires importScripts support');
}

importScripts(
  './internal/outputBuffer.js',
  './internal/traceExtract.js',
  './internal/lineMapping.js',
  './internal/binutilsPipeline.js',
  './internal/rpcHandlers.js'
);
