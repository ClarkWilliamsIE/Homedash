// components/home/music.tsx
import React from 'react';
import { HOME } from '../../home.config';
import { callService, hassAsset, runScript, useEntities, useEntity } from '../../lib/hass';
import { FillSlider, Switch } from './controls';
import { TONE_STYLES, useSettings } from '../../lib/settings';
import { HomeIcons } from './icons';

const media = (service: string, entityId: string, data?: Record<string, any>) =>
  callService('media_player', service, data, { entity_id: entityId });


const PLAYERS = [
  { entity: HOME.music.group, name: 'kitchen & family room' },
  ...HOME.music.speakers.map(s => ({ entity: s.entity, name: s.name.toLowerCase() })),
];

/** Album art, title and controls for whichever of our speakers is playing (the group first). */
export const NowPlaying: React.FC<{ large?: boolean }> = ({ large }) => {
  const states = useEntities(PLAYERS.map(p => p.entity));
  const groupMembers: string[] = states[0]?.attributes.group_members || [];
  const pick = (want: string) => PLAYERS.findIndex((p, i) => states[i]?.state === want && !(i > 0 && groupMembers.includes(p.entity) && states[0]?.state === want));
  let idx = pick('playing');
  if (idx < 0) idx = pick('paused');
  const current = idx >= 0 ? states[idx] : states[0];
  const where = idx >= 0 ? PLAYERS[idx] : PLAYERS[0];
  const playing = current?.state === 'playing';
  const active = playing || current?.state === 'paused';
  const art = hassAsset(current?.attributes.entity_picture);
  const title = active ? current?.attributes.media_title : undefined;
  const artist = active ? current?.attributes.media_artist : undefined;
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
          {playing ? `Playing in ${where.name}` : active ? `Paused in ${where.name}` : 'Nothing playing'}
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
  const { moods } = useSettings();
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
  const live = speakers.filter((s, i) => ['playing', 'paused'].includes(states[i]?.state || ''));
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

/** Every speaker with an on/off switch (in or out of the music) and its own volume.
 *  On joins it to whatever is playing; off takes it out (and stops it if it was playing on its own). */
export const SpeakerMixer: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const speakers = HOME.music.speakers;
  const group = useEntity(HOME.music.group);
  const states = useEntities(speakers.map(s => s.entity));
  const isOn = (i: number) => ['playing', 'paused'].includes(states[i]?.state || '');

  // What a speaker should join: the group if it's going, otherwise any speaker that's playing.
  const leader = () => {
    if (group && ['playing', 'paused'].includes(group.state)) return HOME.music.group;
    const i = speakers.findIndex((_, k) => states[k]?.state === 'playing');
    return i >= 0 ? speakers[i].entity : HOME.music.group;
  };

  const toggle = (i: number) => {
    const id = speakers[i].entity;
    if (isOn(i)) {
      callService('media_player', 'unjoin', undefined, { entity_id: id });
      if (!SYNC_GROUP_MEMBERS.includes(id) || !(group?.attributes.group_members || []).includes(id)) {
        callService('media_player', 'media_pause', undefined, { entity_id: id });
      }
    } else {
      const lead = leader();
      if (lead !== id) callService('media_player', 'join', { group_members: [id] }, { entity_id: lead });
    }
  };

  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {speakers.map((sp, i) => {
        const e = states[i];
        const offline = !e || e.state === 'unavailable';
        const on = isOn(i);
        const muted = !!e?.attributes.is_volume_muted;
        const vol = Math.round((e?.attributes.volume_level ?? 0) * 100);
        return (
          <li key={sp.entity} className={`flex items-center gap-3 ${compact ? '' : 'p-3 rounded-2xl bg-slate-50'} ${offline ? 'opacity-40' : ''}`}>
            <Switch on={on} tone="indigo" label={`${sp.name} on or off`} onToggle={() => { if (!offline) toggle(i); }} />
            <span className={`shrink-0 ${compact ? 'w-24 text-sm' : 'w-28'} font-semibold truncate ${on ? 'text-slate-900' : 'text-slate-500'}`}>{sp.name}</span>
            <FillSlider
              className={`${compact ? 'h-9' : 'h-10'} flex-1`}
              tone="indigo"
              disabled={offline}
              value={muted ? 0 : vol}
              onCommit={v => media('volume_set', sp.entity, { volume_level: v / 100 })}
              label=""
            />
            <span className="w-9 text-right text-sm tabular-nums text-slate-500">{muted ? 'Mute' : vol}</span>
          </li>
        );
      })}
    </ul>
  );
};
