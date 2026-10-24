// components/BinNotifier.tsx
// Kāpiti kerbside bins: rubbish every Monday, with recycling and glass on alternate weeks.
import React, { useState } from 'react';

const KEY = 'kapiti_bin_offset';

export const binInfo = (offset: number, now = new Date()) => {
  // Reference date: Monday 1 Jan 2024.
  const weeks = Math.floor((now.getTime() - new Date(2024, 0, 1).getTime()) / (7 * 24 * 3600 * 1000));
  const recycling = (weeks + offset) % 2 === 0;
  return { kind: recycling ? 'recycling' : 'glass', tonight: now.getDay() === 0, colour: recycling ? '#e3b23c' : '#3b6fb6' };
};

/** One quiet line: "Bins out tonight · rubbish and recycling". Tap to swap the week if it's wrong. */
const BinNotifier: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [offset, setOffset] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch { return 0; }
  });
  const swap = () => {
    const next = offset + 1;
    setOffset(next);
    try { localStorage.setItem(KEY, String(next)); } catch { /* private mode */ }
  };
  const { kind, tonight, colour } = binInfo(offset);
  return (
    <button onClick={swap} title="Wrong week? Tap to swap recycling and glass" className={`inline-flex items-center gap-2 text-left ${className}`}>
      <span className="flex gap-0.5 shrink-0" aria-hidden>
        <span className="w-2.5 h-3.5 rounded-[3px] bg-slate-700" />
        <span className="w-2.5 h-3.5 rounded-[3px]" style={{ background: colour }} />
      </span>
      <span className={tonight ? 'font-semibold text-orange-600' : ''}>
        {tonight ? 'Bins out tonight' : 'Bins Monday'}: rubbish and {kind}
      </span>
    </button>
  );
};

export default BinNotifier;
