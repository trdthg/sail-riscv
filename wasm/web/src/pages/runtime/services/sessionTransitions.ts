import type { RuntimeSessionState } from '../session/runtimeSessionReducer'

export function createClearDebugDiffPatch(): Pick<
  RuntimeSessionState,
  'changedXRegs' | 'changedFRegs' | 'changedRegLens'
> {
  return {
    changedXRegs: [],
    changedFRegs: [],
    changedRegLens: [],
  }
}

export function createSwitchToEditPatch(): Partial<RuntimeSessionState> {
  return {
    runtimeInputMode: 'edit',
    debugState: null,
    debugReady: false,
    ...createClearDebugDiffPatch(),
    elfRunStatus: 'Edit mode',
  }
}

export function createUploadInitPatch(targetElfFile: File): Partial<RuntimeSessionState> {
  return {
    uploadElfFile: targetElfFile,
    debugBusy: true,
    debugReady: false,
    runtimeInputMode: 'upload',
    elfRunStatus: `Initializing ${targetElfFile.name}...`,
  }
}

export function createAssembleInitPatch(): Partial<RuntimeSessionState> {
  return {
    debugBusy: true,
    debugReady: false,
    runtimeInputMode: 'edit',
    elfRunStatus: 'Assembling + linking in worker...',
  }
}

export function createResetSessionPatch(): Partial<RuntimeSessionState> {
  return {
    debugBusy: false,
    debugReady: false,
    debugState: null,
    elfRunStatus: 'Debug session reset.',
  }
}
