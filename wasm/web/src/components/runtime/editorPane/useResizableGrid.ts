import { useEffect, useState, type RefObject } from 'react'

type Orientation = 'horizontal' | 'vertical'

type UseResizableGridArgs = {
  containerRef: RefObject<HTMLElement>
  orientation: Orientation
  initialRatio: number
  minRatio: number
  maxRatio: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function useResizableGrid({
  containerRef,
  orientation,
  initialRatio,
  minRatio,
  maxRatio,
}: UseResizableGridArgs) {
  const [ratio, setRatio] = useState(initialRatio)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (!isResizing) {
      return undefined
    }
    const onMouseMove = (event: MouseEvent) => {
      const container = containerRef.current
      if (!container) {
        return
      }
      const bounds = container.getBoundingClientRect()
      const axisSize = orientation === 'vertical' ? bounds.width : bounds.height
      if (axisSize <= 0) {
        return
      }
      const relativePosition =
        orientation === 'vertical'
          ? event.clientX - bounds.left
          : event.clientY - bounds.top
      const nextRatio = clamp((relativePosition / axisSize) * 100, minRatio, maxRatio)
      setRatio(nextRatio)
    }
    const onMouseUp = () => setIsResizing(false)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [containerRef, isResizing, maxRatio, minRatio, orientation])

  return {
    ratio,
    setRatio,
    startResizing: () => setIsResizing(true),
    isResizing,
  }
}
