import { describe, expect, it } from 'vitest'

import { buildTraceRegisterChanges, normalizeTraceRegWrites } from './traceWrites'

describe('traceWrites', () => {
  it('normalizes register and memory trace writes', () => {
    const writes = normalizeTraceRegWrites([
      { kind: 'reg', name: 'x10', value: '0x11' },
      { kind: 'mem', access: 'w', address: '0x200', value: '0xab' },
      { kind: 'reg', name: '', value: '0x0' },
    ])
    expect(writes).toEqual([
      { kind: 'reg', name: 'x10', value: '0x11' },
      { kind: 'mem', access: 'W', address: '0x200', value: '0xab' },
    ])
  })

  it('projects x/f deltas with lens metadata', () => {
    const changes = buildTraceRegisterChanges({
      traceRegWrites: [
        { kind: 'reg', name: 'x10', value: '0x11' },
        { kind: 'reg', name: 'f2', value: '0x44' },
        { kind: 'mem', access: 'W', address: '0x20c0000', value: '0x48' },
      ],
      previousXregs: Array.from({ length: 32 }, () => '0x0'),
      previousFregs: Array.from({ length: 32 }, () => '0x0'),
      nextXregs: Array.from({ length: 32 }, (_, index) => (index === 10 ? '0x11' : '0x0')),
      nextFregs: Array.from({ length: 32 }, (_, index) => (index === 2 ? '0x44' : '0x0')),
      xregAbi: Array.from({ length: 32 }, (_, index) => (index === 10 ? 'a0' : '')),
    })

    expect(changes.changedXRegs[10]).toBe(true)
    expect(changes.changedFRegs[2]).toBe(true)
    expect(changes.changedRegLens).toEqual([
      { reg: 'x10', alias: 'a0', prev: '0x0', next: '0x11' },
      { reg: 'f2', prev: '0x0', next: '0x44' },
      { reg: 'mem[W,0x20c0000]', prev: '', next: '0x48' },
    ])
  })
})
