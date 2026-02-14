import { withBase } from './paths.js';

const pushOutputLine = (line) => {
  if (!window.__sailOutputLines) {
    window.__sailOutputLines = [];
  }
  window.__sailOutputLines.push(line);
  if (window.__sailOutputLines.length > 20000) {
    window.__sailOutputLines.shift();
  }
  if (window.__sailOutputSink) {
    window.__sailOutputSink(line);
  }
};

const loadSailModule = async ({ cacheBust, jsPath }) => {
  return new Promise((resolve, reject) => {
    if (window.createSailModule && window.__sailModulePath === jsPath) {
      resolve(window.createSailModule);
      return;
    }
    const script = document.createElement('script');
    script.src = `${jsPath}?${cacheBust}`;
    script.onload = () => {
      window.__sailModulePath = jsPath;
      resolve(window.createSailModule);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const MODULE_BUST = `v=${Date.now()}`;
const runtimeModulePromises = new Map();

const runtimeFiles = {
  debug: { js: '/wasm/sail_riscv_debug.js', wasm: '/wasm/sail_riscv_debug.wasm' },
};

export const getRuntimeModule = async () => {
  const moduleKey = 'debug';
  const files = runtimeFiles.debug;
  if (!runtimeModulePromises.has(moduleKey)) {
    const modulePromise = loadSailModule({
      cacheBust: MODULE_BUST,
      jsPath: withBase(files.js),
    }).then((createSailModule) =>
      createSailModule({
        noInitialRun: true,
        noExitRuntime: true,
        print: (text) => {
          const line = String(text);
          console.log(`[stdout] ${line}`);
          pushOutputLine(line);
        },
        printErr: (text) => {
          const line = String(text);
          console.error(`[stderr] ${line}`);
          pushOutputLine(line);
        },
        locateFile: (path) => {
          if (path.endsWith('.wasm')) {
            return `${withBase(files.wasm)}?${MODULE_BUST}`;
          }
          return path;
        },
      })
    );
    runtimeModulePromises.set(moduleKey, modulePromise);
  }
  return runtimeModulePromises.get(moduleKey);
};
