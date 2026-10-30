// components/home/photos.tsx
// Family photos: a card on the home screen, a full-screen viewer, the kitchen iPad's photo
// frame (when nobody's using it), and the Settings section for adding and removing photos.

import React, { useEffect, useRef, useState } from 'react';
import { WeeklyPlan } from '../../types';
import { callService, useEntity } from '../../lib/hass';
import { useSettings } from '../../lib/settings';
import { useTimers } from '../../lib/timers';
import { useWeather } from '../../lib/useWeather';
import {
  Photo, TV_AUTO, TV_SCRIPT, TV_STOP, addPhotos, photoCaption, photoUrl, refreshPhotos, removePhoto, shuffled, usePhotos,
} from '../../lib/photos';
import { Panel } from '../ui';
import { Card, Switch } from './controls';
import { HomeIcons } from './icons';
import { inNightWindow } from './NightMode';

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
export const PhotoFrame: React.FC<{ weeklyPlan: WeeklyPlan }> = ({ weeklyPlan }) => {
  const { frame, night } = useSettings();
  const { photos } = usePhotoList();
  const timers = useTimers();
  const weather = useWeather();
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
  if (!active) return null;

  const dinner = weeklyPlan[DAYS[now.getDay()]]?.[0];
  return (
    <div className="fixed inset-0 z-[290] bg-black cursor-pointer select-none" onPointerDown={() => setLastTouch(Date.now())}>
      <Crossfade photo={photo} />
      <div className="absolute inset-x-0 bottom-0 p-10 pt-32 bg-gradient-to-t from-black/70 via-black/30 to-transparent text-white flex items-end justify-between gap-8">
        <div>
          <p className="text-7xl font-semibold tabular-nums leading-none">
            {now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m$/i, '')}
          </p>
          <p className="text-xl font-semibold text-white/85 mt-3">
            {now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            {weather && <span> · {weather.temp}° {weather.condition.toLowerCase()}</span>}
          </p>
        </div>
        <div className="text-right">
          {dinner && <p className="text-xl font-semibold"><span className="text-white/70">Tonight</span> · {dinner.name}</p>}
          {photoCaption(photo) && <p className="text-white/70 font-semibold mt-1">{photoCaption(photo)}</p>}
        </div>
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
