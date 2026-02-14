import type { RuntimeChangedRegLens } from '../session/runtimeSessionReducer'

export type NormalizedTraceWrite =
  | {
      kind: 'reg'
      name: string
      value: string
    }
  | {
      kind: 'mem'
      value: string
      access?: string
      address?: string
    }

export type TraceRegisterChanges = {
  changedXRegs: boolean[]
  changedFRegs: boolean[]
  changedRegLens: RuntimeChangedRegLens[]
}

export function normalizeTraceRegWrites(value: unknown): NormalizedTraceWrite[] {
  if (!Array.isArray(value)) {
    return []
  }
  const normalized: NormalizedTraceWrite[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const kind = String((item as { kind?: unknown }).kind || '').trim().toLowerCase()
    if (kind === 'mem') {
      const valueText = String((item as { value?: unknown }).value || '').trim()
      if (!valueText) {
        continue
      }
      const access = String((item as { access?: unknown }).access || '').trim().toUpperCase()
      const address = String((item as { address?: unknown }).address || '').trim().toLowerCase()
      normalized.push({
        kind: 'mem',
        value: valueText,
        access,
        address,
      })
      continue
    }
    const name = String((item as { name?: unknown }).name || '').trim()
    const rawValue = String((item as { value?: unknown }).value || '').trim()
    if (!name || !rawValue) {
      continue
    }
    normalized.push({
      kind: 'reg',
      name,
      value: rawValue,
    })
  }
  return normalized
}

type BuildTraceRegisterChangesArgs = {
  traceRegWrites: NormalizedTraceWrite[]
  previousXregs: unknown[] | null
  previousFregs: unknown[] | null
  nextXregs: unknown[]
  nextFregs: unknown[]
  xregAbi: unknown[]
}

export function buildTraceRegisterChanges(args: BuildTraceRegisterChangesArgs): TraceRegisterChanges {
  const changedXRegs = new Array(args.nextXregs.length).fill(false)
  const changedFRegs = new Array(args.nextFregs.length).fill(false)
  const changedRegLens: RuntimeChangedRegLens[] = []

  if (!args.traceRegWrites.length) {
    return { changedXRegs, changedFRegs, changedRegLens }
  }

  const aliasToXRegIndex = new Map<string, number>()
  for (let index = 0; index < args.xregAbi.length; index += 1) {
    const alias = String(args.xregAbi[index] || '').trim().toLowerCase()
    if (alias) {
      aliasToXRegIndex.set(alias, index)
    }
  }

  const seen = new Set<string>()
  for (const write of args.traceRegWrites) {
    if (write.kind === 'mem') {
      const access = String(write.access || 'W')
      const address = String(write.address || '').trim()
      const memLabel = address ? `mem[${access},${address}]` : `mem[${access}]`
      changedRegLens.push({
        reg: memLabel,
        prev: '',
        next: String(write.value || ''),
      })
      continue
    }

    const rawName = String(write.name || '').trim()
    if (!rawName) {
      continue
    }
    const regName = rawName.toLowerCase()
    const xMatch = regName.match(/^x([0-9]|[12][0-9]|3[01])$/)
    if (xMatch) {
      const regIndex = Number(xMatch[1])
      if (!Number.isInteger(regIndex) || regIndex < 0 || regIndex >= args.nextXregs.length) {
        continue
      }
      const key = `x${regIndex}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      changedXRegs[regIndex] = true
      const alias =
        typeof args.xregAbi[regIndex] === 'string' ? String(args.xregAbi[regIndex]) : ''
      const prev = Array.isArray(args.previousXregs)
        ? String(args.previousXregs[regIndex] ?? write.value)
        : String(write.value)
      const next = String(args.nextXregs[regIndex] ?? write.value)
      changedRegLens.push({
        reg: `x${regIndex}`,
        alias,
        prev,
        next,
      })
      continue
    }

    const fMatch = regName.match(/^f([0-9]|[12][0-9]|3[01])$/)
    if (fMatch) {
      const regIndex = Number(fMatch[1])
      if (!Number.isInteger(regIndex) || regIndex < 0 || regIndex >= args.nextFregs.length) {
        continue
      }
      const key = `f${regIndex}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      changedFRegs[regIndex] = true
      const prev = Array.isArray(args.previousFregs)
        ? String(args.previousFregs[regIndex] ?? write.value)
        : String(write.value)
      const next = String(args.nextFregs[regIndex] ?? write.value)
      changedRegLens.push({
        reg: `f${regIndex}`,
        prev,
        next,
      })
      continue
    }

    const aliasIndex = aliasToXRegIndex.get(regName)
    if (
      !Number.isInteger(aliasIndex) ||
      aliasIndex < 0 ||
      aliasIndex >= args.nextXregs.length
    ) {
      continue
    }
    const key = `x${aliasIndex}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    changedXRegs[aliasIndex] = true
    const alias =
      typeof args.xregAbi[aliasIndex] === 'string'
        ? String(args.xregAbi[aliasIndex])
        : rawName
    const prev = Array.isArray(args.previousXregs)
      ? String(args.previousXregs[aliasIndex] ?? write.value)
      : String(write.value)
    const next = String(args.nextXregs[aliasIndex] ?? write.value)
    changedRegLens.push({
      reg: `x${aliasIndex}`,
      alias,
      prev,
      next,
    })
  }

  return { changedXRegs, changedFRegs, changedRegLens }
}
