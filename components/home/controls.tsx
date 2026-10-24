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

  const fill = tone === 'amber' ? 'bg-amber-300' : 'bg-indigo-500';
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
  <section className={`bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between mb-4">
        {title && <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">{title}</h3>}
        {action}
      </div>
    )}
    {children}
  </section>
);

export const MoreLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="flex items-center gap-0.5 text-xs font-bold text-indigo-600 hover:text-indigo-800">
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
export const LightRow: React.FC<{ name: string; entity?: HassEntity; entityId: string; large?: boolean }> = ({ name, entity, entityId, large }) => {
  const on = entity?.state === 'on';
  const offline = !entity || entity.state === 'unavailable';
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
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-amber-400 text-white shadow-md shadow-amber-200' : 'bg-white text-slate-400 border border-slate-200'}`}>
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
