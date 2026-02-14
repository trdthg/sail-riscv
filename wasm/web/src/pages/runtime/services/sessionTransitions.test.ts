import { describe, expect, it } from 'vitest'

import {
  createAssembleInitPatch,
  createClearDebugDiffPatch,
  createSwitchToEditPatch,
  createUploadInitPatch,
} from './sessionTransitions'

describe('sessionTransitions', () => {
  it('creates a clean diff patch', () => {
    expect(createClearDebugDiffPatch()).toEqual({
      changedXRegs: [],
      changedFRegs: [],
      changedRegLens: [],
    })
  })

  it('creates edit-mode transition patch', () => {
    expect(createSwitchToEditPatch()).toMatchObject({
      runtimeInputMode: 'edit',
      debugReady: false,
      debugState: null,
      elfRunStatus: 'Edit mode',
    })
  })

  it('creates upload and assemble init patches', () => {
    const fakeFile = new File(['abc'], 'demo.elf')
    expect(createUploadInitPatch(fakeFile)).toMatchObject({
      runtimeInputMode: 'upload',
      uploadElfFile: fakeFile,
      debugBusy: true,
      debugReady: false,
    })
    expect(createAssembleInitPatch()).toMatchObject({
      runtimeInputMode: 'edit',
      debugBusy: true,
      debugReady: false,
    })
  })
})
