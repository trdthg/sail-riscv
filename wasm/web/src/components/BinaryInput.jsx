import { useState } from 'react';
import { labelColors } from '../lib/bits.js';

const renderBinarySpans = (text, fieldMap, hoverLabel) => {
  let bitIdx = -1;
  return text.split('').map((ch, idx) => {
    if (ch !== '0' && ch !== '1') {
      return (
        <span key={`sp-${idx}`} className="inline-block w-[1ch] text-transparent">
          0
        </span>
      );
    }
    bitIdx += 1;
    const label = fieldMap?.[bitIdx] || 'fixed';
    const base = (labelColors[label] || labelColors.fixed).replace(/bg-[^ ]+|border-[^ ]+/g, '').trim();
    const highlight = hoverLabel && hoverLabel === label ? 'bg-slate-200/70 rounded-sm' : '';
    return (
      <span
        key={`bit-${idx}`}
        className={`inline-flex w-[1ch] items-center justify-center ${base} ${highlight} font-medium`}
        title={`b${31 - bitIdx} = ${ch} (${label})`}
      >
        {ch}
      </span>
    );
  });
};

export const BinaryInput = ({
  binInput,
  bitLayout,
  inputRef,
  onChange,
}) => {
  const [hoverLabel, setHoverLabel] = useState('');
  return (
  <div className="md:col-span-2 space-y-2">
    <div className="flex items-center justify-between text-sm font-medium text-slate-700">
      <span>Binary instruction</span>
      {bitLayout && (
        <span className="text-xs text-slate-400">Bit layout 31 → 0</span>
      )}
    </div>
    <div className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="e.g. 0000 0000 0000 0000 1000 0000 0110 0111"
        value={binInput}
        onChange={onChange}
        ref={inputRef}
        maxLength={32 + Math.floor((32 - 1) / 4)}
        className={`h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono tracking-normal leading-none selection:bg-transparent selection:text-transparent ${bitLayout ? 'text-transparent caret-slate-900' : 'text-slate-900'}`}
      />
      {bitLayout && (
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex h-12 items-center px-4">
          <div className="flex w-full items-center font-mono text-sm leading-none tracking-normal text-slate-900">
            {renderBinarySpans(binInput || ' ', bitLayout.fieldMap, hoverLabel)}
          </div>
        </div>
      )}
      {bitLayout && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
            {Array.from(new Set(bitLayout.segments.map((seg) => seg.label))).map((label) => (
              <span
                key={label}
                onMouseEnter={() => setHoverLabel(label)}
                onMouseLeave={() => setHoverLabel('')}
                className={`rounded-full border px-2 py-0.5 ${labelColors[label] || labelColors.fixed}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
  );
};
