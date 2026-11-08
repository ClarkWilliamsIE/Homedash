// components/home/photos.tsx
// Family photos: a card on the home screen, a full-screen viewer, the kitchen iPad's photo
// frame (when nobody's using it), and the Settings section for adding and removing photos.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarEvent, WeeklyPlan } from '../../types';
import { callService, useEntities, useEntity } from '../../lib/hass';
import { useSettings } from '../../lib/settings';
import { useTimers } from '../../lib/timers';
import { useWeather } from '../../lib/useWeather';
import {
  Photo, TV_AUTO, TV_SCRIPT, TV_STOP, addPhotos, makeTvCopies, photoCaption, photoUrl, refreshPhotos, removePhoto, shuffled, usePhotos,
} from '../../lib/photos';
import { Panel } from '../ui';
import { Card, Switch } from './controls';
import { HomeIcons } from './icons';
import { inNightWindow } from './NightMode';
import { eventsOn, eventTime } from '../../lib/calendar';
import { binInfo } from '../BinNotifier';
import { HOME } from '../../home.config';

// --- Building blocks ----------------------------------------------------------------------

/** Loads the photos the first time something needs them, then every 10 minutes. */
const usePhotoList = () => {
  const s = usePhotos();
  useEffect(() => {
    refreshPhotos();
    const t = setInterval(() => refreshPhotos(), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return s;
};

/** One photo, fetched from Home Assistant, faded in when ready. */
export const PhotoImg: React.FC<{ photo?: Photo; thumb?: boolean; fit?: 'cover' | 'contain'; className?: string }> = ({ photo, thumb, fit = 'cover', className = '' }) => {
  const [src, setSrc] = useState<string>();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    setShown(false);
    if (!photo) { setSrc(undefined); return; }
    photoUrl(thumb && photo.thumbId ? photo.thumbId : photo.id).then(u => { if (live) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [photo?.id, thumb]);
  return src ? (
    <img src={src} alt="" draggable={false} onLoad={() => setShown(true)}
      // When a photo is cropped to fit, keep the top (heads) and lose the bottom.
      style={fit === 'cover' ? { objectPosition: '50% 20%' } : undefined}
      className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'} ${className}`} />
  ) : null;
};

/** Steps through the photos in a random order, warming up the next one in the background. */
const useSlideshow = (photos: Photo[] | null, seconds: number, paused = false) => {
  const [order, setOrder] = useState<Photo[]>([]);
  const [i, setI] = useState(0);
  const key = photos?.map(p => p.id).join('|') || '';
  useEffect(() => { setOrder(shuffled(photos || [])); setI(0); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paused || order.length < 2) return;
    const t = setInterval(() => setI(n => (n + 1) % order.length), seconds * 1000);
    return () => clearInterval(t);
  }, [order, seconds, paused]);
  const next = order.length ? order[(i + 1) % order.length] : undefined;
  useEffect(() => { if (next) photoUrl(next.id).then(u => { const img = new Image(); img.src = u; }).catch(() => {}); }, [next?.id]);
  return {
    photo: order.length ? order[i % order.length] : undefined,
    step: (d: number) => setI(n => (n + d + order.length) % Math.max(order.length, 1)),
  };
};

/** Two stacked images that cross-fade as the slideshow moves on. */
const Crossfade: React.FC<{ photo?: Photo; fit?: 'cover' | 'contain' }> = ({ photo, fit }) => {
  const [layers, setLayers] = useState<{ a?: Photo; b?: Photo; top: 'a' | 'b' }>({ a: photo, top: 'a' });
  useEffect(() => {
    setLayers(l => {
      const current = l.top === 'a' ? l.a : l.b;
      if (current?.id === photo?.id) return l;
      return l.top === 'a' ? { ...l, b: photo, top: 'b' } : { ...l, a: photo, top: 'a' };
    });
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${layers.top === 'a' ? 'opacity-100' : 'opacity-0'}`}><PhotoImg photo={layers.a} fit={fit} /></div>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${layers.top === 'b' ? 'opacity-100' : 'opacity-0'}`}><PhotoImg photo={layers.b} fit={fit} /></div>
    </>
  );
};

/** A button that opens the photo picker and adds what's chosen. */
export const AddPhotosButton: React.FC<{ className?: string; children?: React.ReactNode; onDone?: (msg: string) => void }> = ({ className = '', children, onDone }) => {
  const input = useRef<HTMLInputElement>(null);
  const { busy } = usePhotos();
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try {
      const { added, failed } = await addPhotos(files);
      onDone?.(failed.length
        ? `Added ${added}. ${failed.length} didn't work: ${failed[0]}`
        : `Added ${added} photo${added === 1 ? '' : 's'}`);
    } catch (err: any) {
      onDone?.(err?.message || 'Couldn\'t add the photos');
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={className}>
        {busy || children || 'Add photos'}
      </button>
    </>
  );
};

/** Show the photos on the TV now, or stop them. */
const useTv = () => {
  const script = useEntity(TV_SCRIPT);
  const auto = useEntity(TV_AUTO);
  return {
    available: !!script,
    showing: script?.state === 'on',
    auto: auto?.state === 'on',
    start: () => callService('script', 'turn_on', undefined, { entity_id: TV_SCRIPT }),
    stop: () => callService('script', 'turn_on', undefined, { entity_id: TV_STOP }),
    setAuto: (on: boolean) => callService('input_boolean', on ? 'turn_on' : 'turn_off', undefined, { entity_id: TV_AUTO }),
  };
};

// --- Full-screen viewer -------------------------------------------------------------------

export const PhotoViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { photos } = usePhotoList();
  const [paused, setPaused] = useState(false);
  const { photo, step } = useSlideshow(photos, 8, paused);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);
  return (
    <div className="fixed inset-0 z-[260] bg-black select-none"
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) { step(dx < 0 ? 1 : -1); setPaused(true); }
      }}>
      <Crossfade photo={photo} fit="contain" />
      <div className="absolute inset-x-0 top-0 p-4 pt-safe-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
        <p className="text-white/80 font-semibold">{photoCaption(photo)}</p>
        <button onClick={onClose} aria-label="Close photos" className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center"><HomeIcons.Close /></button>
      </div>
      <button aria-label="Previous photo" onClick={() => { step(-1); setPaused(true); }} className="absolute left-0 top-16 bottom-0 w-1/4" />
      <button aria-label="Next photo" onClick={() => { step(1); setPaused(true); }} className="absolute right-0 top-16 bottom-0 w-1/4" />
      {photos && !photos.length && <p className="absolute inset-0 flex items-center justify-center text-white/70">No photos yet.</p>}
    </div>
  );
};

// --- Home screen card ---------------------------------------------------------------------

export const PhotoCard: React.FC = () => {
  const { photos, error } = usePhotoList();
  const { photo } = useSlideshow(photos, 20);
  const [viewing, setViewing] = useState(false);
  const [msg, setMsg] = useState('');
  const tv = useTv();
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(t); }, [msg]);

  const addBtn = 'h-9 px-3 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-60';
  return (
    <Panel title="Family photos" action={<AddPhotosButton className={addBtn} onDone={setMsg}><HomeIcons.Plus className="w-4 h-4" /> Add</AddPhotosButton>} className="h-full">
      {photos && photos.length ? (
        <>
          <button onClick={() => setViewing(true)} aria-label="Open the photos full screen" className="relative block w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100">
            <Crossfade photo={photo} />
            {photoCaption(photo) && <span className="absolute left-3 bottom-3 px-2.5 py-1 rounded-lg bg-black/45 text-white text-sm font-semibold">{photoCaption(photo)}</span>}
          </button>
          {tv.available && (
            <div className="flex items-center gap-2 mt-3">
              <button onClick={tv.showing ? tv.stop : tv.start}
                className={`flex-1 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${tv.showing ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                <HomeIcons.Tv className="w-4 h-4" /> {tv.showing ? 'Stop photos on the TV' : 'Show on the TV'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="aspect-[4/3] rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-6">
          <HomeIcons.Image className="w-8 h-8 text-slate-300" />
          <p className="font-semibold text-slate-700 mt-2">{photos === null && !error ? 'Loading photos…' : 'No family photos yet'}</p>
          <p className="text-sm text-slate-500 mt-1">{error || 'Add some from your phone. They\'re kept on the home server and show here, on the iPad when it\'s idle, and on the TV.'}</p>
          {!error && photos && <AddPhotosButton onDone={setMsg} className="mt-3 h-10 px-4 rounded-xl bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60" />}
        </div>
      )}
      {msg && <p className="text-sm font-semibold text-slate-600 mt-2">{msg}</p>}
      {viewing && <PhotoViewer onClose={() => setViewing(false)} />}
    </Panel>
  );
};

// --- Kitchen iPad photo frame -------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** After a few idle minutes in the daytime, the kitchen iPad shows the photos with the time,
 *  weather and tonight's dinner. Any touch brings the dashboard back. */
export const PhotoFrame: React.FC<{ weeklyPlan: WeeklyPlan; events?: CalendarEvent[]; shoppingLeft?: number }> = ({ weeklyPlan, events = [], shoppingLeft = 0 }) => {
  const { frame, night } = useSettings();
  const { photos } = usePhotoList();
  const timers = useTimers();
  const weather = useWeather();
  const music = useEntities([HOME.music.group, ...HOME.music.speakers.map(s => s.entity)]);
  const soil = useEntity('sensor.garden_soil_moisture');
  const [lastTouch, setLastTouch] = useState(Date.now());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const wake = () => setLastTouch(Date.now());
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, wake, opts));
    const tick = setInterval(() => setNow(new Date()), 15 * 1000);
    return () => { ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.removeEventListener(ev, wake, opts)); clearInterval(tick); };
  }, []);

  const idle = now.getTime() - lastTouch >= frame.idleMinutes * 60 * 1000;
  const nightTime = night.enabled && inNightWindow(now, night.start, night.end);
  const timerRunning = timers.some(t => t.done || t.endsAt);
  const active = frame.enabled && idle && !nightTime && !timerRunning && !!photos?.length;
  const { photo } = useSlideshow(active ? photos : null, 15, !active);

  // The tap that wakes the iPad must only close the photos. Without this, the tap's click lands
  // on whatever is underneath (a light, a play button) once the photos have gone.
  const [shield, setShield] = useState(false);
  const wasActive = useRef(false);
  useLayoutEffect(() => {
    if (wasActive.current && !active) {
      setShield(true);
      const block = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
      const evs = ['click', 'pointerup', 'mouseup', 'touchend'];
      evs.forEach(ev => window.addEventListener(ev, block, { capture: true }));
      const t = setTimeout(() => {
        evs.forEach(ev => window.removeEventListener(ev, block, { capture: true }));
        setShield(false);
      }, 700);
      wasActive.current = active;
      return () => { clearTimeout(t); evs.forEach(ev => window.removeEventListener(ev, block, { capture: true })); setShield(false); };
    }
    wasActive.current = active;
  }, [active]);

  if (!active) return shield ? <div className="fixed inset-0 z-[290]" aria-hidden="true" /> : null;

  const dinner = weeklyPlan[DAYS[now.getDay()]]?.[0];
  // The next thing on the calendar: later today, else tomorrow.
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const later = eventsOn(events, now).filter(e => e.start.dateTime && new Date(e.start.dateTime) > now);
  const next = later[0] || eventsOn(events, tomorrow)[0];
  const nextWhen = next ? `${later[0] ? '' : 'Tomorrow '}${eventTime(next)}`.replace('Tomorrow All day', 'Tomorrow') : '';
  const playing = music.find(m => m?.state === 'playing' && m.attributes.media_title);
  const time = now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m$/i, '');

  // One quiet line per item: a soft label, then the thing itself.
  // One quiet line per item, most useful first. Lines only appear when they matter right now,
  // and there are never more than five, so the photo stays the main thing.
  const rows: { label: string; text: string; warm?: boolean }[] = [];
  if (weather) {
    // In the evening, tomorrow's weather is the useful one.
    rows.push(now.getHours() >= 16
      ? { label: 'Tomorrow', text: `${weather.tomorrow.condition}, ${weather.tomorrow.low}–${weather.tomorrow.high}°` }
      : { label: `${weather.temp}°`, text: `${weather.condition}, high ${weather.high}°` });
  }
  if (next) rows.push({ label: nextWhen, text: next.summary });
  const later2 = later[1];
  if (later2) rows.push({ label: eventTime(later2), text: later2.summary });
  if (dinner) rows.push({ label: 'Dinner', text: dinner.name });
  const bins = (() => {
    let offset = 0;
    try { offset = parseInt(localStorage.getItem('kapiti_bin_offset') || '0', 10) || 0; } catch { /* private mode */ }
    return binInfo(offset, now);
  })();
  if (bins.tonight) rows.push({ label: 'Bins', text: `Out tonight: rubbish and ${bins.kind}`, warm: true });
  const moist = soil ? parseFloat(soil.state) : NaN;
  if (Number.isFinite(moist) && moist > 0 && moist < 25) rows.push({ label: 'Garden', text: `Needs water (soil ${Math.round(moist)}%)`, warm: true });
  if (playing) rows.push({ label: 'Playing', text: `${playing.attributes.media_title}${playing.attributes.media_artist ? ` · ${playing.attributes.media_artist}` : ''}` });
  if (shoppingLeft > 0) rows.push({ label: 'Shopping', text: `${shoppingLeft} to get` });
  const shown = rows.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[290] bg-black cursor-pointer select-none" onPointerDown={() => setLastTouch(Date.now())}>
      <Crossfade photo={photo} />
      {photoCaption(photo) && (
        <p className="absolute top-6 left-8 text-sm font-medium text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,.5)]">{photoCaption(photo)}</p>
      )}
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/60 via-black/25 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 px-10 pb-9 flex items-end justify-between gap-10 text-white [text-shadow:0_1px_8px_rgba(0,0,0,.35)]">
        <div>
          <p className="text-[6.5rem] font-light tabular-nums leading-[0.9] tracking-tight">{time}</p>
          <p className="text-lg text-white/80 mt-3">{now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {shown.length > 0 && (
          <ul className="max-w-[46%] space-y-1.5 pb-1">
            {shown.map(r => (
              <li key={r.label + r.text} className="flex items-baseline justify-end gap-3 text-right">
                <span className={`text-sm whitespace-nowrap shrink-0 ${r.warm ? 'text-amber-200' : 'text-white/60'}`}>{r.label}</span>
                <span className="text-lg truncate">{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// --- Settings -----------------------------------------------------------------------------

export const PhotoSettings: React.FC<{ onChangeFrame: (patch: Partial<{ enabled: boolean; idleMinutes: number }>) => void }> = ({ onChangeFrame }) => {
  const { photos, error, busy } = usePhotoList();
  const { frame } = useSettings();
  const tv = useTv();
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? photos || [] : (photos || []).slice(0, 24);

  return (
    <Card
      title="Family photos"
      action={<AddPhotosButton onDone={setMsg} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"><HomeIcons.Plus className="w-4 h-4" /> Add photos</AddPhotosButton>}
    >
      <p className="text-sm text-slate-500 mb-4">
        Kept on the home server. Big photos are shrunk as they're added, so they don't fill it up.
        {photos ? ` ${photos.length} photo${photos.length === 1 ? '' : 's'}.` : ''}
      </p>
      {(error || msg) && <p className={`text-sm font-semibold mb-3 ${error ? 'text-rose-700' : 'text-slate-600'}`}>{error || msg}</p>}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex-1 min-w-[15rem]">
            <p className="font-bold text-slate-800">Photo frame on the kitchen iPad</p>
            <p className="text-sm font-semibold text-slate-500">When nobody's used it for a while, in the daytime. Night mode takes over at night.</p>
          </div>
          <select value={frame.idleMinutes} disabled={!frame.enabled} onChange={e => onChangeFrame({ idleMinutes: Number(e.target.value) })}
            className="h-11 bg-slate-100 rounded-xl px-3 font-semibold text-slate-800 outline-none disabled:opacity-40" aria-label="Minutes idle before the photo frame">
            {[2, 5, 10, 15, 30].map(m => <option key={m} value={m}>after {m} min</option>)}
          </select>
          <Switch tone="indigo" on={frame.enabled} onToggle={() => onChangeFrame({ enabled: !frame.enabled })} label="Photo frame on or off" />
        </div>
        {tv.available && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex-1 min-w-[15rem]">
              <p className="font-bold text-slate-800">Photos on the TV when it's idle</p>
              <p className="text-sm font-semibold text-slate-500">Instead of the Google TV screensaver. Picking up the remote stops them.</p>
            </div>
            <button onClick={tv.showing ? tv.stop : tv.start} className="h-11 px-4 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold flex items-center gap-2">
              <HomeIcons.Tv className="w-4 h-4" /> {tv.showing ? 'Stop now' : 'Show now'}
            </button>
            <Switch tone="indigo" on={tv.auto} onToggle={() => tv.setAuto(!tv.auto)} label="TV photos when idle on or off" />
          </div>
        )}
      </div>

      {tv.available && photos && photos.some(p => !p.tvName) && (
        <div className="mt-4 p-3 rounded-2xl bg-amber-50 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[14rem] text-sm font-semibold text-amber-900">
            {photos.filter(p => !p.tvName).length} photos aren't cropped to fit the TV yet, so they show with black bars.
          </p>
          <button disabled={!!busy} onClick={async () => {
            const r = await makeTvCopies().catch(e => { setMsg(e?.message || 'Couldn\'t do it'); return null; });
            if (r) setMsg(r.failed ? `Fitted ${r.made}. ${r.failed} didn't work.` : `Fitted ${r.made} photos to the TV`);
          }} className="h-10 px-4 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-60">
            {busy && busy.startsWith('Fitting') ? busy : 'Fit them to the TV'}
          </button>
        </div>
      )}

      {photos && photos.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-slate-700">The photos</p>
            <button onClick={() => setEditing(!editing)} className="text-sm font-semibold text-indigo-700">{editing ? 'Done' : 'Remove photos…'}</button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {shown.map(p => (
              <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                <PhotoImg photo={p} thumb />
                {editing && (
                  <button disabled={!!busy} onClick={() => removePhoto(p).catch(e => setMsg(e?.message || 'Couldn\'t remove it'))} aria-label={`Remove photo ${p.name}`}
                    className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-50">
                    <HomeIcons.Trash className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!showAll && photos.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-3 text-sm font-semibold text-indigo-700">Show all {photos.length}</button>
          )}
        </div>
      )}
    </Card>
  );
};
