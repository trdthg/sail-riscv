import { describe, expect, it } from 'vitest'

import {
  appendRuntimeOutputLines,
  createRuntimeOutputInitialState,
  setRuntimeOutputText,
} from '../../hooks/runtimeOutputReducer'

describe('runtimeOutputReducer', () => {
  it('increments trace/runtime/build buckets', () => {
    const initial = createRuntimeOutputInitialState()
    const next = appendRuntimeOutputLines(initial, [
      'HTIF located at 0x20c0000',
      '[0] [M]: 0x0000000080002000 (0x820BE297) auipc t0, -0x7df42',
      '[gas] warning: sample',
    ])

    expect(next.runtimeLines).toContain('HTIF located at 0x20c0000')
    expect(next.traceLines).toContain('[0] [M]: 0x0000000080002000 (0x820BE297) auipc t0, -0x7df42')
    expect(next.buildLines).toContain('[gas] warning: sample')
  })

  it('rebuilds state from full output text', () => {
    const state = setRuntimeOutputText([
      'htif-term compat byte: 0x48',
      'htif-term compat byte: 0x69',
    ].join('\n'))
    expect(state.programText).toContain('Hi')
    expect(state.rawOutput.includes('compat byte')).toBe(true)
  })
})
