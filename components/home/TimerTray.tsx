// components/home/TimerTray.tsx
// Running timers float in the bottom-right corner on every screen (including over a recipe).

import React, { useEffect, useRef, useState } from 'react';
import { announce } from '../../lib/announce';
import { useIsHome } from '../../lib/hass';
import { useSettings } from '../../lib/settings';
import {
  Timer, addTime, chime, formatLeft, markDone, pauseTimer, removeTimer, resumeTimer, startTimer, timeLeft, useTimers,
} from '../../lib/timers';
import { HomeIcons } from './icons';
import { useIsPhone } from '../ui';

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];

const TimerPill: React.FC<{ t: Timer; now: number }> = ({ t, now }) => {
  const left = timeLeft(t, now);
  const running = !!t.endsAt;
  const progress = t.duration ? 1 - left / t.duration : 1;
  if (t.done) {
    return (
      <div className="pointer-events-auto bg-orange-500 text-white rounded-3xl shadow-2xl p-4 w-72 max-w-full animate-pulse">
        <p className="text-sm font-medium text-white/85">Time's up</p>
        <p className="font-semibold text-lg leading-tight line-clamp-2">{t.label}</p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => removeTimer(t.id)} className="flex-1 py-2.5 rounded-xl bg-white text-orange-700 font-semibold">Done</button>
          <button onClick={() => addTime(t.id, 60)} className="px-3 py-2.5 rounded-xl bg-white/20 font-bold">+1 min</button>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-auto bg-slate-900 text-white rounded-3xl shadow-2xl p-4 w-72 max-w-full relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 bg-indigo-500/40 transition-[width] duration-500" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold text-slate-300 line-clamp-2">{t.label}</p>
          <button aria-label="Cancel timer" onClick={() => removeTimer(t.id)} className="text-slate-400 hover:text-white -mt-1">✕</button>
        </div>
        <div className="flex items-end justify-between mt-1">
          <p className={`text-4xl font-semibold tabular-nums ${running ? '' : 'text-slate-400'}`}>{formatLeft(left)}</p>
          <div className="flex gap-1.5 mb-1">
            <button onClick={() => addTime(t.id, 60)} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-xs font-bold">+1m</button>
            <button aria-label={running ? 'Pause' : 'Resume'} onClick={() => (running ? pauseTimer(t.id) : resumeTimer(t.id))} className="w-9 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              {running ? <HomeIcons.Pause className="w-4 h-4" /> : <HomeIcons.Play className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TimerTray: React.FC = () => {
  const timers = useTimers();
  const isPhone = useIsPhone();
  const isHome = useIsHome();
  const { timers: timerSettings } = useSettings();
  const [now, setNow] = useState(Date.now());
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState('');
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  // Finish timers that have run out.
  useEffect(() => {
    for (const t of timers) {
      if (t.done || !t.endsAt || t.endsAt > now) continue;
      const overdue = now - t.endsAt;
      markDone(t.id);
      if (overdue > 2 * 60 * 1000 || announced.current.has(t.id)) continue; // finished while the screen was closed
      announced.current.add(t.id);
      chime();
      if (isHome && timerSettings.speaker) announce(`Timer done. ${t.label}.`, timerSettings.speaker, 60);
    }
  }, [now, timers, isHome, timerSettings.speaker]);

  // Keep chiming every few seconds until someone taps Done.
  const anyDone = timers.some(t => t.done);
  useEffect(() => {
    if (!anyDone) return;
    const i = setInterval(chime, 5000);
    return () => clearInterval(i);
  }, [anyDone]);

  const quick = (minutes: number) => {
    startTimer(`${minutes} minute timer`, minutes * 60);
    setPicker(false);
    setCustom('');
  };

  return (
    <div className={`fixed z-[150] flex flex-col items-end gap-3 pointer-events-none ${isPhone ? 'bottom-[5.5rem] right-3 left-3' : 'bottom-5 right-5'}`}>
      {timers.map(t => <TimerPill key={t.id} t={t} now={now} />)}
      {picker && (
        <div className="pointer-events-auto bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 w-72">
          <p className="text-sm font-semibold text-slate-600 mb-3">New timer</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map(m => (
              <button key={m} onClick={() => quick(m)} className="py-3 rounded-xl bg-slate-100 hover:bg-indigo-50 font-semibold text-slate-700">{m}<span className="text-xs font-bold text-slate-400"> min</span></button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input value={custom} onChange={e => setCustom(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Minutes"
              onKeyDown={e => { if (e.key === 'Enter' && Number(custom) > 0) quick(Number(custom)); }}
              className="flex-1 min-w-0 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100" />
            <button disabled={!(Number(custom) > 0)} onClick={() => quick(Number(custom))} className="px-4 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30">Start</button>
          </div>
        </div>
      )}
      {!isPhone && <button
        onClick={() => setPicker(p => !p)}
        aria-label="Timers"
        className={`pointer-events-auto h-14 rounded-full shadow-xl flex items-center gap-2 font-bold transition-colors ${picker ? 'bg-slate-900 text-white px-5' : 'bg-white text-slate-700 border border-slate-200 px-5'}`}
      >
        <HomeIcons.Timer className="w-5 h-5" /> {picker ? 'Close' : 'Timer'}
      </button>}
    </div>
  );
};

export default TimerTray;
