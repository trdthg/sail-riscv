import { memo, useEffect, useRef, useState } from 'react'

import { RuntimeEditorPane } from '../components/runtime/RuntimeEditorPane.jsx'
import { RuntimeSidebar } from '../components/runtime/RuntimeSidebar.jsx'
import { RuntimeToolbar } from '../components/runtime/RuntimeToolbar.jsx'
import { useRuntimeOutput } from '../hooks/useRuntimeOutput'
import { RuntimeEditorCommandsProvider } from './runtime/editor/RuntimeEditorCommandsProvider'
import { RuntimeEditorProvider } from './runtime/editor/RuntimeEditorProvider'
import { RuntimeSessionProvider } from './runtime/session/RuntimeSessionProvider'
import { useRuntimeSessionState } from './runtime/session/useRuntimeSession'

function RuntimePageLayout({
  isDark,
  isActive,
  editorTheme,
  configTemplatePath,
  setConfigTemplatePath,
  resetConfigFromTemplatePath,
  configsState,
  callDebugWorker,
  setDebugWorkerLineSink,
  forceStopDebugWorker,
  resolveConfigText,
}) {
  const sessionState = useRuntimeSessionState()
  const mainRef = useRef(null)
  const [splitRatio, setSplitRatio] = useState(80)
  const [isResizing, setIsResizing] = useState(false)
  const shellClass = isDark
    ? 'border-l border-slate-700 bg-slate-900 text-slate-100'
    : 'border-l border-slate-300 bg-white text-slate-900'

  const { setOutput, appendOutputLines, runtimeLogText } = useRuntimeOutput({
    debugState: sessionState.debugState,
    runtimeLogTab: sessionState.runtimeLogTab,
    elfRunStatus: sessionState.elfRunStatus,
  })

  useEffect(() => {
    if (!isActive) {
      setDebugWorkerLineSink(null)
      return undefined
    }
    setDebugWorkerLineSink(appendOutputLines)
    return () => {
      setDebugWorkerLineSink(null)
    }
  }, [appendOutputLines, isActive, setDebugWorkerLineSink])

  useEffect(() => {
    if (!isResizing) return undefined
    const onMouseMove = (event) => {
      const container = mainRef.current
      if (!container) return
      const bounds = container.getBoundingClientRect()
      if (bounds.width <= 0) return
      const relativeX = event.clientX - bounds.left
      const leftRatio = (relativeX / bounds.width) * 100
      const editorRatio = 100 - leftRatio
      const clampedEditor = Math.max(60, Math.min(94, editorRatio))
      setSplitRatio(clampedEditor)
    }
    const onMouseUp = () => setIsResizing(false)
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
  }, [isResizing])

  return (
    <div
      className={`box-border h-full w-full min-h-0 overflow-hidden border-t flex flex-col ${
        isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-300 bg-slate-100'
      }`}
    >
      <main
        ref={mainRef}
        className="flex-1 w-full min-h-0 min-w-0 lg:grid"
        style={{
          gridTemplateColumns: `minmax(240px, ${100 - splitRatio}fr) 8px minmax(0, ${splitRatio}fr)`,
        }}
      >
        <section
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden lg:col-start-3 lg:row-start-1 ${shellClass}`}
        >
          <RuntimeToolbar
            isDark={isDark}
            configTemplatePath={configTemplatePath}
            setConfigTemplatePath={setConfigTemplatePath}
            resetConfigFromTemplatePath={resetConfigFromTemplatePath}
            configsState={configsState}
            resolveConfigText={resolveConfigText}
            callDebugWorker={callDebugWorker}
            forceStopDebugWorker={forceStopDebugWorker}
            setOutput={setOutput}
          />
          <RuntimeEditorPane
            isDark={isDark}
            editorTheme={editorTheme}
            runtimeLogText={runtimeLogText}
            setOutput={setOutput}
          />
        </section>

        <div
          className={`hidden cursor-col-resize lg:col-start-2 lg:row-start-1 lg:block ${
            isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'
          }`}
          onMouseDown={() => setIsResizing(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
        />

        <div className="min-h-0 min-w-0 lg:col-start-1 lg:row-start-1">
          <RuntimeSidebar
            isDark={isDark}
            configsState={configsState}
          />
        </div>
      </main>
    </div>
  )
}

function RuntimePageComponent({
  isDark,
  isActive,
  editorTheme,
  configTemplatePath,
  setConfigTemplatePath,
  resetConfigFromTemplatePath,
  configsState,
  callDebugWorker,
  setDebugWorkerLineSink,
  forceStopDebugWorker,
  resolveConfigText,
}) {
  return (
    <RuntimeSessionProvider>
      <RuntimeEditorProvider>
        <RuntimeEditorCommandsProvider>
          <RuntimePageLayout
            isDark={isDark}
            isActive={isActive}
            editorTheme={editorTheme}
            configTemplatePath={configTemplatePath}
            setConfigTemplatePath={setConfigTemplatePath}
            resetConfigFromTemplatePath={resetConfigFromTemplatePath}
            configsState={configsState}
            callDebugWorker={callDebugWorker}
            setDebugWorkerLineSink={setDebugWorkerLineSink}
            forceStopDebugWorker={forceStopDebugWorker}
            resolveConfigText={resolveConfigText}
          />
        </RuntimeEditorCommandsProvider>
      </RuntimeEditorProvider>
    </RuntimeSessionProvider>
  )
}

export const RuntimePage = memo(RuntimePageComponent)
RuntimePage.displayName = 'RuntimePage'
