export const normalizeSingleInstructionAsmInput = (asmText: string): string => {
  const lines = String(asmText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(#|;|\/\/).*$/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('Assembly source is empty.');
  }
  if (lines.length !== 1) {
    throw new Error('Explorer assembly supports exactly one instruction line.');
  }

  const line = lines[0];
  if (line.includes(':')) {
    throw new Error('Labels are not supported in Explorer assembly mode.');
  }
  if (line.startsWith('.')) {
    throw new Error('Directives are not supported in Explorer assembly mode.');
  }
  return line;
};
