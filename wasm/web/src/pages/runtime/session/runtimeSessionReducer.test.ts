import { describe, expect, it } from 'vitest'

import {
  buildChangedRegLens,
  buildRegisterDiffFlags,
} from './runtimeSessionSelectors'
import {
  runtimeSessionInitialState,
  runtimeSessionReducer,
} from './runtimeSessionReducer'

describe('runtimeSessionReducer', () => {
  it('applies patch updates for debug progression', () => {
    const next = runtimeSessionReducer(runtimeSessionInitialState, {
      type: 'runtime-session/patch',
      payload: {
        debugBusy: true,
        debugReady: true,
        elfRunStatus: 'Running to completion...',
      },
    })
    expect(next.debugBusy).toBe(true)
    expect(next.debugReady).toBe(true)
    expect(next.elfRunStatus).toBe('Running to completion...')
  })

  it('resets debug-only fields while preserving mode state', () => {
    const dirty = runtimeSessionReducer(runtimeSessionInitialState, {
      type: 'runtime-session/patch',
      payload: {
        runtimeInputMode: 'upload',
        debugBusy: true,
        debugReady: true,
        debugState: { pc: '0x1' },
        changedXRegs: [true, false],
        changedFRegs: [false, true],
        changedRegLens: [{ reg: 'x1', alias: 'ra', prev: '0x0', next: '0x1' }],
      },
    })
    const reset = runtimeSessionReducer(dirty, {
      type: 'runtime-session/reset-debug',
    })
    expect(reset.runtimeInputMode).toBe('upload')
    expect(reset.debugBusy).toBe(false)
    expect(reset.debugReady).toBe(false)
    expect(reset.debugState).toBeNull()
    expect(reset.changedXRegs).toEqual([])
    expect(reset.changedFRegs).toEqual([])
    expect(reset.changedRegLens).toEqual([])
  })
})

describe('buildRegisterDiffFlags', () => {
  it('returns all false when there is no previous snapshot', () => {
    expect(buildRegisterDiffFlags(null, [1, 2, 3])).toEqual([false, false, false])
  })

  it('marks only changed entries', () => {
    expect(buildRegisterDiffFlags([1, 2, 3], [1, 9, 3])).toEqual([false, true, false])
  })
})

describe('buildChangedRegLens', () => {
  it('returns compact changed register lens entries', () => {
    expect(
      buildChangedRegLens({
        previous: ['0x0', '0x1', '0x2'],
        next: ['0x0', '0x9', '0x2'],
        aliases: ['zero', 'ra', 'sp'],
        limit: 6,
      })
    ).toEqual([{ reg: 'x1', alias: 'ra', prev: '0x1', next: '0x9' }])
  })

  it('returns empty when no previous snapshot exists', () => {
    expect(
      buildChangedRegLens({
        previous: null,
        next: ['0x0', '0x1'],
      })
    ).toEqual([])
  })
})
