import { describe, expect, it } from 'vitest'

import {
  normalizeExpandedSourceLinks,
  projectDebugState,
} from './debugStateProjector'

describe('debugStateProjector', () => {
  it('normalizes expanded-source links', () => {
    const links = normalizeExpandedSourceLinks([
      { sourceLine: 10, expandedLines: [5, '7', 5] },
      { sourceLine: 'invalid', expandedLines: [1] },
    ])
    expect(links).toEqual([{ sourceLine: 10, expandedLines: [5, 7] }])
  })

  it('resets diff when requested', () => {
    const result = projectDebugState({
      state: {
        xregs: ['0x0', '0x1'],
        fregs: ['0x0'],
      },
      previousSnapshot: { xregs: null, fregs: null },
      resetDiff: true,
    })
    expect(result.changedXRegs).toEqual([false, false])
    expect(result.changedFRegs).toEqual([false])
    expect(result.changedRegLens).toEqual([])
    expect(result.nextSnapshot.xregs).toEqual(['0x0', '0x1'])
  })

  it('uses trace writes to compute changed lenses', () => {
    const result = projectDebugState({
      state: {
        xregs: ['0x0', '0x1'],
        fregs: ['0x0'],
        xregAbi: ['', 'ra'],
      },
      previousSnapshot: {
        xregs: ['0x0', '0x0'],
        fregs: ['0x0'],
      },
      traceRegWrites: [{ kind: 'reg', name: 'x1', value: '0x1' }],
    })
    expect(result.changedXRegs).toEqual([false, true])
    expect(result.changedRegLens).toEqual([
      { reg: 'x1', alias: 'ra', prev: '0x0', next: '0x1' },
    ])
  })
})
