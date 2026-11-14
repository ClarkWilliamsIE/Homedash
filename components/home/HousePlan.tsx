// components/home/HousePlan.tsx
// A live plan of the house. Rooms glow when their lights are on, speakers bounce when they're
// playing, the TV shows what's on, the kitchen sensor pulses when someone's there, and the vege
// garden shows its soil moisture. Tilt it for a 3D view; tap a room for its controls.

import React, { useState } from 'react';
import { HassEntity, useEntity } from '../../lib/hass';
import { PLAN, PLAN_H, PLAN_W, PlanRoom } from '../../lib/housePlan';
import { BrightnessStepper, Switch, toggleLight } from './controls';
import { HomeIcons } from './icons';
import { VolumeStepper, describeMedia, media } from './music';

const SURFACE: Record<NonNullable<PlanRoom['surface']>, string> = {
  carpet: '#efe8dc',
  tile: '#e4e7e3',
  concrete: '#dad5cd',
  deck: '#cbb08a',
  garden: '#c4d8b0',
};
const WALL = '#6f6152';
const OUTDOOR = (r: PlanRoom) => r.surface === 'deck' || r.surface === 'garden';

const num = (s?: string) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : null; };
const pct = (e?: HassEntity) => Math.round(((e?.attributes.brightness as number) ?? 0) / 2.55);

/** Everything the plan shows about one room. */
const useRoom = (r: PlanRoom) => {
  const light = useEntity(r.light || '');
  const sp = useEntity(r.speaker || '');
  const spd = useEntity(r.speakerDirect || '');
  const tv = useEntity(r.tv || '');
  const motion = useEntity(r.motion || '');
  const temp = useEntity(r.temperature || '');
  const hum = useEntity(r.humidity || '');
  const soil = useEntity(r.soil || '');
  const playingEntity = sp?.state === 'playing' ? sp : spd?.state === 'playing' ? spd : undefined;
  return {
    light, sp, spd, tv, motion, temp, hum, soil,
    lit: light?.state === 'on',
    level: light?.state === 'on' ? Math.max(0.25, pct(light) / 100) : 0,
    playing: !!playingEntity,
    playingEntity,
    tvOn: tv?.state === 'playing' || tv?.state === 'paused',
    someone: motion?.state === 'on',
  };
};

const Tile: React.FC<{ room: PlanRoom; tilt: boolean; selected: boolean; onSelect: () => void }> = ({ room: r, tilt, selected, onSelect }) => {
  const s = useRoom(r);
  const outdoor = OUTDOOR(r);
  const moisture = num(s.soil?.state);
  const layers = !tilt ? 0 : outdoor ? (r.surface === 'deck' ? 3 : 0) : 14;
  const wallColor = r.surface === 'deck' ? '#8b7355' : WALL;
  const temp = num(s.temp?.state);

  return (
    <div className="absolute" style={{
      left: `${(r.x / PLAN_W) * 100}%`, top: `${(r.y / PLAN_H) * 100}%`,
      width: `${(r.w / PLAN_W) * 100}%`, height: `${(r.h / PLAN_H) * 100}%`,
      transformStyle: 'preserve-3d',
    }}>
      {/* The floor, which is also the button */}
      <button onClick={onSelect} aria-pressed={selected}
        aria-label={`${r.name}${s.lit ? ', lights on' : ''}${s.playing ? ', music playing' : ''}`}
        className="absolute inset-0 overflow-hidden text-left transition-[box-shadow] duration-300"
        style={{
          background: SURFACE[r.surface || 'carpet'],
          border: tilt ? 'none' : `${outdoor ? 1 : 3}px solid ${outdoor ? 'rgba(111,97,82,0.35)' : WALL}`,
          boxShadow: selected ? 'inset 0 0 0 3px #2a5140' : undefined,
        }}>
        {r.stairs && (
          <span aria-hidden="true" className="absolute right-[8%] top-[10%] w-[30%] h-[80%] opacity-60"
            style={{ background: 'repeating-linear-gradient(0deg, #b8ab98 0 2px, transparent 2px 9px)' }} />
        )}
        {r.surface === 'deck' && (
          <span aria-hidden="true" className="absolute inset-0 opacity-50"
            style={{ background: 'repeating-linear-gradient(90deg, #a98f69 0 1px, transparent 1px 10px)' }} />
        )}
        {/* Lamplight: a warm pool, brighter with the brightness */}
        <span aria-hidden="true" className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: s.level, background: 'radial-gradient(ellipse at 50% 45%, rgba(255,196,84,0.95), rgba(255,214,140,0.55) 55%, rgba(255,226,170,0.25) 100%)' }} />
        {r.surface === 'garden' && moisture !== null && (
          <span aria-hidden="true" className="absolute left-0 bottom-0 top-0 transition-[width] duration-700"
            style={{ width: `${Math.min(100, moisture)}%`, background: 'rgba(47,111,163,0.18)' }} />
        )}

        <span className="relative flex flex-col gap-1 p-[6%] min-w-0">
          <span className={`font-semibold leading-tight truncate ${r.w >= 4 ? 'text-[13px] md:text-[15px]' : 'text-[11px] md:text-[13px]'} ${s.lit ? 'text-slate-950' : 'text-slate-700'}`}>{r.name}</span>
          <span className="flex flex-wrap gap-1">
            {s.lit && <Chip tone="amber"><HomeIcons.Bulb className="w-3.5 h-3.5" /></Chip>}
            {s.playing && <Chip tone="green"><HomeIcons.Music className="w-3.5 h-3.5 animate-bounce" /></Chip>}
            {s.tvOn && <Chip tone="dark"><HomeIcons.Tv className="w-3.5 h-3.5" /></Chip>}
            {s.someone && (
              <Chip tone="clay">
                <span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-70" /><span className="relative w-2.5 h-2.5 rounded-full bg-orange-600" /></span>
              </Chip>
            )}
            {r.surface === 'garden' && moisture !== null && <Chip tone="water">{Math.round(moisture)}%</Chip>}
            {r.id === 'kitchen' && temp !== null && <Chip tone="plain">{temp.toFixed(0)}°</Chip>}
          </span>
        </span>
      </button>

      {/* Walls: the room outline stacked upwards, which reads as walls when tilted */}
      {Array.from({ length: layers }, (_, i) => (
        <span key={i} aria-hidden="true" className="absolute inset-0 pointer-events-none"
          style={{ transform: `translateZ(${(i + 1) * 1.6}px)`, border: `2.5px solid ${i === layers - 1 ? '#5a4d40' : wallColor}` }} />
      ))}
      {s.lit && tilt && !outdoor && (
        <span aria-hidden="true" className="absolute inset-[18%] rounded-full pointer-events-none blur-xl transition-opacity duration-700"
          style={{ transform: 'translateZ(24px)', background: 'rgba(255,200,90,0.5)', opacity: s.level }} />
      )}
    </div>
  );
};

const CHIP = {
  amber: 'bg-amber-300 text-amber-950',
  green: 'bg-indigo-700 text-white',
  dark: 'bg-slate-900 text-white',
  clay: 'bg-white/90',
  water: 'bg-white/90 text-[#1f4f78] font-bold text-[11px]',
  plain: 'bg-white/80 text-slate-700 font-semibold text-[11px]',
};
const Chip: React.FC<{ tone: keyof typeof CHIP; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`h-6 min-w-6 px-1.5 rounded-full flex items-center justify-center ${CHIP[tone]}`}>{children}</span>
);

/** Controls and readings for the room you tapped. */
const RoomPanel: React.FC<{ room: PlanRoom }> = ({ room: r }) => {
  const s = useRoom(r);
  const info = s.playingEntity ? describeMedia(s.playingEntity) : {};
  const tvInfo = s.tvOn ? describeMedia(s.tv) : {};
  const volEntity = s.sp?.state === 'playing' || !s.spd ? s.sp : s.spd;
  const vol = Math.round(((volEntity?.attributes.volume_level as number) ?? 0) * 100);
  const temp = num(s.temp?.state), hum = num(s.hum?.state), moisture = num(s.soil?.state);
  const nothing = !r.light && !r.speaker && !r.tv && !r.motion && !r.temperature && !r.soil;

  return (
    <div className="space-y-4">
      <h3 className="font-display text-2xl text-slate-900">{r.name}</h3>

      {r.light && (
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <HomeIcons.Bulb className={`w-5 h-5 ${s.lit ? 'text-amber-500' : 'text-slate-400'}`} />
              <span className="font-semibold text-slate-800">Lights</span>
              <span className="text-sm text-slate-500">{s.light?.state === 'unavailable' ? 'Offline' : s.lit ? `${pct(s.light)}%` : 'Off'}</span>
            </div>
            <Switch on={s.lit} onToggle={() => toggleLight(r.light!)} label={`${r.name} lights`} />
          </div>
          {s.lit && <div className="mt-3 flex justify-end"><BrightnessStepper entityId={r.light} value={pct(s.light)} /></div>}
        </div>
      )}

      {r.speaker && (
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2.5">
            <HomeIcons.Music className={`w-5 h-5 ${s.playing ? 'text-indigo-700' : 'text-slate-400'}`} />
            <span className="font-semibold text-slate-800">Speaker</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 truncate">{s.playing ? [info.title, info.artist].filter(Boolean).join(' – ') || 'Playing' : 'Quiet'}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            {s.playing
              ? <button onClick={() => media('media_pause', s.playingEntity!.entity_id)} className="h-10 px-4 rounded-xl bg-white border border-slate-200 font-semibold text-slate-700 flex items-center gap-2"><HomeIcons.Pause className="w-4 h-4" />Pause</button>
              : <span />}
            {volEntity && <VolumeStepper value={vol} label={`${r.name} volume`} onSet={v => media('volume_set', volEntity.entity_id, { volume_level: v / 100 })} />}
          </div>
        </div>
      )}

      {r.tv && (
        <div className="rounded-2xl bg-slate-50 p-4 flex items-center gap-2.5">
          <HomeIcons.Tv className={`w-5 h-5 ${s.tvOn ? 'text-slate-900' : 'text-slate-400'}`} />
          <span className="font-semibold text-slate-800">TV</span>
          <span className="text-sm text-slate-600 truncate">{s.tvOn ? tvInfo.title || 'On' : 'Off'}</span>
        </div>
      )}

      {(r.motion || temp !== null || hum !== null || moisture !== null) && (
        <dl className="grid grid-cols-2 gap-3">
          {r.motion && <Stat label="Right now" value={s.someone ? 'Someone here' : 'Empty'} />}
          {temp !== null && <Stat label={r.soil ? 'Garden' : 'Temperature'} value={`${temp.toFixed(1)}°`} />}
          {hum !== null && <Stat label="Humidity" value={`${Math.round(hum)}%`} />}
          {moisture !== null && <Stat label="Soil moisture" value={`${Math.round(moisture)}%`} />}
        </dl>
      )}

      {nothing && <p className="text-slate-500">Nothing smart in here yet.</p>}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-3">
    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
    <dd className="font-display text-xl text-slate-900 mt-0.5">{value}</dd>
  </div>
);

const TILT_KEY = 'homedash_plan_tilt';

const HousePlan: React.FC = () => {
  const [floor, setFloor] = useState<0 | 1>(0);
  // 3D unless you've chosen flat; phones start flat since the tilted plan is small there.
  const [tilt, setTilt] = useState(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(TILT_KEY); } catch { /* ignore */ }
    return saved ? saved === '3d' : window.innerWidth >= 768;
  });
  const [selected, setSelected] = useState('kitchen');
  const rooms = PLAN.filter(r => r.floor === floor);
  const room = PLAN.find(r => r.id === selected && r.floor === floor) || rooms.find(r => r.light) || rooms[0];
  const chooseTilt = (t: boolean) => { setTilt(t); try { localStorage.setItem(TILT_KEY, t ? '3d' : 'flat'); } catch { /* ignore */ } };

  return (
    <section className="bg-white rounded-3xl border border-slate-200/70 shadow-sm p-5 md:p-6" aria-label="House plan">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h2 className="font-display text-2xl text-slate-900 mr-auto">The house</h2>
        <div className="flex rounded-xl bg-slate-100 p-0.5" role="group" aria-label="Floor">
          {(['Downstairs', 'Upstairs'] as const).map((label, i) => (
            <button key={label} onClick={() => setFloor(i as 0 | 1)} aria-pressed={floor === i}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${floor === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <div className="flex rounded-xl bg-slate-100 p-0.5" role="group" aria-label="View">
          {([['3D', true], ['Flat', false]] as const).map(([label, t]) => (
            <button key={label} onClick={() => chooseTilt(t)} aria-pressed={tilt === t}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${tilt === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <div className="relative w-full" style={{ aspectRatio: tilt ? `${PLAN_W} / ${PLAN_H * 0.82}` : `${PLAN_W} / ${PLAN_H}`, perspective: '1800px' }}>
          <div className="absolute inset-0 transition-transform duration-700 ease-out" style={{
            transformStyle: 'preserve-3d',
            transform: tilt ? 'translateY(-2%) rotateX(46deg) rotateZ(-16deg) scale(0.9)' : 'none',
          }}>
            {rooms.map(r => (
              <Tile key={r.id} room={r} tilt={tilt} selected={room?.id === r.id} onSelect={() => setSelected(r.id)} />
            ))}
          </div>
        </div>
        {room && <RoomPanel room={room} />}
      </div>
      <p className="text-xs text-slate-400 mt-4">Outline from the 1987 drain plan; rooms inside it are approximate.</p>
    </section>
  );
};

export default HousePlan;
