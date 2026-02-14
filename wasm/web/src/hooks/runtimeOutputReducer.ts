const TRACE_PATTERN =
  /^(\[\d+\]|mem\[|[A-Za-z_][A-Za-z0-9_]*\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i
const TRACE_INLINE_PATTERN =
  /(\[\d+\]|mem\[|[A-Za-z_][A-Za-z0-9_]*\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i
const RUNTIME_PATTERN =
  /^(running|run watchdog|run timed out|run finished|selected:|htif located|entry point|success|failure:|program exited|committed steps:|exitstatus|debug error:|gas:|ld:|readelf:|\[gas\]|\[ld\]|\[readelf\])/i
const BUILD_PATTERN =
  /(\[gas\]|\[ld\]|\[readelf\]|gas failed|ld failed|readelf failed|error:|undefined reference|collect2:)/i
const HTIF_TERM_CMD_PATTERN = /htif-(?:term|syscall-proxy)\s+cmd:\s*0x([0-9a-fA-F]+)/i
const HTIF_TERM_COMPAT_PATTERN = /htif-term compat byte:\s*0x([0-9a-fA-F]+)/i

export type RuntimeOutputState = {
  rawOutput: string
  allLines: string[]
  traceLines: string[]
  runtimeLines: string[]
  buildLines: string[]
  programText: string
  preferCompatTrace: boolean
}

export function createRuntimeOutputInitialState(): RuntimeOutputState {
  return {
    rawOutput: '',
    allLines: [],
    traceLines: [],
    runtimeLines: [],
    buildLines: [],
    programText: '',
    preferCompatTrace: false,
  }
}

function appendProgramText(
  previousText: string,
  nextText: string,
  options: { inline?: boolean } = {}
): string {
  if (!nextText) {
    return previousText
  }
  if (options.inline) {
    return `${previousText}${nextText}`
  }
  return previousText ? `${previousText}\n${nextText}` : nextText
}

function decodeProgramChunk(
  line: string,
  preferCompatTrace: boolean
): {
  nextText: string
  consumedByTrace: boolean
  nextPreferCompatTrace: boolean
  appendInline: boolean
} {
  const termCompat = line.match(HTIF_TERM_COMPAT_PATTERN)
  const termCmd = line.match(HTIF_TERM_CMD_PATTERN)
  const nextPreferCompatTrace = preferCompatTrace || Boolean(termCompat)
  const payloadHex = nextPreferCompatTrace ? termCompat?.[1] ?? null : termCompat?.[1] ?? termCmd?.[1] ?? null

  let decodedText = ''
  let decodedFromLine = false
  if (payloadHex) {
    try {
      const value = BigInt(`0x${payloadHex}`)
      const ch = Number(value & 0xffn)
      if (ch === 10) {
        decodedText += '\n'
      } else if (ch >= 32 && ch <= 126) {
        decodedText += String.fromCharCode(ch)
      }
      decodedFromLine = true
    } catch {
      // ignore malformed payload
    }
  }

  const trimmed = line.trim()
  if (TRACE_PATTERN.test(trimmed)) {
    return { nextText: decodedText, consumedByTrace: true, nextPreferCompatTrace, appendInline: decodedFromLine }
  }
  if (RUNTIME_PATTERN.test(trimmed)) {
    return { nextText: decodedText, consumedByTrace: true, nextPreferCompatTrace, appendInline: decodedFromLine }
  }

  const inline = line.match(TRACE_INLINE_PATTERN)
  if (inline && typeof inline.index === 'number' && inline.index > 0) {
    const prefix = line.slice(0, inline.index)
    const nextText = prefix && !decodedFromLine
      ? appendProgramText(decodedText, prefix, { inline: !decodedText })
      : decodedText
    return {
      nextText,
      consumedByTrace: true,
      nextPreferCompatTrace,
      appendInline: decodedFromLine,
    }
  }

  if (decodedText) {
    return { nextText: decodedText, consumedByTrace: false, nextPreferCompatTrace, appendInline: true }
  }
  return { nextText: line, consumedByTrace: false, nextPreferCompatTrace, appendInline: false }
}

export function appendRuntimeOutputLines(
  state: RuntimeOutputState,
  lines: string[]
): RuntimeOutputState {
  if (!Array.isArray(lines) || lines.length === 0) {
    return state
  }

  const normalized = lines.map((line) => String(line))
  const nextAllLines = [...state.allLines, ...normalized]
  const nextTraceLines = [...state.traceLines]
  const nextRuntimeLines = [...state.runtimeLines]
  const nextBuildLines = [...state.buildLines]
  let nextProgramText = state.programText
  let nextPreferCompatTrace = state.preferCompatTrace

  for (const line of normalized) {
    const trimmed = line.trim()
    const decodeChunk = decodeProgramChunk(line, nextPreferCompatTrace)
    nextPreferCompatTrace = decodeChunk.nextPreferCompatTrace
    if (TRACE_PATTERN.test(trimmed)) {
      nextTraceLines.push(line)
    } else if (RUNTIME_PATTERN.test(trimmed)) {
      nextRuntimeLines.push(line)
    } else {
      const inline = line.match(TRACE_INLINE_PATTERN)
      if (inline && typeof inline.index === 'number' && inline.index > 0) {
        const traceSuffix = line.slice(inline.index)
        if (traceSuffix) {
          nextTraceLines.push(traceSuffix)
        }
      }
    }
    if (BUILD_PATTERN.test(line)) {
      nextBuildLines.push(line)
    }
    if (!decodeChunk.consumedByTrace) {
      nextProgramText = appendProgramText(nextProgramText, decodeChunk.nextText, {
        inline: decodeChunk.appendInline,
      })
    } else if (decodeChunk.nextText) {
      nextProgramText = appendProgramText(nextProgramText, decodeChunk.nextText, {
        inline: decodeChunk.appendInline,
      })
    }
  }

  return {
    rawOutput: nextAllLines.join('\n'),
    allLines: nextAllLines,
    traceLines: nextTraceLines,
    runtimeLines: nextRuntimeLines,
    buildLines: nextBuildLines,
    programText: nextProgramText,
    preferCompatTrace: nextPreferCompatTrace,
  }
}

export function setRuntimeOutputText(value: string): RuntimeOutputState {
  const initial = createRuntimeOutputInitialState()
  const normalized = String(value || '')
  if (!normalized) {
    return initial
  }
  const lines = normalized.split('\n').filter((line) => line.length > 0)
  return appendRuntimeOutputLines(initial, lines)
}
