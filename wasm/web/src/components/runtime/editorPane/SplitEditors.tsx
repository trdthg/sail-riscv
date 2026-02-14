import Editor from '@monaco-editor/react'
import type { ReactNode, RefObject } from 'react'

type SplitEditorsArgs = {
  showDualPane: boolean
  isDark: boolean
  editorTheme: string
  editorAreaRef: RefObject<HTMLDivElement>
  paneAreaRef: RefObject<HTMLDivElement>
  editorSplitRatio: number
  paneSplitRatio: number
  startEditorResizing: () => void
  startPaneResizing: () => void
  leftEditorLanguage: 'asm' | 'plaintext'
  leftEditorValue: string
  rightEditorValue: string
  runtimeEditorLanguage: 'asm' | 'plaintext'
  runtimeEditorValue: string
  runtimeEditorReadOnly: boolean
  leftEditorReadOnly: boolean
  handleRuntimeEditorChange: (value: string | undefined, event: { isFlush?: boolean } | undefined) => void
  handlePrimaryEditorMount: (editor: any, monaco: any) => void
  handleSecondaryEditorMount: (editor: any, monaco: any) => void
  children?: ReactNode
}

export function SplitEditors({
  showDualPane,
  isDark,
  editorTheme,
  editorAreaRef,
  paneAreaRef,
  editorSplitRatio,
  paneSplitRatio,
  startEditorResizing,
  startPaneResizing,
  leftEditorLanguage,
  leftEditorValue,
  rightEditorValue,
  runtimeEditorLanguage,
  runtimeEditorValue,
  runtimeEditorReadOnly,
  leftEditorReadOnly,
  handleRuntimeEditorChange,
  handlePrimaryEditorMount,
  handleSecondaryEditorMount,
  children,
}: SplitEditorsArgs) {
  return (
    <div
      ref={editorAreaRef}
      className="min-h-0 w-full flex-1 grid"
      style={{ gridTemplateRows: `${editorSplitRatio}fr 8px ${100 - editorSplitRatio}fr` }}
    >
      <div className="min-h-0 w-full flex flex-col">
        <div className="min-h-0 min-w-0 w-full flex-1">
          {showDualPane ? (
            <div
              ref={paneAreaRef}
              className="grid h-full min-h-0 min-w-0 w-full"
              style={{
                gridTemplateColumns: `minmax(0, ${paneSplitRatio}fr) 16px minmax(0, ${
                  100 - paneSplitRatio
                }fr)`,
              }}
            >
              <div className="min-h-0 min-w-0">
                <Editor
                  language={leftEditorLanguage}
                  value={leftEditorValue}
                  onChange={leftEditorReadOnly ? undefined : handleRuntimeEditorChange}
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
                    readOnly: leftEditorReadOnly,
                    domReadOnly: leftEditorReadOnly,
                  }}
                  theme={editorTheme}
                />
              </div>
              <div
                className={`relative z-10 select-none ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-col-resize`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startPaneResizing()
                }}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize source and disassembly panes"
              />
              <div className={`min-h-0 min-w-0 border-l ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
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
              language={runtimeEditorLanguage}
              value={runtimeEditorValue}
              onChange={runtimeEditorReadOnly ? undefined : handleRuntimeEditorChange}
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
                readOnly: runtimeEditorReadOnly,
                domReadOnly: runtimeEditorReadOnly,
              }}
              theme={editorTheme}
            />
          )}
        </div>
      </div>
      <div
        className={`${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} cursor-row-resize`}
        onMouseDown={startEditorResizing}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor and logs"
      />
      <div className="min-h-0">{children}</div>
    </div>
  )
}
