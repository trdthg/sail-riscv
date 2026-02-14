import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RuntimeEditorPane } from './RuntimeEditorPane.jsx'
import { createOpenTabCommand } from '../../pages/runtime/editorCommands'
import { RuntimeEditorCommandsProvider } from '../../pages/runtime/editor/RuntimeEditorCommandsProvider'
import { RuntimeEditorProvider } from '../../pages/runtime/editor/RuntimeEditorProvider'
import { useRuntimeEditorActions } from '../../pages/runtime/editor/useRuntimeEditor'
import { useRuntimeEditorCommands } from '../../pages/runtime/editor/useRuntimeEditorCommands'
import { RuntimeSessionProvider } from '../../pages/runtime/session/RuntimeSessionProvider'
import { useRuntimeSessionActions } from '../../pages/runtime/session/useRuntimeSession'

const revealCalls: number[] = []
const decorationCalls: Array<{
  role: 'left' | 'right'
  classNames: string[]
  lineDecorationClassNames: string[]
  hoverMessages: string[]
}> = []
let editorMountCount = 0

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')
  return {
    default: function MockMonacoEditor({ onMount, value }) {
      const role = editorMountCount % 2 === 0 ? 'left' : 'right'
      editorMountCount += 1
      useEffect(() => {
        const model = {
          getLineCount: () => 300,
          getLineMaxColumn: () => 80,
        }
        const editor = {
          getModel: () => model,
          revealLineInCenter: (line) => {
            revealCalls.push(Number(line))
          },
          setSelection: vi.fn(),
          focus: vi.fn(),
          deltaDecorations: (_previous, next) => {
            decorationCalls.push({
              role,
              classNames: next.map((item) => String(item?.options?.className || '')),
              lineDecorationClassNames: next.map((item) =>
                String(item?.options?.linesDecorationsClassName || '')
              ),
              hoverMessages: next.flatMap((item) => {
                const hover = item?.options?.hoverMessage
                if (!Array.isArray(hover)) {
                  return []
                }
                return hover
                  .map((entry) => String(entry?.value || '').trim())
                  .filter((value) => value.length > 0)
              }),
            })
            return next.map((_, index) => `decoration-${index}`)
          },
        }
        const monaco = {
          Range: class {
            constructor() {}
          },
        }
        onMount?.(editor, monaco)
      }, [onMount, role])

      return (
        <div data-testid={`mock-monaco-editor-${role}`}>
          {value}
        </div>
      )
    },
  }
})

function RuntimeEditorPaneHarness() {
  return (
    <RuntimeSessionProvider>
      <RuntimeEditorProvider>
        <RuntimeEditorCommandsProvider>
          <RuntimeEditorPaneHarnessInner />
        </RuntimeEditorCommandsProvider>
      </RuntimeEditorProvider>
    </RuntimeSessionProvider>
  )
}

function RuntimeEditorPaneHarnessInner() {
  const [showPane, setShowPane] = useState(true)
  const { dispatchRuntimeEditorCommand } = useRuntimeEditorCommands()
  const { patchRuntimeSession } = useRuntimeSessionActions()
  const { patchRuntimeEditor } = useRuntimeEditorActions()

  return (
    <div>
      <button
        type="button"
        onClick={() => dispatchRuntimeEditorCommand(createOpenTabCommand('linker'))}
      >
        Command Open Linker Tab
      </button>
      <button
        type="button"
        onClick={() => {
          patchRuntimeEditor({
            expandedAsmSourceInput: [
              'li a0,72',
              'sw a0,0(t0)',
              'li a0,0x01010000',
              'sw a0,4(t0)',
              'li a0,101',
              'sw a0,0(t0)',
            ].join('\n'),
            expandedSourceLinks: [
              { sourceLine: 9, expandedLines: [1, 2] },
              { sourceLine: 10, expandedLines: [3, 4] },
              { sourceLine: 11, expandedLines: [5, 6] },
            ],
          })
          patchRuntimeSession({
            runtimeInputMode: 'edit',
            debugState: {
              sourceLine: 10,
              expandedSourceLine: 3,
              expandedSourceOriginLine: 10,
            },
            changedXRegs: Array.from({ length: 32 }, (_, index) => index === 5 || index === 10),
            changedRegLens: [
              { reg: 'x5', alias: 't0', prev: '0x1', next: '0x2' },
              { reg: 'x10', alias: 'a0', prev: '0x0', next: '0x48' },
            ],
          })
        }}
      >
        Inject Debug State
      </button>
      <button
        type="button"
        onClick={() => {
          patchRuntimeSession({
            runtimeInputMode: 'edit',
            debugState: {
              sourceLine: 11,
              expandedSourceLine: 5,
              expandedSourceOriginLine: 11,
            },
            changedXRegs: Array.from({ length: 32 }, (_, index) => index === 11),
            changedRegLens: [
              { reg: 'x11', alias: 'a1', prev: '0x0', next: '0x65' },
            ],
          })
        }}
      >
        Inject Next Debug State
      </button>
      <button
        type="button"
        onClick={() => setShowPane((prev) => !prev)}
      >
        Toggle Pane
      </button>
      {showPane && (
        <RuntimeEditorPane
          isDark={false}
          editorTheme="vs"
          runtimeLogText="runtime log text"
          setOutput={() => {}}
        />
      )}
    </div>
  )
}

describe('RuntimeEditorPane linked-debug view', () => {
  beforeEach(() => {
    revealCalls.length = 0
    decorationCalls.length = 0
    editorMountCount = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps dual pane and supports linker tab on the left', async () => {
    const user = userEvent.setup()
    render(<RuntimeEditorPaneHarness />)

    expect(screen.getByText('program.S')).not.toBeNull()
    expect(screen.getByText('objdump.S')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Command Open Linker Tab' }))
    expect(screen.getByText('link.ld')).not.toBeNull()
    expect(screen.queryByText('objdump.S')).toBeNull()
  })

  it('syncs both editors and renders expanded inline register lens', async () => {
    const user = userEvent.setup()
    render(<RuntimeEditorPaneHarness />)

    await user.click(screen.getByRole('button', { name: 'Inject Debug State' }))

    await waitFor(() => {
      expect(revealCalls).toContain(10)
      expect(revealCalls).toContain(3)
    })
    const leftClasses = decorationCalls
      .filter((call) => call.role === 'left')
      .flatMap((call) => call.classNames)
    const rightClasses = decorationCalls
      .filter((call) => call.role === 'right')
      .flatMap((call) => call.classNames)
    expect(leftClasses.some((name) => name.includes('debug-link-group-active-'))).toBe(true)
    expect(leftClasses.some((name) => /\bdebug-link-group-\d+\b/.test(name))).toBe(true)
    expect(leftClasses.some((name) => name.includes('debug-active-line'))).toBe(true)
    expect(rightClasses.some((name) => name.includes('debug-link-group-active-'))).toBe(true)
    expect(rightClasses.some((name) => /\bdebug-link-group-\d+\b/.test(name))).toBe(true)
    expect(rightClasses.some((name) => name.includes('debug-active-line'))).toBe(true)
    const rightEditor = screen.getByTestId('mock-monaco-editor-right')
    expect(rightEditor.textContent).toContain('li a0,72')
    expect(rightEditor.textContent).toContain('Δ x5(t0)=0x1→0x2')
    expect(rightEditor.textContent).not.toContain("htif_putc 'H'")
  })

  it('keeps previous inline lenses after later steps', async () => {
    const user = userEvent.setup()
    render(<RuntimeEditorPaneHarness />)

    await user.click(screen.getByRole('button', { name: 'Inject Debug State' }))
    await user.click(screen.getByRole('button', { name: 'Inject Next Debug State' }))

    const rightEditor = screen.getByTestId('mock-monaco-editor-right')
    expect(rightEditor.textContent).toContain('Δ x11(a1)=0x0→0x65')
    expect(rightEditor.textContent).toContain('Δ x5(t0)=0x1→0x2')
    const rightLineDecorations = decorationCalls
      .filter((call) => call.role === 'right')
      .flatMap((call) => call.lineDecorationClassNames)
    expect(rightLineDecorations.some((value) => value.includes('runtime-reg-lens-gutter'))).toBe(true)
    const rightHoverMessages = decorationCalls
      .filter((call) => call.role === 'right')
      .flatMap((call) => call.hoverMessages)
      .join('\n')
    expect(rightHoverMessages).toContain('x5(t0)=0x1→0x2')
    expect(rightHoverMessages).toContain('x11(a1)=0x0→0x65')
  })

  it('cleans up capabilities when pane unmounts and remounts', async () => {
    const user = userEvent.setup()
    render(<RuntimeEditorPaneHarness />)

    await user.click(screen.getByRole('button', { name: 'Toggle Pane' }))
    expect(screen.queryByText('objdump.S')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Command Open Linker Tab' }))
    await user.click(screen.getByRole('button', { name: 'Toggle Pane' }))
    expect(screen.getByText('link.ld')).not.toBeNull()
  })
})
