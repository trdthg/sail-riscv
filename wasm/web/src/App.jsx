import { useState } from 'react';

const CONFIGS = [
  { label: 'rv64d_v128_e64 (default)', path: '/rv64d_v128_e64.json' },
];

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

function App() {
  const [output, setOutput] = useState('');
  const [configPath, setConfigPath] = useState(CONFIGS[0].path);
  const [hexInput, setHexInput] = useState('');
  const [decodeMode, setDecodeMode] = useState('auto');

  const append = (line) => setOutput((prev) => (prev ? `${prev}\n${line}` : line));
  const clearOutput = () => setOutput('');

  const runTool = async (args, banner) => {
    const cacheBust = `v=${Date.now()}`;
    const createSailModule = await loadSailModule({
      cacheBust,
      jsPath: '/sail_riscv_web.js',
    });
    console.log('createSailModule type:', typeof createSailModule);
    const Module = await createSailModule({
      noInitialRun: true,
      noExitRuntime: true,
      print: (text) => { console.log(`[stdout] ${text}`); append(text); },
      printErr: (text) => { console.error(`[stderr] ${text}`); append(text); },
      onExit: (code) => console.log('onExit:', code),
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          return `/sail_riscv_web.wasm?${cacheBust}`;
        }
        return path;
      },
    });
    console.log('Module keys:', Object.keys(Module || {}));
    append(banner);

    const configResp = await fetch(configPath);
    if (!configResp.ok) {
      append(`Failed to load config: ${configResp.status} ${configResp.statusText}`);
      return;
    }
    const configText = await configResp.text();
    const fsConfigPath = '/config.json';
    if (!Module.FS || !Module.FS.writeFile) {
      append('Emscripten FS is not available');
      return;
    }
    Module.FS.writeFile(fsConfigPath, configText);

    try {
      if (typeof Module.callMain === 'function') {
        Module.callMain(['--config', fsConfigPath, ...args]);
      } else {
        append('No callMain exported from module');
      }
    } catch (e) {
      if (typeof e === 'number') {
        append(`ExitStatus (number): ${e}`);
        return;
      }
      if (e && typeof e.status === 'number') {
        append(`ExitStatus: ${e.status}`);
        return;
      }
      console.error('Program exited:', e);
      append(`Program exited: ${String(e)}`);
    }
  };

  const runPrintIsa = async () => {
    await runTool(['--print-isa-string'], '--- running: --print-isa-string ---');
  };

  const runDecode = async () => {
    const trimmed = hexInput.trim();
    if (!trimmed) {
      append('Please enter a hex instruction.');
      return;
    }
    const hex = trimmed.toLowerCase().startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[0-9a-f]+$/i.test(hex)) {
      append(`Invalid hex: ${trimmed}`);
      return;
    }

    let mode = decodeMode;
    if (mode === 'auto') {
      mode = hex.length <= 4 ? '16' : '32';
    }
    const flag = mode === '16' ? '--decode16' : '--decode32';
    await runTool([flag, trimmed], `--- running: ${flag} ${trimmed} ---`);
  };

  return (
    <>
      <h1>sail-riscv on web</h1>
      <div className="card" style={{ display: 'grid', gap: '12px' }}>
        <label>
          Config
          <select value={configPath} onChange={(e) => setConfigPath(e.target.value)}>
            {CONFIGS.map((cfg) => (
              <option key={cfg.path} value={cfg.path}>{cfg.label}</option>
            ))}
          </select>
        </label>
        <label>
          Hex instruction
          <input
            type="text"
            placeholder="e.g. 0x00008067"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
          />
        </label>
        <label>
          Decode mode
          <select value={decodeMode} onChange={(e) => setDecodeMode(e.target.value)}>
            <option value="auto">Auto (by length)</option>
            <option value="16">16-bit (compressed)</option>
            <option value="32">32-bit</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={runPrintIsa}>Print ISA</button>
          <button onClick={runDecode}>Decode</button>
          <button onClick={clearOutput}>Clear</button>
        </div>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{output}</pre>
    </>
  )
}

export default App
