import { useEffect, useMemo, useRef } from 'react'

import { useRuntimeEditorState as useRuntimeEditorBuffers } from '../../pages/runtime/editor/useRuntimeEditor'
import {
  buildVisibleLinkedGroups,
  formatChangedRegLensText,
} from '../../pages/runtime/editor/runtimeLinkedDebug'
import { useRuntimeEditorCommands } from '../../pages/runtime/editor/useRuntimeEditorCommands'
import { useRuntimeEditorState } from '../../pages/runtime/hooks/useRuntimeEditorState'
import { useRuntimeSessionActions, useRuntimeSessionState } from '../../pages/runtime/session/useRuntimeSession'
import { EditorPaneHeader } from './editorPane/EditorPaneHeader'
import { LogsPane } from './editorPane/LogsPane'
import { SplitEditors } from './editorPane/SplitEditors'
import { useLensHistory } from './editorPane/useLensHistory'
import { useLinkedDecorations } from './editorPane/useLinkedDecorations'
import { useResizableGrid } from './editorPane/useResizableGrid'

const LINK_COLOR_PALETTE_SIZE = 6

export function RuntimeEditorPane({ isDark, editorTheme, runtimeLogText, setOutput }) {
  const sessionState = useRuntimeSessionState()
  const { setRuntimeSessionField } = useRuntimeSessionActions()
  const editorBuffers = useRuntimeEditorBuffers()
  const editorState = useRuntimeEditorState()
  const { registerEditorCapabilities } = useRuntimeEditorCommands()

  const editorAreaRef = useRef(null)
  const paneAreaRef = useRef(null)
  const primaryEditorRef = useRef(null)
  const primaryMonacoRef = useRef(null)
  const secondaryEditorRef = useRef(null)
  const secondaryMonacoRef = useRef(null)

  const { ratio: editorSplitRatio, startResizing: startEditorResizing } = useResizableGrid({
    containerRef: editorAreaRef,
    orientation: 'horizontal',
    initialRatio: 78,
    minRatio: 45,
    maxRatio: 88,
  })
  const { ratio: paneSplitRatio, startResizing: startPaneResizing } = useResizableGrid({
    containerRef: paneAreaRef,
    orientation: 'vertical',
    initialRatio: 36,
    minRatio: 12,
    maxRatio: 88,
  })

  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'
  const panelBarClass = isDark ? 'border-b border-slate-700 bg-slate-800/80' : 'border-b border-slate-200 bg-slate-50/90'

  const isUploadMode = sessionState.runtimeInputMode === 'upload'
  const leftTab = editorBuffers.editEditorTab === 'linker'
    ? 'linker'
    : editorBuffers.editEditorTab === 'config'
      ? 'config'
      : 'program'
  const leftIsProgram = leftTab === 'program'
  const showDualPane = !isUploadMode && leftIsProgram

  const rightEditorBaseValue =
    editorBuffers.expandedAsmSourceInput || '; objdump disassembly is not available yet'
  const leftEditorValue = leftIsProgram
    ? editorBuffers.asmSourceInput
    : editorBuffers.linkerScriptInput
  const leftEditorLanguage = leftTab === 'program' ? 'asm' : 'plaintext'
  const activeProgramSourceLine =
    leftIsProgram && (!editorState.activeSourceFile || editorState.activeSourceFile === 'program.s')
      ? editorState.activeSourceLine
      : null

  const visibleLinkedGroups = useMemo(
    () =>
      buildVisibleLinkedGroups({
        links: editorBuffers.expandedSourceLinks,
        sourceLine: activeProgramSourceLine,
        fallbackSourceLine: editorState.activeExpandedSourceOriginLine,
        paletteSize: LINK_COLOR_PALETTE_SIZE,
      }),
    [
      activeProgramSourceLine,
      editorBuffers.expandedSourceLinks,
      editorState.activeExpandedSourceOriginLine,
    ]
  )

  const changedXRegCount = useMemo(
    () => sessionState.changedXRegs.filter(Boolean).length,
    [sessionState.changedXRegs]
  )

  const regLensText = useMemo(
    () =>
      formatChangedRegLensText({
        lenses: sessionState.changedRegLens,
        changedCount: changedXRegCount,
      }),
    [changedXRegCount, sessionState.changedRegLens]
  )

  const rightActiveLine = useMemo(() => {
    const expanded = Number(editorState.activeExpandedSourceLine)
    if (Number.isInteger(expanded) && expanded > 0) {
      return expanded
    }
    const fallback = Number(editorState.activeUploadDisasmLine)
    if (Number.isInteger(fallback) && fallback > 0) {
      return fallback
    }
    return null
  }, [editorState.activeExpandedSourceLine, editorState.activeUploadDisasmLine])

  const rightLensAnchorLine = useMemo(() => {
    const committed = Number(editorState.activeLastCommittedExpandedSourceLine)
    if (Number.isInteger(committed) && committed > 0) {
      return committed
    }
    return rightActiveLine
  }, [editorState.activeLastCommittedExpandedSourceLine, rightActiveLine])

  const { latestLensLine, persistentLensByLine, rightEditorValue } = useLensHistory({
    showDualPane,
    rightEditorBaseValue,
    regLensText,
    rightLensAnchorLine,
  })

  useLinkedDecorations({
    showDualPane,
    leftIsProgram,
    visibleLinkedGroups,
    activeSourceLine: activeProgramSourceLine,
    rightActiveLine,
    latestLensLine,
    persistentLensByLine,
    primaryEditorRef,
    primaryMonacoRef,
    secondaryEditorRef,
    secondaryMonacoRef,
  })

  useEffect(() => {
    registerEditorCapabilities({
      focusPrimaryLine(lineNumber) {
        const editor = primaryEditorRef.current
        const monaco = primaryMonacoRef.current
        if (!editor || !monaco) {
          return
        }
        const model = editor.getModel()
        const line = Number(lineNumber)
        if (!model || !Number.isInteger(line) || line < 1 || line > model.getLineCount()) {
          return
        }
        editor.revealLineInCenter(line)
        editor.setSelection({
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        })
        editor.focus()
      },
      replacePrimaryContent(nextValue) {
        if (editorState.runtimeEditorReadOnly) {
          return
        }
        editorState.handleRuntimeEditorChange(String(nextValue ?? ''), { isFlush: false })
      },
      setSplitMode() {
        // Runtime edit mode is fixed dual-pane.
      },
      setSecondaryTab() {
        // Runtime edit mode keeps objdump disassembly on the right pane.
      },
    })
    return () => {
      registerEditorCapabilities(null)
    }
  }, [editorState, registerEditorCapabilities])

  const handlePrimaryEditorMount = (editor, monaco) => {
    primaryEditorRef.current = editor
    primaryMonacoRef.current = monaco
    editorState.handleRuntimeEditorMount?.(editor, monaco)
  }

  const handleSecondaryEditorMount = (editor, monaco) => {
    secondaryEditorRef.current = editor
    secondaryMonacoRef.current = monaco
  }

  return (
    <div className="min-h-0 flex-1 flex flex-col">
      <EditorPaneHeader
        showDualPane={showDualPane}
        isUploadMode={isUploadMode}
        leftIsProgram={leftIsProgram}
        panelBarClass={panelBarClass}
        tabActiveClass={tabActiveClass}
      />
      <SplitEditors
        showDualPane={showDualPane}
        isDark={isDark}
        editorTheme={editorTheme}
        editorAreaRef={editorAreaRef}
        paneAreaRef={paneAreaRef}
        editorSplitRatio={editorSplitRatio}
        paneSplitRatio={paneSplitRatio}
        startEditorResizing={startEditorResizing}
        startPaneResizing={startPaneResizing}
        leftEditorLanguage={leftEditorLanguage}
        leftEditorValue={leftEditorValue}
        rightEditorValue={rightEditorValue}
        runtimeEditorLanguage={editorState.runtimeEditorLanguage}
        runtimeEditorValue={editorState.runtimeEditorValue}
        runtimeEditorReadOnly={editorState.runtimeEditorReadOnly}
        leftEditorReadOnly={!leftIsProgram}
        handleRuntimeEditorChange={editorState.handleRuntimeEditorChange}
        handlePrimaryEditorMount={handlePrimaryEditorMount}
        handleSecondaryEditorMount={handleSecondaryEditorMount}
      >
        <LogsPane
          isDark={isDark}
          runtimeLogTab={sessionState.runtimeLogTab}
          setRuntimeLogTab={(tab) => setRuntimeSessionField('runtimeLogTab', tab)}
          runtimeLogText={runtimeLogText}
          setOutput={setOutput}
        />
      </SplitEditors>
    </div>
  )
}
