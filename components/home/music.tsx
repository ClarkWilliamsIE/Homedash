// components/home/music.tsx
import React from 'react';
import { HOME } from '../../home.config';
import { callService, hassAsset, runScript, useEntities, useEntity, HassEntity } from '../../lib/hass';
import { FillSlider, Switch } from './controls';
import { TONE_STYLES, useSettings } from '../../lib/settings';
import { HomeIcons } from './icons';

const media = (service: string, entityId: string, data?: Record<string, any>) =>
  callService('media_player', service, data, { entity_id: entityId });


type Speaker = { entity: string; name: string; direct?: string };
const SPEAKERS = HOME.music.speakers as Speaker[];

/** Music Assistant's players first, then each speaker's own Sonos entity (only counted when
 *  something outside Music Assistant is playing on it, like RNZ from the Sonos app). */
const PLAYERS: { entity: string; name: string; directFor?: string }[] = [
  { entity: HOME.music.group, name: 'kitchen & family room' },
  ...SPEAKERS.map(s => ({ entity: s.entity, name: s.name.toLowerCase() })),
  ...SPEAKERS.filter(s => s.direct).map(s => ({ entity: s.direct!, name: s.name.toLowerCase(), directFor: s.entity })),
];

const active = (e?: HassEntity) => !!e && (e.state === 'playing' || e.state === 'paused');

/** Playing on the Sonos itself, not streamed to it by Music Assistant. */
export const playingOutsideMA = (e?: HassEntity) => {
  if (!active(e)) return false;
  const id = String(e!.attributes.media_content_id || '');
  return e!.attributes.source !== 'AirPlay' && !/airplay:|:8097\//.test(id);
};

const STATIONS: [RegExp, string][] = [
  [/radionz.*national/i, 'RNZ National'],
  [/radionz.*concert/i, 'RNZ Concert'],
  [/radionz/i, 'RNZ'],
];

/** Title and second line for what's playing; radio streams often come with neither. */
export const describeMedia = (e?: HassEntity): { title?: string; artist?: string } => {
  if (!e) return {};
  const a = e.attributes;
  const title = a.media_title && !/^ZPSTR_|^https?:\/\//.test(a.media_title) ? a.media_title : undefined;
  const id = `${a.media_content_id || ''} ${a.media_title || ''}`;
  const station = a.media_channel || STATIONS.find(([re]) => re.test(id))?.[1];
  if (title) return { title, artist: a.media_artist || (station !== title ? station : undefined) };
  if (station) return { title: station, artist: 'Radio' };
  if (/radio|x-sonosapi-stream|x-rincon-mp3radio/i.test(id)) return { title: 'Radio', artist: a.source };
  return { title: a.source, artist: a.media_artist };
};

/** Album art, title and controls for whichever of our speakers is playing (the group first). */
/** Which player the big "Now playing" shows: the group first, then any speaker that's playing. */
const useMainPlayer = () => {
  const raw = useEntities(PLAYERS.map(p => p.entity));
  // A Sonos entity only counts when it's playing something of its own and Music Assistant
  // isn't already playing on that speaker.
  const states = raw.map((e, i) => {
    const forMa = PLAYERS[i].directFor;
    if (!forMa) return e;
    const ma = raw[PLAYERS.findIndex(p => p.entity === forMa)];
    return playingOutsideMA(e) && ma?.state !== 'playing' ? e : undefined;
  });
  const groupMembers: string[] = states[0]?.attributes.group_members || [];
  const pick = (want: string) => PLAYERS.findIndex((p, i) => states[i]?.state === want && !(i > 0 && groupMembers.includes(p.entity) && states[0]?.state === want));
  let idx = pick('playing');
  if (idx < 0) idx = pick('paused');
  // Every active player, playing before paused, in priority order.
  const order = [
    ...PLAYERS.map((_, i) => i).filter(i => states[i]?.state === 'playing'),
    ...PLAYERS.map((_, i) => i).filter(i => states[i]?.state === 'paused'),
  ];
  return { states, idx, groupMembers, order };
};

export const NowPlaying: React.FC<{ large?: boolean }> = ({ large }) => {
  const { states, idx } = useMainPlayer();
  const current = idx >= 0 ? states[idx] : states[0];
  const where = idx >= 0 ? PLAYERS[idx] : PLAYERS[0];
  const main = useStreams()[0];
  const whereName = main?.entity === where.entity ? main.name : where.name;
  const playing = current?.state === 'playing';
  const active = playing || current?.state === 'paused';
  const art = hassAsset(current?.attributes.entity_picture);
  const info = active ? describeMedia(current) : {};
  const title = info.title;
  const artist = info.artist;
  const vol = Math.round((current?.attributes.volume_level ?? 0) * 100);
  const size = large ? 'w-40 h-40 rounded-3xl' : 'w-20 h-20 rounded-2xl';
  const target = where.entity;

  return (
    <div className={large ? 'flex gap-8 items-center' : 'flex gap-4 items-center'}>
      <div className={`${size} shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center`}>
        {art && active ? <img src={art} alt="" className="w-full h-full object-cover" /> : <HomeIcons.Music className={large ? 'w-12 h-12 text-slate-300' : 'w-8 h-8 text-slate-300'} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-500 mb-0.5 truncate">
          {playing ? `Playing in ${whereName}` : active ? `Paused in ${whereName}` : 'Nothing playing'}
        </p>
        <p className={`${large ? 'font-display text-3xl' : 'text-lg font-semibold'} text-slate-900 truncate leading-tight`}>{title || 'Pick a mood below'}</p>
        <p className={`${large ? 'text-lg' : 'text-sm'} font-semibold text-slate-500 truncate`}>{artist || '\u00a0'}</p>
        <div className={`flex items-center ${large ? 'gap-3 mt-4' : 'gap-2 mt-2'}`}>
          <button aria-label="Previous" disabled={!active} onClick={() => media('media_previous_track', target)} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><HomeIcons.Prev className="w-5 h-5" /></button>
          <button aria-label={playing ? 'Pause' : 'Play'} disabled={!active} onClick={() => media('media_play_pause', target)} className={`${large ? 'w-14 h-14' : 'w-11 h-11'} rounded-full flex items-center justify-center bg-indigo-700 text-white shadow-sm disabled:opacity-30`}>
            {playing ? <HomeIcons.Pause className="w-5 h-5" /> : <HomeIcons.Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button aria-label="Next" disabled={!active} onClick={() => media('media_next_track', target)} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><HomeIcons.Next className="w-5 h-5" /></button>
          <ShuffleButton entityId={target} />
          {large && <div className="flex-1 ml-4 min-w-0"><MasterVolume /></div>}
        </div>
      </div>
    </div>
  );
};

/** The listening profiles (Cooking, Dinner…) as big buttons. */
export const ProfileGrid: React.FC<{ large?: boolean }> = ({ large }) => {
  const { moods, showMoods } = useSettings();
  if (!showMoods) return null;
  return (
    <div className={`grid ${large ? 'grid-cols-2 lg:grid-cols-4 gap-4' : 'grid-cols-2 gap-2.5'}`}>
      {moods.map(m => (
        <button
          key={m.id}
          onClick={() => runScript(`script.${m.id}`)}
          className={`text-left rounded-2xl bg-gradient-to-br ${TONE_STYLES[m.tone] || TONE_STYLES.indigo} text-white shadow-sm active:scale-[0.97] transition-transform ${large ? 'p-5' : 'px-3.5 py-3'}`}
        >
          <span className={`block font-semibold truncate ${large ? 'text-xl' : 'text-sm'}`}>{m.name}</span>
          <span className={`block font-semibold text-white/80 truncate ${large ? 'text-sm' : 'text-[11px]'}`}>{m.hint}</span>
        </button>
      ))}
    </div>
  );
};

/** One speaker: status, play/pause and its own volume. */
export const SpeakerRow: React.FC<{ entityId: string; name: string }> = ({ entityId, name }) => {
  const e = useEntity(entityId);
  const playing = e?.state === 'playing';
  const muted = !!e?.attributes.is_volume_muted;
  const vol = Math.round((e?.attributes.volume_level ?? 0) * 100);
  const offline = !e || e.state === 'unavailable';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-50 ${offline ? 'opacity-50' : ''}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${playing ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
        <HomeIcons.Speaker className="w-5 h-5" />
      </span>
      <div className="w-28 shrink-0">
        <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
        <p className="text-[11px] font-semibold text-slate-400 capitalize">{offline ? 'Offline' : e!.state}</p>
      </div>
      <FillSlider className="h-10 flex-1" tone="indigo" disabled={offline} value={muted ? 0 : vol} onCommit={v => media('volume_set', entityId, { volume_level: v / 100 })} />
      <button aria-label={muted ? 'Unmute' : 'Mute'} disabled={offline} onClick={() => media('volume_mute', entityId, { is_volume_muted: !muted })} className={`w-10 h-10 rounded-xl flex items-center justify-center ${muted ? 'bg-rose-100 text-rose-600' : 'text-slate-400 hover:bg-white'}`}>
        {muted ? <HomeIcons.Mute className="w-5 h-5" /> : <HomeIcons.Volume className="w-5 h-5" />}
      </button>
    </div>
  );
};

/** One slider for every speaker that's playing. It keeps the mood's balance (kitchen louder than
 *  the stereo, say) and turns them all up or down together. */
export const MasterVolume: React.FC = () => {
  const speakers = HOME.music.speakers;
  const states = useEntities(speakers.map(s => s.entity));
  // Only the speakers playing the main music (not, say, Lilly's story in another room).
  const main = useStreams()[0];
  const live = main && !main.direct ? speakers.filter(s => main.members.includes(s.entity)) : [];
  const targets = (live.length ? live : speakers.filter((s, i) => states[i] && states[i]!.state !== 'unavailable'));
  const vols = targets.map(t => states[speakers.indexOf(t)]?.attributes.volume_level ?? 0);
  const top = Math.max(0, ...vols);
  const allMuted = targets.length > 0 && targets.every(t => !!states[speakers.indexOf(t)]?.attributes.is_volume_muted);

  const setAll = (pct: number) => {
    const v = pct / 100;
    targets.forEach((t, i) => {
      const level = top > 0.005 ? Math.min(1, (vols[i] / top) * v) : v;
      media('volume_set', t.entity, { volume_level: Math.round(level * 100) / 100 });
    });
  };

  if (!targets.length) return null;
  return (
    <div className="flex items-center gap-2">
      <FillSlider
        className="h-11 flex-1"
        tone="indigo"
        value={allMuted ? 0 : Math.round(top * 100)}
        onCommit={setAll}
        label="Master volume"
      />
      <button
        aria-label={allMuted ? 'Unmute all' : 'Mute all'}
        onClick={() => targets.forEach(t => media('volume_mute', t.entity, { is_volume_muted: !allMuted }))}
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${allMuted ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {allMuted ? <HomeIcons.Mute className="w-5 h-5" /> : <HomeIcons.Volume className="w-5 h-5" />}
      </button>
    </div>
  );
};

/** Turn shuffle on or off for whatever is playing. */
export const ShuffleButton: React.FC<{ entityId: string; className?: string }> = ({ entityId, className = '' }) => {
  const e = useEntity(entityId);
  const on = !!e?.attributes.shuffle;
  const active = e?.state === 'playing' || e?.state === 'paused';
  return (
    <button
      aria-label={on ? 'Shuffle on' : 'Shuffle off'}
      aria-pressed={on}
      disabled={!active}
      onClick={() => media('shuffle_set', entityId, { shuffle: !on })}
      className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 ${on ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'} ${className}`}
    >
      <HomeIcons.Shuffle className="w-5 h-5" />
    </button>
  );
};

const SYNC_GROUP_MEMBERS = ['media_player.kitchen', 'media_player.family_room', 'media_player.living_room_3'];

// --- What's playing where -------------------------------------------------------------------

/** One thing playing (or paused) and the speakers it's on. */
export interface Stream {
  /** The player that controls it: the sync group, a lead speaker, or a Sonos entity. */
  entity: string;
  state: HassEntity;
  /** Our speakers (Music Assistant entities) that are part of it. */
  members: string[];
  /** Started outside Music Assistant (the Sonos app); only Sonos speakers can join. */
  direct: boolean;
  name: string;
}

const speakerName = (entity: string) => SPEAKERS.find(s => s.entity === entity)?.name.toLowerCase() || '';
const listNames = (ids: string[]) => {
  const n = ids.map(speakerName).filter(Boolean);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
};

/** Everything playing in the house, the main music first. */
export const useStreams = (): Stream[] => {
  const { states, order } = useMainPlayer();
  const covered = new Set<string>();
  const out: Stream[] = [];
  for (const i of order) {
    const p = PLAYERS[i];
    const e = states[i]!;
    const grp: string[] = e.attributes.group_members || [];
    let members: string[];
    if (p.directFor) {
      members = [p.directFor, ...SPEAKERS.filter(s => s.direct && s.entity !== p.directFor && grp.includes(s.direct)).map(s => s.entity)];
    } else if (p.entity === HOME.music.group) {
      members = SPEAKERS.map(s => s.entity).filter(id => grp.includes(id));
    } else {
      members = [p.entity, ...SPEAKERS.map(s => s.entity).filter(id => id !== p.entity && grp.includes(id))];
    }
    if (p.entity !== HOME.music.group && covered.has(members[0])) continue;
    members = members.filter(m => !covered.has(m));
    if (!members.length && p.entity !== HOME.music.group) continue;
    members.forEach(m => covered.add(m));
    out.push({ entity: p.entity, state: e, members, direct: !!p.directFor, name: listNames(members) || p.name });
  }
  return out;
};

// Switches show the change straight away; speakers can take a while to report it (a paused
// speaker only goes idle after a minute or so).
type Override = { on: boolean; stream: string; at: number };
const overrides = new Map<string, Override>();
const overrideListeners = new Set<() => void>();
let overrideVersion = 0;
const setOverride = (speaker: string, o: Override) => {
  overrides.set(speaker, o); overrideVersion++; overrideListeners.forEach(l => l());
  setTimeout(() => { if (overrides.get(speaker) === o) { overrides.delete(speaker); overrideVersion++; overrideListeners.forEach(l => l()); } }, o.on ? 12000 : 90000);
};
const useOverrideVersion = () => React.useSyncExternalStore(
  l => { overrideListeners.add(l); return () => { overrideListeners.delete(l); }; },
  () => overrideVersion,
);

/** Is this speaker part of this stream, counting a switch flicked a moment ago. */
const inStream = (stream: Stream | undefined, speaker: string) => {
  const o = overrides.get(speaker);
  if (o && stream) return o.stream === stream.entity ? o.on : (o.on ? false : stream.members.includes(speaker));
  return !!stream && stream.members.includes(speaker);
};

/** Add a speaker to, or take it out of, something that's playing. */
const setSpeakerIn = (stream: Stream, sp: Speaker, on: boolean, group?: HassEntity) => {
  setOverride(sp.entity, { on, stream: stream.entity, at: Date.now() });
  if (stream.direct) {
    if (!sp.direct) return;
    if (on) callService('media_player', 'join', { group_members: [sp.direct] }, { entity_id: stream.entity });
    else if (sp.direct === stream.entity) media('media_pause', stream.entity);
    else callService('media_player', 'unjoin', undefined, { entity_id: sp.direct });
    return;
  }
  const id = sp.entity;
  if (on) {
    if (id === stream.entity) return;
    // A speaker already in another group has to leave it before it can join this one.
    const elsewhere = (group?.attributes.group_members || []).includes(id) && stream.entity !== HOME.music.group;
    Promise.resolve(elsewhere ? callService('media_player', 'unjoin', undefined, { entity_id: id }) : null)
      .catch(() => {})
      .then(() => new Promise(r => setTimeout(r, elsewhere ? 600 : 0)))
      .then(() => callService('media_player', 'join', { group_members: [id] }, { entity_id: stream.entity }));
    return;
  }
  if (id === stream.entity) { media('media_pause', id); return; }
  callService('media_player', 'unjoin', undefined, { entity_id: id });
  if (!SYNC_GROUP_MEMBERS.includes(id) || !(group?.attributes.group_members || []).includes(id)) media('media_pause', id);
};

/** Every speaker with an on/off switch (in or out of the main music) and its own volume. */
export const SpeakerMixer: React.FC<{ compact?: boolean }> = ({ compact }) => {
  useOverrideVersion();
  const speakers = SPEAKERS;
  const group = useEntity(HOME.music.group);
  const states = useEntities(speakers.map(s => s.entity));
  const direct = useEntities(speakers.map(s => s.direct || ''));
  const streams = useStreams();
  const main = streams[0];
  const outside = (i: number) => playingOutsideMA(direct[i]) && states[i]?.state !== 'playing';

  const toggle = (i: number) => {
    const sp = speakers[i];
    const on = inStream(main, sp.entity);
    if (main) { setSpeakerIn(main, sp, !on, group); return; }
    // Nothing playing: wake the speaker into the usual group.
    setOverride(sp.entity, { on: true, stream: HOME.music.group, at: Date.now() });
    callService('media_player', 'join', { group_members: [sp.entity] }, { entity_id: HOME.music.group });
  };

  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {speakers.map((sp, i) => {
        const e = states[i];
        const offline = !e || e.state === 'unavailable';
        const on = inStream(main, sp.entity);
        const cantJoin = !!main?.direct && !sp.direct;
        const src = outside(i) ? direct[i] : e;
        const muted = !!src?.attributes.is_volume_muted;
        const vol = Math.round((src?.attributes.volume_level ?? 0) * 100);
        return (
          <li key={sp.entity} className={`flex items-center gap-3 ${compact ? '' : 'p-3 rounded-2xl bg-slate-50'} ${offline ? 'opacity-40' : ''}`}>
            <span className={cantJoin && !on ? 'opacity-40' : ''}>
              <Switch on={on} tone="indigo" label={`${sp.name} on or off`} onToggle={() => { if (!offline && !(cantJoin && !on)) toggle(i); }} />
            </span>
            <span className={`shrink-0 ${compact ? 'w-24 text-sm' : 'w-28'} font-semibold truncate ${on ? 'text-slate-900' : 'text-slate-500'}`}>{sp.name}</span>
            <FillSlider
              className={`${compact ? 'h-9' : 'h-10'} flex-1`}
              tone="indigo"
              disabled={offline}
              value={muted ? 0 : vol}
              onCommit={v => media('volume_set', outside(i) ? sp.direct! : sp.entity, { volume_level: v / 100 })}
              label=""
            />
            <span className="w-9 text-right text-sm tabular-nums text-slate-500">{muted ? 'Mute' : vol}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** Tap a speaker to add it to (or take it out of) one particular stream. */
const StreamSpeakers: React.FC<{ stream: Stream }> = ({ stream }) => {
  useOverrideVersion();
  const group = useEntity(HOME.music.group);
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {SPEAKERS.filter(sp => !stream.direct || sp.direct).map(sp => {
        const on = inStream(stream, sp.entity);
        return (
          <button key={sp.entity} aria-pressed={on} onClick={() => setSpeakerIn(stream, sp, !on, group)}
            className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
            {sp.name}
          </button>
        );
      })}
    </div>
  );
};

/** Things playing besides the main "Now playing" (Lilly's story in the family room while the
 *  kitchen has music, say), each with its own speaker buttons. Shows nothing otherwise. */
export const AlsoPlaying: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const streams = useStreams();
  const others = streams.slice(1);
  if (!others.length) return null;
  return (
    <div className={compact ? 'mt-4 pt-4 border-t border-slate-100' : ''}>
      <p className={`font-semibold text-slate-700 ${compact ? 'text-sm mb-2' : 'mb-3'}`}>Also playing</p>
      <ul className="space-y-2">
        {others.map(st => {
          const e = st.state;
          const playing = e.state === 'playing';
          const art = hassAsset(e.attributes.entity_picture);
          const info = describeMedia(e);
          return (
            <li key={st.entity} className="p-2 rounded-2xl bg-slate-50">
              <div className="flex items-center gap-3">
                <span className={`${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-xl overflow-hidden bg-slate-200 flex items-center justify-center shrink-0`}>
                  {art ? <img src={art} alt="" className="w-full h-full object-cover" /> : <HomeIcons.Music className="w-5 h-5 text-slate-400" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-500 truncate">{playing ? 'Playing' : 'Paused'} in {st.name}</span>
                  <span className="block font-semibold text-slate-900 truncate">{info.title || 'Something'}</span>
                  {!compact && info.artist && <span className="block text-sm text-slate-500 truncate">{info.artist}</span>}
                </span>
                <button aria-label={playing ? `Pause ${st.name}` : `Play ${st.name}`} onClick={() => media('media_play_pause', st.entity)}
                  className="w-10 h-10 rounded-full bg-indigo-700 text-white flex items-center justify-center shrink-0">
                  {playing ? <HomeIcons.Pause className="w-4 h-4" /> : <HomeIcons.Play className="w-4 h-4 ml-0.5" />}
                </button>
              </div>
              <StreamSpeakers stream={st} />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
