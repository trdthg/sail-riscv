import { describe, expect, it } from 'vitest'

import {
  buildVisibleLinkedGroups,
  formatChangedRegLensText,
} from './runtimeLinkedDebug'

describe('buildVisibleLinkedGroups', () => {
  it('returns all groups with stable color slots', () => {
    const groups = buildVisibleLinkedGroups({
      links: [
        { sourceLine: 7, expandedLines: [20] },
        { sourceLine: 9, expandedLines: [30] },
        { sourceLine: 10, expandedLines: [31, 32] },
        { sourceLine: 11, expandedLines: [40] },
      ],
      sourceLine: 10,
      neighborDistance: 1,
      paletteSize: 6,
    })
    expect(groups).toEqual([
      { sourceLine: 7, expandedLines: [20], colorIndex: 0, isActive: false },
      { sourceLine: 9, expandedLines: [30], colorIndex: 1, isActive: false },
      { sourceLine: 10, expandedLines: [31, 32], colorIndex: 2, isActive: true },
      { sourceLine: 11, expandedLines: [40], colorIndex: 3, isActive: false },
    ])
  })

  it('falls back to expanded origin line when source line is missing', () => {
    const groups = buildVisibleLinkedGroups({
      links: [{ sourceLine: 22, expandedLines: [80, 81] }],
      sourceLine: null,
      fallbackSourceLine: 22,
    })
    expect(groups).toEqual([
      { sourceLine: 22, expandedLines: [80, 81], colorIndex: 0, isActive: true },
    ])
  })
})

describe('formatChangedRegLensText', () => {
  it('formats register changes into inline lens text', () => {
    expect(
      formatChangedRegLensText({
        lenses: [
          { reg: 'x5', alias: 't0', prev: '0x1', next: '0x2' },
          { reg: 'x10', alias: 'a0', prev: '0x0', next: '0x48' },
        ],
        changedCount: 2,
      })
    ).toBe('Δ x5(t0)=0x1→0x2, x10(a0)=0x0→0x48')
  })

  it('adds overflow summary when more registers changed than shown', () => {
    expect(
      formatChangedRegLensText({
        lenses: [{ reg: 'x1', prev: '0x0', next: '0x1' }],
        changedCount: 4,
      })
    ).toBe('Δ x1=0x0→0x1, +3 more')
  })
})
