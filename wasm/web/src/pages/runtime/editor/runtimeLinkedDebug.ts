import type { RuntimeExpandedSourceLink } from './runtimeEditorReducer'

type BuildVisibleLinkedGroupsArgs = {
  links: RuntimeExpandedSourceLink[]
  sourceLine: number | null
  fallbackSourceLine?: number | null
  neighborDistance?: number
  paletteSize?: number
}

export type RuntimeLinkedGroup = {
  sourceLine: number
  expandedLines: number[]
  colorIndex: number
  isActive: boolean
}

const asPositiveInteger = (value: unknown): number | null => {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null
  }
  return numeric
}

export function buildVisibleLinkedGroups({
  links,
  sourceLine,
  fallbackSourceLine = null,
  neighborDistance = 1,
  paletteSize = 6,
}: BuildVisibleLinkedGroupsArgs): RuntimeLinkedGroup[] {
  if (!Array.isArray(links) || links.length === 0) {
    return []
  }
  const activeSourceLine = asPositiveInteger(sourceLine) ?? asPositiveInteger(fallbackSourceLine)
  const normalizedPaletteSize = Math.max(1, Number(paletteSize) || 1)
  void neighborDistance
  const linkMap = new Map<number, Set<number>>()
  for (const link of links) {
    if (!link || typeof link !== 'object') {
      continue
    }
    const source = asPositiveInteger(link.sourceLine)
    if (!source) {
      continue
    }
    const expandedLines = Array.isArray(link.expandedLines)
      ? link.expandedLines
          .map((line) => asPositiveInteger(line))
          .filter((line): line is number => line !== null)
      : []
    if (!expandedLines.length) {
      continue
    }
    if (!linkMap.has(source)) {
      linkMap.set(source, new Set())
    }
    for (const expandedLine of expandedLines) {
      linkMap.get(source).add(expandedLine)
    }
  }
  if (!linkMap.size) {
    return []
  }

  const sortedSources = Array.from(linkMap.keys())
    .sort((left, right) => left - right)
  return sortedSources.map((source, index) => ({
      sourceLine: source,
      expandedLines: Array.from(linkMap.get(source)).sort((left, right) => left - right),
      colorIndex: index % normalizedPaletteSize,
      isActive: Boolean(activeSourceLine) && source === activeSourceLine,
    }))
}

type ChangedRegLensLike = {
  reg: string
  alias?: string
  prev: string
  next: string
}

export function formatChangedRegLensText(args: {
  lenses: ChangedRegLensLike[]
  changedCount: number
}): string {
  if (!Array.isArray(args.lenses) || args.lenses.length === 0) {
    return ''
  }
  const segments = args.lenses.map((lens) => {
    if (!lens.prev) {
      return `${lens.reg}<-${lens.next}`
    }
    const aliasPart = lens.alias ? `(${lens.alias})` : ''
    return `${lens.reg}${aliasPart}=${lens.prev}→${lens.next}`
  })
  const overflow = Math.max(0, Number(args.changedCount) - args.lenses.length)
  if (overflow > 0) {
    segments.push(`+${overflow} more`)
  }
  return `Δ ${segments.join(', ')}`
}
