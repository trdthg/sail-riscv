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
  web: { js: '/wasm/sail_riscv_web.js', wasm: '/wasm/sail_riscv_web.wasm' },
  sim: { js: '/wasm/sail_riscv_sim.js', wasm: '/wasm/sail_riscv_sim.wasm' },
};

export const getRuntimeModule = async (target = 'web') => {
  const files = runtimeFiles[target] || runtimeFiles.web;
  if (!runtimeModulePromises.has(target)) {
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
    runtimeModulePromises.set(target, modulePromise);
  }
  return runtimeModulePromises.get(target);
};
