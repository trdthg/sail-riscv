import { describe, expect, it } from 'vitest';

import { deriveGasConfigFromConfigText } from './configArch';

describe('deriveGasConfigFromConfigText', () => {
  it('derives rv64 march/mabi with F/D/V enabled', () => {
    const text = `
{
  // jsonc comment
  "base": { "xlen": 64, "E": false },
  "extensions": {
    "M": { "supported": true },
    "A": { "supported": true },
    "F": { "supported": true },
    "D": { "supported": true },
    "C": { "supported": true },
    "V": { "support_level": "Full" }
  }
}
`;
    expect(deriveGasConfigFromConfigText(text)).toEqual({
      gasMarch: 'rv64imafdcv_zicsr_zifencei',
      gasAbi: 'lp64d',
    });
  });

  it('derives rv32 embedded base and fp abi correctly', () => {
    const text = `
{
  "base": { "xlen": 32, "E": true },
  "extensions": {
    "M": { "supported": true },
    "A": { "supported": true },
    "F": { "supported": true },
    "D": { "supported": false },
    "V": { "support_level": "Disabled" }
  }
}
`;
    expect(deriveGasConfigFromConfigText(text)).toEqual({
      gasMarch: 'rv32emaf_zicsr_zifencei',
      gasAbi: 'ilp32f',
    });
  });

  it('throws on unsupported xlen', () => {
    const text = `
{
  "base": { "xlen": 128, "E": false },
  "extensions": {}
}
`;
    expect(() => deriveGasConfigFromConfigText(text)).toThrow(/Unsupported xlen/);
  });
});
