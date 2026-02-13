const TRACE_PATTERN = /^(\[\d+\]|mem\[|x\d+\s<-|f\d+\s<-|v\d+\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i;
const TRACE_INLINE_PATTERN = /(\[\d+\]|mem\[|x\d+\s<-|f\d+\s<-|v\d+\s<-|clint |csr |htif\[|htif-(?:syscall-proxy|term|debug)|pma|ptw|exception|interrupt)/i;
const RUNTIME_PATTERN = /^(running|run watchdog|run timed out|run finished|selected:|htif located|entry point|success|failure:|program exited|committed steps:|exitstatus|debug error:|gas:|ld:|readelf:|\[gas\]|\[ld\]|\[readelf\])/i;
const HTIF_TERM_CMD_PATTERN = /htif-(?:term|syscall-proxy)\s+cmd:\s*0x([0-9a-fA-F]+)/i;
const HTIF_TERM_COMPAT_PATTERN = /htif-term compat byte:\s*0x([0-9a-fA-F]+)/i;

export const parseRuntimeOutputLines = (rawLines) => {
  const lines = Array.isArray(rawLines) ? rawLines.map((line) => String(line)) : [];
  let programText = '';
  const traceLines = [];
  const runtimeLines = [];
  const hasCompatTrace = lines.some((line) => HTIF_TERM_COMPAT_PATTERN.test(line));

  for (const line of lines) {
    const termCompat = line.match(HTIF_TERM_COMPAT_PATTERN);
    const termCmd = line.match(HTIF_TERM_CMD_PATTERN);
    const payloadHex = hasCompatTrace ? termCompat?.[1] ?? null : termCompat?.[1] ?? termCmd?.[1] ?? null;

    let decodedFromLine = false;
    if (payloadHex) {
      try {
        const value = BigInt(`0x${payloadHex}`);
        const ch = Number(value & 0xffn);
        if (ch === 10) {
          programText += '\n';
        } else if (ch >= 32 && ch <= 126) {
          programText += String.fromCharCode(ch);
        }
        decodedFromLine = true;
      } catch {
        // ignore malformed htif payload
      }
    }

    const trimmed = line.trim();
    if (TRACE_PATTERN.test(trimmed)) {
      traceLines.push(line);
      continue;
    }
    if (RUNTIME_PATTERN.test(trimmed)) {
      runtimeLines.push(line);
      continue;
    }

    const inline = line.match(TRACE_INLINE_PATTERN);
    if (inline && typeof inline.index === 'number' && inline.index > 0) {
      const prefix = line.slice(0, inline.index);
      if (prefix && !decodedFromLine) {
        programText = programText ? `${programText}\n${prefix}` : prefix;
      }
      traceLines.push(line.slice(inline.index));
      continue;
    }

    programText = programText ? `${programText}\n${line}` : line;
  }

  return { programText, traceLines, runtimeLines, allLines: lines };
};
