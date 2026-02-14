import { useEffect, useRef, type RefObject } from 'react'

import type { RuntimeLinkedGroup } from '../../../pages/runtime/editor/runtimeLinkedDebug'

type UseLinkedDecorationsArgs = {
  showDualPane: boolean
  leftIsProgram: boolean
  visibleLinkedGroups: RuntimeLinkedGroup[]
  activeSourceLine: number | null
  rightActiveLine: number | null
  latestLensLine: number | null
  persistentLensByLine: Record<string, string[]>
  primaryEditorRef: RefObject<any>
  primaryMonacoRef: RefObject<any>
  secondaryEditorRef: RefObject<any>
  secondaryMonacoRef: RefObject<any>
}

const appendLineClass = (
  lineClassMap: Map<number, Set<string>>,
  lineNumber: number,
  className: string
) => {
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return
  }
  if (!lineClassMap.has(lineNumber)) {
    lineClassMap.set(lineNumber, new Set())
  }
  lineClassMap.get(lineNumber)?.add(className)
}

const buildDecorations = (
  lineClassMap: Map<number, Set<string>>,
  model: any,
  monaco: any
) =>
  Array.from(lineClassMap.entries())
    .filter(([lineNumber]) => lineNumber <= model.getLineCount())
    .map(([lineNumber, classes]) => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: Array.from(classes).join(' '),
      },
    }))

export function useLinkedDecorations({
  showDualPane,
  leftIsProgram,
  visibleLinkedGroups,
  activeSourceLine,
  rightActiveLine,
  latestLensLine,
  persistentLensByLine,
  primaryEditorRef,
  primaryMonacoRef,
  secondaryEditorRef,
  secondaryMonacoRef,
}: UseLinkedDecorationsArgs) {
  const primaryDecorationsRef = useRef<string[]>([])
  const secondaryDecorationsRef = useRef<string[]>([])

  useEffect(() => {
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

    const primaryLineClassMap = new Map<number, Set<string>>()
    const secondaryLineClassMap = new Map<number, Set<string>>()

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

    if (leftIsProgram && Number.isInteger(activeSourceLine) && activeSourceLine > 0) {
      appendLineClass(primaryLineClassMap, activeSourceLine, 'debug-active-line')
    }
    if (Number.isInteger(rightActiveLine) && rightActiveLine > 0) {
      appendLineClass(secondaryLineClassMap, rightActiveLine, 'debug-active-line')
    }

    primaryDecorationsRef.current = primaryEditor.deltaDecorations(
      primaryDecorationsRef.current,
      buildDecorations(primaryLineClassMap, primaryModel, primaryMonaco)
    )
    const secondaryLineDecorations = buildDecorations(
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

    if (
      leftIsProgram &&
      Number.isInteger(activeSourceLine) &&
      activeSourceLine > 0 &&
      activeSourceLine <= primaryModel.getLineCount()
    ) {
      primaryEditor.revealLineInCenter(activeSourceLine)
    }
    if (
      Number.isInteger(rightActiveLine) &&
      rightActiveLine > 0 &&
      rightActiveLine <= secondaryModel.getLineCount()
    ) {
      secondaryEditor.revealLineInCenter(rightActiveLine)
    }

    return () => {
      clearEditorDecorations()
    }
  }, [
    activeSourceLine,
    latestLensLine,
    leftIsProgram,
    persistentLensByLine,
    primaryEditorRef,
    primaryMonacoRef,
    rightActiveLine,
    secondaryEditorRef,
    secondaryMonacoRef,
    showDualPane,
    visibleLinkedGroups,
  ])
}
