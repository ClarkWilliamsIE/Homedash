// components/home/MusicStage.tsx
// The top of the Music page: a dark "stage" that takes its colour from the album playing.
// The cover is big, the song is in large type, and each room is a tile you tap to bring in or
// out of the music, with its own − and + volume.

import React, { useEffect, useState } from 'react';
import { HOME } from '../../home.config';
import { callService, hassAsset, useEntities, useEntity, HassEntity } from '../../lib/hass';
import { friendlyError, playSource, Source } from '../../lib/musicLibrary';
import { HomeIcons } from './icons';
import {
  MasterVolume, PLAYERS, SPEAKERS, ShuffleButton, VolumeStepper, describeMedia, inStream, media,
  playingOutsideMA, setOverride, setSpeakerIn, useMainPlayer, useOverrideVersion, useStreams,
} from './music';

const SOURCES = HOME.music.sources as unknown as Source[];
const LAST_KEY = 'homedash_source_speakers';

const lastSpeakers = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* ignore */ }
  return [SPEAKERS[0].entity];
};

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Where the song is up to, ticking along while it plays. */
const useProgress = (e?: HassEntity) => {
  const playing = e?.state === 'playing';
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);
  const a = e?.attributes || {};
  const dur = Number(a.media_duration) || 0;
  if (!dur || a.media_position == null) return null;
  const since = playing && a.media_position_updated_at ? (Date.now() - Date.parse(a.media_position_updated_at)) / 1000 : 0;
  const pos = Math.min(dur, Number(a.media_position) + Math.max(0, since));
  return { pos, dur };
};

/** Radio, playlist or podcast as chips; tap one to choose the speakers and play. */
const PutOn: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(lastSpeakers);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const src = SOURCES.find(s => s.name === open);

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const go = async () => {
    if (!src) return;
    const speakers = SPEAKERS.map(s => s.entity).filter(id => picked.includes(id));
    setBusy(true); setMsg(null);
    try {
      await playSource(src, speakers);
      try { localStorage.setItem(LAST_KEY, JSON.stringify(speakers)); } catch { /* ignore */ }
      setMsg({ text: `Playing ${src.name}` });
      setOpen(null);
    } catch (e) {
      setMsg({ text: friendlyError(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap md:justify-end gap-2">
        {SOURCES.map(s => {
          const on = open === s.name;
          return (
            <button key={s.name} aria-expanded={on} onClick={() => { setOpen(on ? null : s.name); setMsg(null); }}
              className={`h-10 px-4 rounded-full text-[15px] font-semibold border flex items-center gap-2 transition-colors ${on ? 'bg-white text-slate-950 border-white' : 'bg-white/10 text-white border-white/25 hover:bg-white/15'}`}>
              {s.mediaType === 'radio' ? <HomeIcons.Radio className="w-4 h-4" /> : <HomeIcons.Music className="w-4 h-4" />}
              {s.name}
            </button>
          );
        })}
      </div>
      {src && (
        <div className="absolute left-0 md:left-auto md:right-0 top-12 z-20 w-[22rem] max-w-[calc(100vw-2rem)] p-4 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl">
          <p className="text-sm font-semibold text-white/70 mb-2">Play {src.name} on</p>
          <div className="flex flex-wrap gap-2">
            {SPEAKERS.map(sp => {
              const on = picked.includes(sp.entity);
              return (
                <button key={sp.entity} aria-pressed={on} onClick={() => toggle(sp.entity)}
                  className={`h-10 px-4 rounded-full text-sm font-semibold border ${on ? 'bg-amber-200 border-amber-200 text-slate-950' : 'bg-transparent border-white/25 text-white/80'}`}>
                  {sp.name}
                </button>
              );
            })}
          </div>
          <button disabled={busy || !picked.length} onClick={go}
            className="mt-3 w-full h-11 rounded-xl bg-white text-slate-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            {busy ? <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : <HomeIcons.Play className="w-4 h-4" />}
            {busy ? 'Starting…' : `Play ${src.name}`}
          </button>
        </div>
      )}
      {msg && <p className={`mt-2 md:text-right text-sm font-semibold ${msg.error ? 'text-orange-300' : 'text-amber-200'}`}>{msg.text}</p>}
    </div>
  );
};

/** Each room as a tile: tap it to bring it into the music (or take it out), − and + for volume. */
const RoomTiles: React.FC = () => {
  useOverrideVersion();
  const group = useEntity(HOME.music.group);
  const states = useEntities(SPEAKERS.map(s => s.entity));
  const direct = useEntities(SPEAKERS.map(s => s.direct || ''));
  const streams = useStreams();
  const main = streams[0];
  const outside = (i: number) => playingOutsideMA(direct[i]) && states[i]?.state !== 'playing';

  const toggle = (i: number) => {
    const sp = SPEAKERS[i];
    const on = inStream(main, sp.entity);
    if (main) { setSpeakerIn(main, sp, !on, group); return; }
    setOverride(sp.entity, { on: true, stream: HOME.music.group, at: Date.now() });
    callService('media_player', 'join', { group_members: [sp.entity] }, { entity_id: HOME.music.group });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {SPEAKERS.map((sp, i) => {
        const e = states[i];
        const offline = !e || e.state === 'unavailable';
        const on = inStream(main, sp.entity);
        const cantJoin = !!main?.direct && !sp.direct;
        const elsewhere = !on && streams.slice(1).some(st => st.members.includes(sp.entity));
        const src = outside(i) ? direct[i] : e;
        const muted = !!src?.attributes.is_volume_muted;
        const vol = Math.round((src?.attributes.volume_level ?? 0) * 100);
        const note = offline ? 'Offline'
          : on ? (main ? 'In this music' : 'Ready')
          : elsewhere ? 'Playing something else'
          : cantJoin ? "Can't join this one"
          : main ? 'Tap to join' : 'Tap to wake';
        const disabled = offline || (cantJoin && !on);
        return (
          <div key={sp.entity}
            className={`flex items-center sm:block rounded-2xl border transition-colors ${on ? 'bg-white/[0.14] border-white/35' : 'bg-white/[0.04] border-white/10'} ${offline ? 'opacity-40' : ''}`}>
            <button onClick={() => { if (!disabled) toggle(i); }} disabled={disabled} aria-pressed={on}
              aria-label={`${sp.name}: ${on ? 'take out of the music' : 'add to the music'}`}
              className="flex-1 min-w-0 sm:w-full text-left px-3.5 py-3 sm:pb-2 disabled:cursor-default">
              <span className="flex items-center justify-between gap-2">
                <span className={`font-semibold truncate ${on ? 'text-white' : 'text-white/80'}`}>{sp.name}</span>
                <span aria-hidden="true" className={`w-3 h-3 rounded-full border-2 shrink-0 ${on ? 'bg-amber-200 border-amber-200' : 'border-white/40'}`} />
              </span>
              <span className="block text-[13px] text-white/60 truncate">{note}</span>
            </button>
            <div className="pr-3 sm:px-3 sm:pb-3 flex justify-center">
              <VolumeStepper dark big value={muted ? 0 : vol} disabled={offline} label={`${sp.name} volume`}
                onSet={v => media('volume_set', outside(i) ? sp.direct! : sp.entity, { volume_level: v / 100 })} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** The big now-playing block over a blurred copy of the album art. */
const MusicStage: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { states, idx } = useMainPlayer();
  const current = idx >= 0 ? states[idx] : states[0];
  const where = idx >= 0 ? PLAYERS[idx] : PLAYERS[0];
  const main = useStreams()[0];
  const whereRaw = main?.entity === where.entity ? main.name : where.name;
  const whereName = whereRaw.charAt(0).toUpperCase() + whereRaw.slice(1);
  const playing = current?.state === 'playing';
  const active = playing || current?.state === 'paused';
  const art = active ? hassAsset(current?.attributes.entity_picture) : undefined;
  const info = active ? describeMedia(current) : {};
  const album = active ? current?.attributes.media_album_name : undefined;
  const progress = useProgress(active ? current : undefined);
  const target = where.entity;
  const [artOk, setArtOk] = useState(true);
  useEffect(() => setArtOk(true), [art]);
  const showArt = !!art && artOk;

  const second = [info.artist, album && album !== info.title ? `from ${album}` : ''].filter(Boolean).join(', ');

  return (
    <section aria-label="Now playing" className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 text-white">
      {/* Backdrop: the cover, blurred right out, then darkened so the text reads */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {showArt
          ? <img key={art} src={art} alt="" className="absolute inset-0 w-full h-[34rem] object-cover scale-125 blur-3xl opacity-70 saturate-150" />
          : <div className="absolute inset-x-0 top-0 h-[30rem] bg-indigo-700 blur-3xl opacity-50 scale-110" />}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/70 via-55% to-slate-950 to-75%" />
      </div>

      <div className="p-6 lg:p-9 space-y-7">
        <div className="flex flex-col md:flex-row gap-6 lg:gap-10 md:items-end">
          <div className="w-56 h-56 lg:w-80 lg:h-80 shrink-0 rounded-xl overflow-hidden bg-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] flex items-center justify-center">
            {showArt
              ? <img src={art} alt="" className="w-full h-full object-cover" onError={() => setArtOk(false)} />
              : <HomeIcons.Music className="w-16 h-16 text-white/30" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5 lg:mb-8">
              <p className="pt-2 text-[15px] font-semibold text-amber-200 truncate">
                {playing ? `Playing in ${whereName}` : active ? `Paused in ${whereName}` : 'Nothing playing'}
              </p>
              <PutOn />
            </div>

            <h1 className="font-display text-4xl lg:text-[3.6rem] leading-[1.04] line-clamp-2 break-words">
              {info.title || 'Quiet in here'}
            </h1>
            <p className="mt-1.5 text-lg lg:text-[22px] text-white/80 truncate">
              {second || (active ? ' ' : 'Pick an album below, or put the radio on')}
            </p>

            {progress && (
              <div className="mt-5 flex items-center gap-3 text-[13px] text-white/70 tabular-nums">
                <span className="w-10">{clock(progress.pos)}</span>
                <div className="flex-1 h-1 rounded-full bg-white/20">
                  <div className="h-1 rounded-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${(progress.pos / progress.dur) * 100}%` }} />
                </div>
                <span className="w-10 text-right">{clock(progress.dur)}</span>
              </div>
            )}

            <div className={`${progress ? 'mt-3' : 'mt-6'} flex flex-wrap items-center gap-3`}>
              <ShuffleButton entityId={target} className="!w-12 !h-12 !text-white/75 hover:!bg-white/10 aria-pressed:!bg-white/15 aria-pressed:!text-amber-200" />
              <button aria-label="Previous" disabled={!active} onClick={() => media('media_previous_track', target)}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-30"><HomeIcons.Prev className="w-7 h-7" /></button>
              <button aria-label={playing ? 'Pause' : 'Play'} disabled={!active} onClick={() => media('media_play_pause', target)}
                className="w-[4.75rem] h-[4.75rem] rounded-full bg-white text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-30">
                {playing ? <HomeIcons.Pause className="w-8 h-8" /> : <HomeIcons.Play className="w-8 h-8 ml-1" />}
              </button>
              <button aria-label="Next" disabled={!active} onClick={() => media('media_next_track', target)}
                className="w-14 h-14 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-30"><HomeIcons.Next className="w-7 h-7" /></button>
              <div className="ml-auto rounded-full bg-white/10 p-1 pr-1.5 empty:hidden"><MasterVolume compact dark /></div>
            </div>
          </div>
        </div>

        <RoomTiles />

        {children}
      </div>
    </section>
  );
};

export default MusicStage;
