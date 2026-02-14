'use strict';

(function attachBinutilsPipelineInternal(globalScope) {
  const namespace =
    globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ ||
    (globalScope.__SAIL_DEBUG_WORKER_INTERNALS__ = {});

  const normalizeBaseUrl = (baseUrl) => {
    if (!baseUrl || typeof baseUrl !== 'string') {
      return '/';
    }
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  };

  const withCacheBust = (url, cacheBust) => {
    if (!cacheBust) {
      return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}v=${cacheBust}`;
  };

  const loadToolFactory = ({ baseUrl, cacheBust, relativePath, label }) => {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    const scriptUrl = withCacheBust(`${normalizedBase}${relativePath}`, cacheBust);
    try {
      importScripts(scriptUrl);
    } catch (error) {
      throw new Error(`Failed to load ${label} runtime from ${scriptUrl}: ${error}`);
    }
    const factory = globalScope.createBinutilsExecutable;
    if (typeof factory !== 'function') {
      throw new Error(`Failed to initialize ${label} runtime factory`);
    }
    delete globalScope.createBinutilsExecutable;
    return factory;
  };

  const runBinutilsModule = async ({
    requestId,
    factory,
    label,
    args,
    preRun,
    silent = false,
    onLine,
    onFlush,
  }) => {
    const stdoutLines = [];
    const stderrLines = [];
    const moduleInstance = await factory({
      noInitialRun: true,
      print: (line) => {
        const text = String(line);
        stdoutLines.push(text);
        if (!silent) {
          onLine?.(`[${label}] ${text}`);
          onFlush?.(requestId, false);
        }
      },
      printErr: (line) => {
        const text = String(line);
        stderrLines.push(text);
        if (!silent) {
          onLine?.(`[${label}] ${text}`);
          onFlush?.(requestId, false);
        }
      },
    });
    if (typeof preRun === 'function') {
      preRun(moduleInstance);
    }
    if (typeof moduleInstance.callMain !== 'function') {
      throw new Error(`${label} runtime has no callMain`);
    }
    moduleInstance.callMain(args.map((arg) => String(arg)));
    return { module: moduleInstance, stdoutLines, stderrLines };
  };

  namespace.normalizeBaseUrl = normalizeBaseUrl;
  namespace.withCacheBust = withCacheBust;
  namespace.loadToolFactory = loadToolFactory;
  namespace.runBinutilsModule = runBinutilsModule;
})(self);
