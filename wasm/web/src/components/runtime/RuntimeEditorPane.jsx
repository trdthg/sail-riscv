import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'

import { useRuntimeEditorState as useRuntimeEditorBuffers } from '../../pages/runtime/editor/useRuntimeEditor'
import {
  buildVisibleLinkedGroups,
  formatChangedRegLensText,
} from '../../pages/runtime/editor/runtimeLinkedDebug'
import { useRuntimeEditorCommands } from '../../pages/runtime/editor/useRuntimeEditorCommands'
import { useRuntimeEditorState } from '../../pages/runtime/hooks/useRuntimeEditorState'
import { useRuntimeSessionActions, useRuntimeSessionState } from '../../pages/runtime/session/useRuntimeSession'

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
  const primaryDecorationsRef = useRef([])
  const secondaryDecorationsRef = useRef([])
  const [paneSplitRatio, setPaneSplitRatio] = useState(40)
  const [isPaneResizing, setIsPaneResizing] = useState(false)
  const [persistentLensByLine, setPersistentLensByLine] = useState({})
  const [latestLensLine, setLatestLensLine] = useState(null)
  const [editorSplitRatio, setEditorSplitRatio] = useState(64)
  const [isEditorResizing, setIsEditorResizing] = useState(false)

  const tabActiveClass = isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'
  const tabInactiveClass = isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'
  const controlButtonClass = isDark
    ? 'rounded border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-400'
    : 'rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400'
  const logPaneClass = isDark ? 'border-t border-slate-700 bg-slate-950' : 'border-t border-slate-300 bg-slate-100'
  const logTextClass = isDark ? 'text-slate-100' : 'text-slate-800'
  const panelBarClass = isDark ? 'border-b border-slate-700 bg-slate-800/80' : 'border-b border-slate-200 bg-slate-50/90'

  const isUploadMode = sessionState.runtimeInputMode === 'upload'
  const leftTab = editorBuffers.editEditorTab === 'linker' ? 'linker' : 'program'
  const leftIsProgram = leftTab === 'program'
  const showDualPane = !isUploadMode && leftIsProgram

  const rightEditorBaseValue = editorBuffers.expandedAsmSourceInput || '; objdump disassembly is not available yet'
  const leftEditorValue = leftIsProgram ? editorBuffers.asmSourceInput : editorBuffers.linkerScriptInput
  const leftEditorLanguage = leftIsProgram ? 'asm' : 'plaintext'

  const visibleLinkedGroups = useMemo(
    () =>
      buildVisibleLinkedGroups({
        links: editorBuffers.expandedSourceLinks,
        sourceLine: editorState.activeSourceLine,
        fallbackSourceLine: editorState.activeExpandedSourceOriginLine,
        paletteSize: LINK_COLOR_PALETTE_SIZE,
      }),
    [
      editorBuffers.expandedSourceLinks,
      editorState.activeSourceLine,
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

  const rightEditorValue = useMemo(() => {
    if (!showDualPane) {
      return rightEditorBaseValue
    }
    const lensEntries = Object.entries(persistentLensByLine)
    if (!lensEntries.length) {
      return rightEditorBaseValue
    }
    const lines = rightEditorBaseValue.split('\n')
    for (const [lineKey, history] of lensEntries) {
      const lineNumber = Number(lineKey)
      if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
        continue
      }
      const latestLensText = Array.isArray(history) ? history[history.length - 1] : ''
      if (typeof latestLensText !== 'string' || !latestLensText.trim()) {
        continue
      }
      const index = lineNumber - 1
      if (index < 0 || index >= lines.length) {
        continue
      }
      lines[index] = `${lines[index]}  ; ${latestLensText}`
    }
    return lines.join('\n')
  }, [showDualPane, rightEditorBaseValue, persistentLensByLine])

  useEffect(() => {
    setPersistentLensByLine({})
    setLatestLensLine(null)
  }, [rightEditorBaseValue, showDualPane])

  useEffect(() => {
    if (!showDualPane || !regLensText || !rightLensAnchorLine) {
      return
    }
    const anchorLine = Number(rightLensAnchorLine)
    if (!Number.isInteger(anchorLine) || anchorLine <= 0) {
      return
    }
    const lineKey = String(anchorLine)
    setPersistentLensByLine((previous) => {
      const previousLineHistory = Array.isArray(previous[lineKey]) ? previous[lineKey] : []
      const nextLineHistory = [...previousLineHistory, regLensText]
      return {
        ...previous,
        [lineKey]: nextLineHistory,
      }
    })
    setLatestLensLine(anchorLine)
  }, [regLensText, rightLensAnchorLine, showDualPane])

  const clearEditorDecorations = () => {
    if (primaryEditorRef.current) {
      primaryDecorationsRef.current = primaryEditorRef.current.deltaDecorations(
        primaryDecorationsRef.current,
        []
      )
    }
    if (secondaryEditorRef.current) {
      secondaryDecorationsRef.current = secondaryEditorRef.current.deltaDecorations(
        secondaryDecorationsRef.current,
        []
      )
    }
  }

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
        // Runtime edit mode is now fixed dual-pane.
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

  useEffect(() => {
    if (!showDualPane) {
      clearEditorDecorations()
      return
    }
    const primaryEditor = primaryEditorRef.current
    const primaryMonaco = primaryMonacoRef.current
    const secondaryEditor = secondaryEditorRef.current
    const secondaryMonaco = secondaryMonacoRef.current
    if (!primaryEditor || !primaryMonaco || !secondaryEditor || !secondaryMonaco) {
      return
    }

    const primaryModel = primaryEditor.getModel()
    const secondaryModel = secondaryEditor.getModel()
    if (!primaryModel || !secondaryModel) {
      return
    }

    const primaryLineClassMap = new Map()
    const secondaryLineClassMap = new Map()
    const appendLineClass = (lineClassMap, lineNumber, className) => {
      if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
        return
      }
      if (!lineClassMap.has(lineNumber)) {
        lineClassMap.set(lineNumber, new Set())
      }
      lineClassMap.get(lineNumber).add(className)
    }

    for (const group of visibleLinkedGroups) {
      const colorClass = group.isActive
        ? `debug-link-group-active-${group.colorIndex}`
        : `debug-link-group-${group.colorIndex}`
      if (leftIsProgram) {
        appendLineClass(primaryLineClassMap, group.sourceLine, colorClass)
      }
      for (const expandedLine of group.expandedLines) {
        appendLineClass(secondaryLineClassMap, expandedLine, colorClass)
      }
    }

    const activeSourceLine = Number(editorState.activeSourceLine)
    if (leftIsProgram && Number.isInteger(activeSourceLine) && activeSourceLine > 0) {
      appendLineClass(primaryLineClassMap, activeSourceLine, 'debug-active-line')
    }
    const activeExpandedLine = Number(rightActiveLine)
    if (Number.isInteger(activeExpandedLine) && activeExpandedLine > 0) {
      appendLineClass(secondaryLineClassMap, activeExpandedLine, 'debug-active-line')
    }

    const toDecorations = (lineClassMap, model, monaco) =>
      Array.from(lineClassMap.entries())
        .filter(([lineNumber]) => lineNumber <= model.getLineCount())
        .map(([lineNumber, classes]) => ({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: Array.from(classes).join(' '),
          },
        }))

    primaryDecorationsRef.current = primaryEditor.deltaDecorations(
      primaryDecorationsRef.current,
      toDecorations(primaryLineClassMap, primaryModel, primaryMonaco)
    )
    const secondaryLineDecorations = toDecorations(
      secondaryLineClassMap,
      secondaryModel,
      secondaryMonaco
    )
    const lensHoverDecorations = Object.entries(persistentLensByLine)
      .map(([lineKey, lensEntries]) => {
        const lineNumber = Number(lineKey)
        const lineHistory = Array.isArray(lensEntries) ? lensEntries : []
        const sanitizedHistory = lineHistory
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0)
        if (
          !Number.isInteger(lineNumber) ||
          lineNumber <= 0 ||
          lineNumber > secondaryModel.getLineCount() ||
          sanitizedHistory.length === 0
        ) {
          return null
        }
        const historyBody = sanitizedHistory
          .map((value, index) => `${index + 1}. ${value}`)
          .join('\n')
        return {
          range: new secondaryMonaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName:
              lineNumber === latestLensLine
                ? 'runtime-reg-lens-gutter-active'
                : 'runtime-reg-lens-gutter',
            hoverMessage: [{ value: `**Register changes history**\n\n${historyBody}` }],
          },
        }
      })
      .filter((item) => item !== null)
    secondaryDecorationsRef.current = secondaryEditor.deltaDecorations(
      secondaryDecorationsRef.current,
      [...secondaryLineDecorations, ...lensHoverDecorations]
    )

    if (leftIsProgram && Number.isInteger(activeSourceLine) && activeSourceLine > 0 && activeSourceLine <= primaryModel.getLineCount()) {
      primaryEditor.revealLineInCenter(activeSourceLine)
    }
    if (
      Number.isInteger(activeExpandedLine) &&
      activeExpandedLine > 0 &&
      activeExpandedLine <= secondaryModel.getLineCount()
    ) {
      secondaryEditor.revealLineInCenter(activeExpandedLine)
    }
  }, [
    editorState.activeSourceLine,
    leftIsProgram,
    rightActiveLine,
    latestLensLine,
    persistentLensByLine,
    rightEditorValue,
    showDualPane,
    visibleLinkedGroups,
  ])

  useEffect(() => {
    if (!isEditorResizing) return undefined
    const onMouseMove = (event) => {
      const container = editorAreaRef.current
      if (!container) return
      const bounds = container.getBoundingClientRect()
      if (bounds.height <= 0) return
      const relativeY = event.clientY - bounds.top
      const nextRatio = (relativeY / bounds.height) * 100
      const clamped = Math.max(38, Math.min(84, nextRatio))
      setEditorSplitRatio(clamped)
    }
    const onMouseUp = () => setIsEditorResizing(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isEditorResizing])

  useEffect(() => {
    if (!isPaneResizing) return undefined
    const onMouseMove = (event) => {
      const container = paneAreaRef.current
      if (!container) return
      const bounds = container.getBoundingClientRect()
      if (bounds.width <= 0) return
      const relativeX = event.clientX - bounds.left
      const nextRatio = (relativeX / bounds.width) * 100
      const clamped = Math.max(10, Math.min(85, nextRatio))
      setPaneSplitRatio(clamped)
    }
    const onMouseUp = () => setIsPaneResizing(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isPaneResizing])

  return (
    <div
      ref={editorAreaRef}
      className="min-h-0 flex-1 grid"
      style={{ gridTemplateRows: `${editorSplitRatio}fr 8px ${100 - editorSplitRatio}fr` }}
    >
      <div className="min-h-0 flex flex-col">
        <div className={`flex items-center gap-2 px-2 py-1 ${panelBarClass}`}>
          {showDualPane ? (
            <>
              <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
                {leftIsProgram ? 'program.S' : 'link.ld'}
              </span>
              <span className="text-[11px] opacity-60">↔</span>
              <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
                objdump.S
              </span>
              <span className="ml-1 text-[10px] uppercase tracking-[0.08em] opacity-60">
                same color = same source mapping
              </span>
            </>
          ) : isUploadMode ? (
            <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
              disasm.S
            </span>
          ) : (
            <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
              link.ld
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {showDualPane ? (
            <div
              ref={paneAreaRef}
              className="grid h-full min-h-0"
              style={{ gridTemplateColumns: `${paneSplitRatio}fr 12px ${100 - paneSplitRatio}fr` }}
            >
              <div className="min-h-0">
                <Editor
                  language={leftEditorLanguage}
                  value={leftEditorValue}
                  onChange={editorState.runtimeEditorReadOnly ? undefined : editorState.handleRuntimeEditorChange}
                  onMount={handlePrimaryEditorMount}
                  options={{
                    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: 'off',
                    tabSize: 2,
                    smoothScrolling: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    lineNumbersMinChars: 3,
                    readOnly: !leftIsProgram,
                    domReadOnly: !leftIsProgram,
                  }}
                  theme={editorTheme}
                />
              </div>
              <div
                className={`relative z-10 ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-col-resize`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  setIsPaneResizing(true)
                }}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize source and disassembly panes"
              />
              <div className={`min-h-0 border-l ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <Editor
                  language="asm"
                  value={rightEditorValue}
                  onMount={handleSecondaryEditorMount}
                  options={{
                    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: 'off',
                    tabSize: 2,
                    smoothScrolling: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    lineNumbersMinChars: 3,
                    readOnly: true,
                    domReadOnly: true,
                  }}
                  theme={editorTheme}
                />
              </div>
            </div>
          ) : (
            <Editor
              language={editorState.runtimeEditorLanguage}
              value={editorState.runtimeEditorValue}
              onChange={editorState.runtimeEditorReadOnly ? undefined : editorState.handleRuntimeEditorChange}
              onMount={handlePrimaryEditorMount}
              options={{
                fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                minimap: { enabled: false },
                wordWrap: 'off',
                tabSize: 2,
                smoothScrolling: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                lineNumbersMinChars: 3,
                readOnly: editorState.runtimeEditorReadOnly,
                domReadOnly: editorState.runtimeEditorReadOnly,
              }}
              theme={editorTheme}
            />
          )}
        </div>
      </div>
      <div
        className={`${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-row-resize`}
        onMouseDown={() => setIsEditorResizing(true)}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor and logs"
      />
      <div className={`min-h-0 flex flex-col ${logPaneClass}`}>
        <div className={`flex items-center justify-between px-2 py-1.5 ${isDark ? 'border-b border-slate-700' : 'border-b border-slate-300 bg-slate-50'}`}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRuntimeSessionField('runtimeLogTab', 'status')}
              className={`rounded px-3 py-1 text-[11px] font-medium ${sessionState.runtimeLogTab === 'status' ? tabActiveClass : tabInactiveClass}`}
            >
              Status
            </button>
            <button
              type="button"
              onClick={() => setRuntimeSessionField('runtimeLogTab', 'build')}
              className={`rounded px-3 py-1 text-[11px] font-medium ${sessionState.runtimeLogTab === 'build' ? tabActiveClass : tabInactiveClass}`}
            >
              Build Errors
            </button>
            <button
              type="button"
              onClick={() => setRuntimeSessionField('runtimeLogTab', 'program')}
              className={`rounded px-3 py-1 text-[11px] font-medium ${sessionState.runtimeLogTab === 'program' ? tabActiveClass : tabInactiveClass}`}
            >
              Program Output
            </button>
            <button
              type="button"
              onClick={() => setRuntimeSessionField('runtimeLogTab', 'summary')}
              className={`rounded px-3 py-1 text-[11px] font-medium ${sessionState.runtimeLogTab === 'summary' ? tabActiveClass : tabInactiveClass}`}
            >
              Runtime Summary
            </button>
            <button
              type="button"
              onClick={() => setRuntimeSessionField('runtimeLogTab', 'trace')}
              className={`rounded px-3 py-1 text-[11px] font-medium ${sessionState.runtimeLogTab === 'trace' ? tabActiveClass : tabInactiveClass}`}
            >
              Sail Trace
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOutput('')}
            className={`rounded px-2 py-1 text-[11px] ${controlButtonClass}`}
          >
            Clear
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <pre className={`m-0 h-full overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${logTextClass}`}>
            {runtimeLogText}
          </pre>
        </div>
      </div>
    </div>
  )
}
