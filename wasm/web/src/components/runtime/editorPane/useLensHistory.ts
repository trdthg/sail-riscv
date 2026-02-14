import { useEffect, useMemo, useState } from 'react'

type UseLensHistoryArgs = {
  showDualPane: boolean
  rightEditorBaseValue: string
  regLensText: string
  rightLensAnchorLine: number | null
}

type PersistentLensByLine = Record<string, string[]>

export function useLensHistory({
  showDualPane,
  rightEditorBaseValue,
  regLensText,
  rightLensAnchorLine,
}: UseLensHistoryArgs) {
  const [persistentLensByLine, setPersistentLensByLine] = useState<PersistentLensByLine>({})
  const [latestLensLine, setLatestLensLine] = useState<number | null>(null)

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
  }, [persistentLensByLine, rightEditorBaseValue, showDualPane])

  return {
    latestLensLine,
    persistentLensByLine,
    rightEditorValue,
  }
}
