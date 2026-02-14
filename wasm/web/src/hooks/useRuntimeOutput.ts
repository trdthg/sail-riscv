import { useCallback, useMemo, useState } from 'react';
import { parseRuntimeOutputLines } from '../lib/runtimeLogs';

type RuntimeOutputState = {
  debugState: any;
  runtimeLogTab: string;
  elfRunStatus: string;
};

export const useRuntimeOutput = ({
  debugState,
  runtimeLogTab,
  elfRunStatus,
}: RuntimeOutputState) => {
  const [output, setOutput] = useState('');

  const append = useCallback((line: string) => {
    setOutput((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);

  const appendOutputLines = useCallback((lines: string[]) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }
    const chunk = lines.map((line) => String(line)).join('\n');
    setOutput((prev) => (prev ? `${prev}\n${chunk}` : chunk));
  }, []);

  const parsedRuntimeOutput = useMemo(() => {
    const lines = output ? output.split('\n').filter((line) => line.length > 0) : [];
    return parseRuntimeOutputLines(lines);
  }, [output]);

  const displayedProgramOutput = useMemo(() => {
    if (debugState && typeof debugState === 'object' && typeof debugState.programOutput === 'string') {
      return debugState.programOutput;
    }
    return parsedRuntimeOutput.programText;
  }, [debugState, parsedRuntimeOutput.programText]);

  const runtimeLogText = useMemo(() => {
    if (runtimeLogTab === 'status') {
      const lines: string[] = [];
      if (elfRunStatus) {
        lines.push(elfRunStatus);
      }
      if (parsedRuntimeOutput.runtimeLines.length > 0) {
        lines.push(...parsedRuntimeOutput.runtimeLines);
      }
      return lines.length ? lines.join('\n') : '(no status lines)';
    }
    if (runtimeLogTab === 'build') {
      const sourceLines = output ? output.split('\n').filter((line) => line.length > 0) : [];
      const buildLines = sourceLines.filter((line) => /(\[gas\]|\[ld\]|\[readelf\]|gas failed|ld failed|readelf failed|error:|undefined reference|collect2:)/i.test(line));
      if (elfRunStatus && /(build failed|gas failed|ld failed|readelf failed|error)/i.test(elfRunStatus)) {
        buildLines.unshift(elfRunStatus);
      }
      return buildLines.length ? buildLines.join('\n') : '(no build/link errors)';
    }
    if (runtimeLogTab === 'summary') {
      return parsedRuntimeOutput.runtimeLines.join('\n') || '(no runtime summary)';
    }
    if (runtimeLogTab === 'trace') {
      return parsedRuntimeOutput.traceLines.join('\n') || '(no trace lines)';
    }
    return displayedProgramOutput || '(no decoded program output)';
  }, [displayedProgramOutput, elfRunStatus, output, parsedRuntimeOutput.runtimeLines, parsedRuntimeOutput.traceLines, runtimeLogTab]);

  return {
    output,
    setOutput,
    append,
    appendOutputLines,
    parsedRuntimeOutput,
    displayedProgramOutput,
    runtimeLogText,
  };
};
