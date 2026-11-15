// components/home/controls.tsx
// Touch-friendly building blocks shared by the home screens.

import React, { useEffect, useRef, useState } from 'react';
import { HassEntity, callService } from '../../lib/hass';
import { HomeIcons } from './icons';

/** A big, finger-sized slider (0–100). Calls `onCommit` while dragging (throttled) and on release. */
export const FillSlider: React.FC<{
  value: number;
  onCommit: (v: number) => void;
  tone?: 'amber' | 'indigo';
  label?: string;
  disabled?: boolean;
  className?: string;
}> = ({ value, onCommit, tone = 'amber', label, disabled, className = 'h-10' }) => {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const last = useRef(0);
  const pending = useRef<any>(null);

  useEffect(() => { if (!dragging.current) setLocal(value); }, [value]);

  const send = (v: number, force = false) => {
    const now = Date.now();
    clearTimeout(pending.current);
    if (force || now - last.current > 300) { last.current = now; onCommit(v); }
    else pending.current = setTimeout(() => { last.current = Date.now(); onCommit(v); }, 300);
  };

  const fill = tone === 'amber' ? 'bg-amber-300' : 'bg-indigo-300';
  return (
    <div className={`relative rounded-xl overflow-hidden bg-slate-100 ${disabled ? 'opacity-40' : ''} ${className}`}>
      <div className={`absolute inset-y-0 left-0 ${fill} transition-[width] duration-150`} style={{ width: `${Math.max(local, 0)}%` }} />
      {label && (
        <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-slate-700 pointer-events-none">
          {label} · {Math.round(local)}%
        </span>
      )}
      <input
        type="range"
        min={1}
        max={100}
        value={local}
        disabled={disabled}
        aria-label={label || 'Level'}
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; send(local, true); }}
        onTouchEnd={() => { dragging.current = false; send(local, true); }}
        onChange={e => { const v = Number(e.target.value); setLocal(v); send(v); }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
};

export const Switch: React.FC<{ on: boolean; onToggle: () => void; tone?: 'amber' | 'indigo' | 'pink'; label: string }> = ({ on, onToggle, tone = 'amber', label }) => {
  const bg = on ? (tone === 'amber' ? 'bg-amber-400' : tone === 'pink' ? 'bg-pink-500' : 'bg-indigo-600') : 'bg-slate-200';
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${bg}`}
    >
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
};

export const Card: React.FC<{ title?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, action, className = '', children }) => (
  <section className={`bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-slate-200/70 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-4">
        {title && <h2 className="font-display text-xl text-slate-900">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const MoreLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="flex items-center gap-0.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap">
    {children}
    <HomeIcons.Chevron className="w-4 h-4" />
  </button>
);

// --- Lights ---

export const brightnessPct = (e?: HassEntity) =>
  e && e.state === 'on' && typeof e.attributes.brightness === 'number' ? Math.round((e.attributes.brightness / 255) * 100) : 0;

export const lightStatus = (e?: HassEntity) => {
  if (!e) return 'Not found';
  if (e.state === 'unavailable') return 'Offline';
  if (e.state !== 'on') return 'Off';
  const pct = brightnessPct(e);
  return pct ? `On · ${pct}%` : 'On';
};

export const toggleLight = (entityId: string) => callService('light', 'toggle', undefined, { entity_id: entityId });
export const setBrightness = (entityId: string, pct: number) => callService('light', 'turn_on', { brightness_pct: pct }, { entity_id: entityId });

/** One row: tap to toggle, slider appears while the light is on. */
/** Brightness as − and + buttons (10% a press), for the compact light rows. */
const BrightnessStepper: React.FC<{ entityId: string; value: number }> = ({ entityId, value }) => {
  const [pending, setPending] = React.useState<number | null>(null);
  const timer = React.useRef<any>(null);
  const shown = pending ?? value;
  const step = (d: number) => {
    const next = Math.max(5, Math.min(100, Math.round((shown + d) / 10) * 10 || 5));
    setPending(next);
    setBrightness(entityId, next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(null), 2500);
  };
  const btn = 'w-9 h-9 rounded-xl bg-white/80 text-slate-700 text-lg font-semibold flex items-center justify-center active:bg-white disabled:opacity-40';
  return (
    <span className="flex items-center gap-1" role="group" aria-label="Brightness" onClick={e => e.stopPropagation()}>
      <button className={btn} disabled={shown <= 5} onClick={() => step(-10)} aria-label="Dimmer">−</button>
      <span className="w-11 text-center text-sm font-semibold tabular-nums text-slate-700">{shown}%</span>
      <button className={btn} disabled={shown >= 100} onClick={() => step(10)} aria-label="Brighter">+</button>
    </span>
  );
};

export const LightRow: React.FC<{ name: string; entity?: HassEntity; entityId: string; large?: boolean; compact?: boolean }> = ({ name, entity, entityId, large, compact }) => {
  const on = entity?.state === 'on';
  const offline = !entity || entity.state === 'unavailable';
  if (compact) {
    // One line: tap the name to switch it, − and + for brightness.
    return (
      <div className={`rounded-2xl px-2.5 py-2 flex items-center gap-2.5 ${on ? 'bg-amber-50' : 'bg-slate-50'} ${offline ? 'opacity-50' : ''} transition-colors`}>
        <button disabled={offline} onClick={() => toggleLight(entityId)} aria-pressed={on} className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[2.25rem]" aria-label={`${name}: turn ${on ? 'off' : 'on'}`}>
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-amber-400 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}>
            <HomeIcons.Bulb className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0">
            <span className={`block font-bold text-sm truncate ${on ? 'text-slate-800' : 'text-slate-500'}`}>{name}</span>
            <span className="block text-[11px] font-semibold text-slate-400">{on ? 'On' : offline ? 'Offline' : 'Off'}</span>
          </span>
        </button>
        {on && <BrightnessStepper entityId={entityId} value={brightnessPct(entity)} />}
      </div>
    );
  }
  return (
    <div className={`rounded-2xl ${large ? 'p-3' : 'p-2.5'} ${on ? 'bg-amber-50' : 'bg-slate-50'} transition-colors`}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={offline}
        onClick={() => { if (!offline) toggleLight(entityId); }}
        onKeyDown={e => { if (!offline && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleLight(entityId); } }}
        className={`w-full flex items-center gap-3 text-left cursor-pointer select-none ${offline ? 'opacity-50' : ''}`}
      >
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-amber-400 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}>
          <HomeIcons.Bulb className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block font-bold text-slate-800 truncate ${large ? 'text-base' : 'text-sm'}`}>{name}</span>
          <span className="block text-[11px] font-semibold text-slate-400">{lightStatus(entity)}</span>
        </span>
        <Switch on={on} onToggle={() => { if (!offline) toggleLight(entityId); }} label={`${name} on or off`} />
      </div>
      {on && (
        <FillSlider className="h-9 mt-2" value={brightnessPct(entity)} onCommit={v => setBrightness(entityId, v)} label="Brightness" />
      )}
    </div>
  );
};
