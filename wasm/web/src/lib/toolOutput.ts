export const parseToolLines = (lines) => {
  let hex = '';
  let bin = '';
  let width = '';
  let asm = '';
  let error = '';
  let jsonType = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj === 'object') {
          if (obj.type) jsonType = obj.type;
          if (obj.error) error = obj.error;
          if (obj.asm) asm = obj.asm;
          if (obj.hex) hex = obj.hex;
          if (obj.bin) bin = obj.bin;
          if (obj.width) width = String(obj.width);
          continue;
        }
      } catch {
        // keep falling through text parsing
      }
    }
    if (line.startsWith('asm:')) {
      asm = line.replace(/^asm:\s*/i, '');
    } else if (line.startsWith('hex:')) {
      hex = line.replace(/^hex:\s*/i, '');
    } else if (line.startsWith('bin:')) {
      bin = line.replace(/^bin:\s*/i, '');
    } else if (line.startsWith('width:')) {
      width = line.replace(/^width:\s*/i, '');
    } else if (
      /^assembly did not match/i.test(line)
      || /^invalid/i.test(line)
      || /^empty assembly/i.test(line)
    ) {
      error = line;
    }
  }
  return { hex, bin, width, asm, error, type: jsonType };
};

export const getOutputLines = () => {
  if (!window.__sailOutputLines) {
    window.__sailOutputLines = [];
  }
  return window.__sailOutputLines;
};
