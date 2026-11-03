// components/home/GardenCard.tsx
// The vege garden sensor: soil moisture and temperature now, plus a small chart of each over
// the last day or week (from Home Assistant's history). One measure per chart, never two axes.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hassStore, useEntity } from '../../lib/hass';
import { Panel } from '../ui';

const MOISTURE = 'sensor.garden_soil_moisture';
const TEMP = 'sensor.garden_temperature';
const BATTERY = 'sensor.garden_sensor_battery';

// Water blue and clay, checked for colour-blind separation against the card colour.
const BLUE = '#2f6fa3';
const CLAY = '#b85d37';

type Point = { t: number; v: number };
type Range = '24h' | '7d';

const num = (s?: string) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : null; };

/** History of one sensor from Home Assistant, thinned to a sensible number of points. */
const useHistory = (entityId: string, range: Range, refreshKey: string | undefined) => {
  const [points, setPoints] = useState<Point[] | null>(null);
  useEffect(() => {
    const hass = hassStore.get();
    if (!hass) return;
    let live = true;
    const hours = range === '24h' ? 24 : 24 * 7;
    hass.callWS({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - hours * 3600e3).toISOString(),
      entity_ids: [entityId], minimal_response: true, no_attributes: true, significant_changes_only: false,
    }).then((res: any) => {
      if (!live) return;
      const raw: Point[] = (res?.[entityId] || [])
        .map((s: any) => ({ t: (s.lu ?? s.lc) * 1000, v: num(s.s) }))
        .filter((p: any) => p.v !== null);
      // Average into buckets (30 min for a day, 3 h for a week) so the line stays calm.
      const bucket = (range === '24h' ? 0.5 : 3) * 3600e3;
      const map = new Map<number, { sum: number; n: number }>();
      raw.forEach(p => { const k = Math.floor(p.t / bucket) * bucket; const b = map.get(k) || { sum: 0, n: 0 }; b.sum += p.v; b.n++; map.set(k, b); });
      setPoints([...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t: t + bucket / 2, v: Math.round((b.sum / b.n) * 10) / 10 })));
    }).catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [entityId, range, refreshKey]);
  return points;
};

const when = (t: number, range: Range) => new Date(t).toLocaleString('en-NZ', range === '24h'
  ? { hour: 'numeric', minute: '2-digit' }
  : { weekday: 'short', hour: 'numeric' });

/** A single-series line chart with a hover crosshair and tooltip. */
const MiniChart: React.FC<{ points: Point[] | null; color: string; unit: string; range: Range; label: string; fixedMax?: number }> = ({ points, color, unit, range, label, fixedMax }) => {
  const W = 320, H = 96, PAD = { l: 30, r: 8, t: 8, b: 18 };
  const box = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;
    const vs = points.map(p => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (fixedMax !== undefined) { lo = 0; hi = Math.max(fixedMax, hi); }
    else { const pad = Math.max(1, (hi - lo) * 0.2); lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad); }
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(0.001, hi - lo)) * (H - PAD.t - PAD.b);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    return { lo, hi, x, y, d, t0, t1 };
  }, [points, fixedMax]);

  if (!points) return <div className="h-24 rounded-xl bg-slate-50 animate-pulse" />;
  if (!geo) return <p className="h-24 flex items-center justify-center text-sm text-slate-500 rounded-xl bg-slate-50">Not enough readings yet</p>;

  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bestD = Infinity;
    points.forEach((p, i) => { const d = Math.abs(geo.x(p.t) - px); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  const mid = (geo.lo + geo.hi) / 2;

  return (
    <div className="relative">
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} className="w-full h-24 touch-none select-none" role="img"
        aria-label={`${label} over the last ${range === '24h' ? 'day' : 'week'}, from ${points[0].v}${unit} to ${points[points.length - 1].v}${unit}`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {[geo.lo, mid, geo.hi].map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="currentColor" className="text-slate-200" strokeWidth="1" />
            <text x={PAD.l - 6} y={geo.y(v) + 3.5} textAnchor="end" className="fill-slate-500" fontSize="10">{Math.round(v)}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} className="fill-slate-500" fontSize="10">{when(geo.t0, range)}</text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-slate-500" fontSize="10">now</text>
        <path d={geo.d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hp && (
          <g>
            <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" className="text-slate-400" strokeWidth="1" />
            <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r="4" fill={color} stroke="var(--color-white, #fff)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="absolute -top-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold pointer-events-none whitespace-nowrap"
          style={{ left: `${(geo.x(hp.t) / W) * 100}%`, transform: `translateX(${geo.x(hp.t) > W / 2 ? '-105%' : '5%'})` }}>
          {hp.v}{unit} · {when(hp.t, range)}
        </div>
      )}
    </div>
  );
};

/** A plain-language read of the soil. */
const soilWords = (m: number | null) =>
  m === null ? '' : m < 20 ? 'Dry, time to water' : m < 35 ? 'Getting dry' : m < 70 ? 'Nicely damp' : 'Very wet';

const GardenCard: React.FC = () => {
  const moist = useEntity(MOISTURE);
  const temp = useEntity(TEMP);
  const battery = useEntity(BATTERY);
  const [range, setRange] = useState<Range>('24h');
  const m = num(moist?.state), t = num(temp?.state), b = num(battery?.state);
  // Re-read the history when a new reading arrives.
  const mHist = useHistory(MOISTURE, range, moist?.last_updated);
  const tHist = useHistory(TEMP, range, temp?.last_updated);

  if (!moist && !temp) return null;
  const offline = moist?.state === 'unavailable' && temp?.state === 'unavailable';

  return (
    <Panel
      title="Vege garden"
      action={
        <div className="flex rounded-xl bg-slate-100 p-0.5" role="group" aria-label="Chart range">
          {(['24h', '7d'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
              className={`h-8 px-3 rounded-lg text-sm font-semibold ${range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {r === '24h' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
      }
    >
      {offline ? (
        <p className="text-slate-500">The garden sensor hasn't checked in. It may be asleep or need new batteries.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-600 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />Soil moisture</p>
              <p className="text-sm text-slate-500">{soilWords(m)}</p>
            </div>
            <p className="font-display text-4xl text-slate-900 mt-1 tabular-nums">{m === null ? '–' : `${Math.round(m)}%`}</p>
            <div className="mt-2"><MiniChart points={mHist} color={BLUE} unit="%" range={range} label="Soil moisture" fixedMax={100} /></div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CLAY }} />Temperature</p>
            <p className="font-display text-4xl text-slate-900 mt-1 tabular-nums">{t === null ? '–' : `${t.toFixed(1)}°`}</p>
            <div className="mt-2"><MiniChart points={tHist} color={CLAY} unit="°" range={range} label="Garden temperature" /></div>
          </div>
          {b !== null && b < 20 && <p className="text-sm font-semibold text-orange-700">Sensor battery is low ({Math.round(b)}%).</p>}
        </div>
      )}
    </Panel>
  );
};

export default GardenCard;
