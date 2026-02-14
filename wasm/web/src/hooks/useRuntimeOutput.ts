import { useCallback, useMemo, useState } from 'react';
import {
  appendRuntimeOutputLines,
  createRuntimeOutputInitialState,
  setRuntimeOutputText,
} from './runtimeOutputReducer';

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
  const [outputState, setOutputState] = useState(createRuntimeOutputInitialState);

  const append = useCallback((line: string) => {
    setOutputState((prev) => appendRuntimeOutputLines(prev, [line]));
  }, []);

  const appendOutputLines = useCallback((lines: string[]) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }
    setOutputState((prev) => appendRuntimeOutputLines(prev, lines));
  }, []);

  const setOutput = useCallback((value: string) => {
    setOutputState(setRuntimeOutputText(value));
  }, []);

  const displayedProgramOutput = useMemo(() => {
    if (debugState && typeof debugState === 'object' && typeof debugState.programOutput === 'string') {
      return debugState.programOutput;
    }
    return outputState.programText;
  }, [debugState, outputState.programText]);

  const runtimeLogText = useMemo(() => {
    if (runtimeLogTab === 'status') {
      const lines: string[] = [];
      if (elfRunStatus) {
        lines.push(elfRunStatus);
      }
      if (outputState.runtimeLines.length > 0) {
        lines.push(...outputState.runtimeLines);
      }
      return lines.length ? lines.join('\n') : '(no status lines)';
    }
    if (runtimeLogTab === 'build') {
      const buildLines = [...outputState.buildLines];
      if (elfRunStatus && /(build failed|gas failed|ld failed|readelf failed|error)/i.test(elfRunStatus)) {
        buildLines.unshift(elfRunStatus);
      }
      return buildLines.length ? buildLines.join('\n') : '(no build/link errors)';
    }
    if (runtimeLogTab === 'summary') {
      return outputState.runtimeLines.join('\n') || '(no runtime summary)';
    }
    if (runtimeLogTab === 'trace') {
      return outputState.traceLines.join('\n') || '(no trace lines)';
    }
    return displayedProgramOutput || '(no decoded program output)';
  }, [
    displayedProgramOutput,
    elfRunStatus,
    outputState.buildLines,
    outputState.runtimeLines,
    outputState.traceLines,
    runtimeLogTab,
  ]);

  return {
    output: outputState.rawOutput,
    setOutput,
    append,
    appendOutputLines,
    parsedRuntimeOutput: {
      allLines: outputState.allLines,
      traceLines: outputState.traceLines,
      runtimeLines: outputState.runtimeLines,
      programText: outputState.programText,
    },
    displayedProgramOutput,
    runtimeLogText,
  };
};
