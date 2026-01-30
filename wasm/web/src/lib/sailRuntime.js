import { withBase } from './paths.js';

const pushOutputLine = (line) => {
  if (!window.__sailOutputLines) {
    window.__sailOutputLines = [];
  }
  window.__sailOutputLines.push(line);
  if (window.__sailOutputLines.length > 2000) {
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
let runtimeModulePromise = null;

export const getRuntimeModule = async () => {
  if (!runtimeModulePromise) {
    runtimeModulePromise = loadSailModule({
      cacheBust: MODULE_BUST,
      jsPath: withBase('/wasm/sail_riscv_web.js'),
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
            return `${withBase('/wasm/sail_riscv_web.wasm')}?${MODULE_BUST}`;
          }
          return path;
        },
      })
    );
  }
  return runtimeModulePromise;
};
