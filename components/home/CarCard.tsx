// components/home/CarCard.tsx
// The BYD Atto 3 on the home screen: one quiet line under the weather and bins
// ("Atto 3 · 50% · 238 km · charging"), which opens the details: battery, range, charging and
// whether it's locked. The car isn't polled on a schedule (to spare its 12V battery), so this
// shows when the numbers are from and has a Refresh button that asks the car once.
// Entities: HOME.car in home.config.ts.

import React, { useEffect, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { callService, useEntity } from '../../lib/hass';
import { Sheet } from '../ui';

const num = (s?: string) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : null; };

/** "just now", "12 min ago", "3 h ago", "yesterday 5:30 pm" */
const ago = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(t).toLocaleString('en-NZ', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

/** "20:25" (hours:minutes) → "20 h 25 min" */
const toFull = (s?: string) => {
  const m = /^(\d+):(\d{2})/.exec(s || '');
  if (!m) return '';
  const h = Number(m[1]), mm = Number(m[2]);
  if (!h && !mm) return '';
  return h ? `${h} h${mm ? ` ${mm} min` : ''}` : `${mm} min`;
};

/** Everything the line and the details show. */
const useCar = () => {
  const c = HOME.car;
  const battery = useEntity(c.battery);
  const range = useEntity(c.range);
  const charging = useEntity(c.charging);
  const plugged = useEntity(c.plugged);
  const power = useEntity(c.power);
  const full = useEntity(c.timeToFull);
  const lock = useEntity(c.lock);
  const updated = useEntity(c.updated);
  const [asking, setAsking] = useState(false);
  const askedAt = useRef<string | undefined>(undefined);
  const [, tick] = useState(0);

  // Keep "12 min ago" current.
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t); }, []);
  // Stop showing "Asking…" once fresh numbers arrive (or after a minute and a half).
  useEffect(() => { if (asking && updated?.state !== askedAt.current) setAsking(false); }, [updated?.state, asking]);
  useEffect(() => { if (!asking) return; const t = setTimeout(() => setAsking(false), 90_000); return () => clearTimeout(t); }, [asking]);

  const pct = num(battery?.state);
  const isCharging = charging?.state === 'on';
  const isPlugged = plugged?.state === 'on';
  const kw = num(power?.state);
  return {
    present: !!battery,
    offline: battery?.state === 'unavailable',
    pct,
    km: num(range?.state),
    isCharging,
    isPlugged,
    kw,
    fullIn: isCharging ? toFull(full?.state) : '',
    lockKnown: !!lock && lock.state !== 'unavailable',
    locked: lock?.state === 'locked',
    updatedAgo: ago(updated?.state),
    colour: pct === null ? '#cbd5e1' : pct <= 20 ? '#c2410c' : pct <= 40 ? '#d97706' : '#2a7a4b',
    asking,
    refresh: () => {
      askedAt.current = updated?.state;
      setAsking(true);
      callService('button', 'press', undefined, { entity_id: c.refresh });
    },
  };
};

/** The details, in a sheet. */
const CarDetails: React.FC<{ car: ReturnType<typeof useCar> }> = ({ car }) => {
  const status = car.isCharging
    ? `Charging${car.kw !== null && car.kw > 0 ? ` at ${(car.kw / 1000).toFixed(1)} kW` : ''}${car.fullIn ? ` · full in ${car.fullIn}` : ''}`
    : car.isPlugged ? 'Plugged in, not charging' : 'Unplugged';
  return (
    <div className="text-left">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl text-slate-900 leading-none">{car.pct === null ? '–' : `${Math.round(car.pct)}%`}</span>
        {car.km !== null && <span className="text-slate-600">{Math.round(car.km)} km range</span>}
      </div>
      <div className="mt-3 h-3 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`Battery ${car.pct ?? 'unknown'}%`}>
        <div className={`h-full rounded-full transition-[width] duration-700 ${car.isCharging ? 'animate-pulse' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, car.pct ?? 0))}%`, background: car.colour }} />
      </div>
      <p className="mt-3 text-[15px] text-slate-800">{car.offline ? 'Car offline' : status}</p>
      <p className="text-sm text-slate-500">
        {car.lockKnown && <>{car.locked ? 'Locked' : <span className="text-orange-700 font-semibold">Unlocked</span>} · </>}
        Updated {car.updatedAgo || 'a while ago'}
      </p>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={car.refresh} disabled={car.asking}
          className="shrink-0 whitespace-nowrap h-11 px-4 rounded-2xl text-[15px] font-semibold bg-white text-slate-800 border border-slate-200 hover:bg-slate-100 disabled:text-slate-400">
          {car.asking ? 'Asking the car…' : 'Refresh now'}
        </button>
        <p className="text-sm text-slate-500">The car is checked at 7 am, 5:30 pm and when you get home, to go easy on its 12V battery.</p>
      </div>
    </div>
  );
};

/** One line for the top of the home screen: "Atto 3 · 50% · 238 km · charging". Tap for details. */
const CarLine: React.FC<{ className?: string }> = ({ className = '' }) => {
  const car = useCar();
  const [open, setOpen] = useState(false);
  if (!car.present) return null; // not set up, or not connected to Home Assistant
  const bits = [
    car.pct === null ? null : `${Math.round(car.pct)}%`,
    car.km === null ? null : `${Math.round(car.km)} km`,
    car.offline ? 'offline' : car.isCharging ? 'charging' : car.isPlugged ? 'plugged in' : null,
  ].filter(Boolean);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-2 text-left ${className}`}>
        <span className="relative w-6 h-3 rounded-[3px] border-[1.5px] border-slate-500 shrink-0" aria-hidden>
          <span className="absolute left-[1px] top-[1px] bottom-[1px] rounded-[1px]" style={{ width: `calc(${Math.max(0, Math.min(100, car.pct ?? 0))}% - 2px)`, background: car.colour }} />
          <span className="absolute -right-[4px] top-[2px] w-[2px] h-[5px] rounded-r bg-slate-500" />
        </span>
        <span>
          <span className="font-semibold text-slate-800">{HOME.car.name}</span> · {bits.join(' · ')}
          {!car.lockKnown || car.locked ? null : <span className="text-orange-700 font-semibold"> · unlocked</span>}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={HOME.car.name}>
        <CarDetails car={car} />
      </Sheet>
    </>
  );
};

export default CarLine;
