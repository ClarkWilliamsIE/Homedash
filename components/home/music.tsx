// components/home/music.tsx
import React from 'react';
import { HOME } from '../../home.config';
import { callService, hassAsset, runScript, useEntity } from '../../lib/hass';
import { FillSlider } from './controls';
import { TONE_STYLES, useSettings } from '../../lib/settings';
import { HomeIcons } from './icons';

const media = (service: string, entityId: string, data?: Record<string, any>) =>
  callService('media_player', service, data, { entity_id: entityId });


/** Album art, title and transport controls for the kitchen & family room group. */
export const NowPlaying: React.FC<{ large?: boolean }> = ({ large }) => {
  const group = useEntity(HOME.music.group);
  const playing = group?.state === 'playing';
  const active = playing || group?.state === 'paused';
  const art = hassAsset(group?.attributes.entity_picture);
  const title = active ? group?.attributes.media_title : undefined;
  const artist = active ? group?.attributes.media_artist : undefined;
  const vol = Math.round((group?.attributes.volume_level ?? 0) * 100);
  const size = large ? 'w-40 h-40 rounded-3xl' : 'w-20 h-20 rounded-2xl';

  return (
    <div className={large ? 'flex gap-8 items-center' : 'flex gap-4 items-center'}>
      <div className={`${size} shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center`}>
        {art && active ? <img src={art} alt="" className="w-full h-full object-cover" /> : <HomeIcons.Music className={large ? 'w-12 h-12 text-slate-300' : 'w-8 h-8 text-slate-300'} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
          {playing ? 'Playing in kitchen & family room' : active ? 'Paused' : 'Nothing playing'}
        </p>
        <p className={`${large ? 'text-3xl' : 'text-lg'} font-black text-slate-900 truncate leading-tight`}>{title || 'Pick a mood below'}</p>
        <p className={`${large ? 'text-lg' : 'text-sm'} font-semibold text-slate-500 truncate`}>{artist || ' '}</p>
        <div className={`flex items-center ${large ? 'gap-3 mt-4' : 'gap-2 mt-2'}`}>
          <button aria-label="Previous" disabled={!active} onClick={() => media('media_previous_track', HOME.music.group)} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><HomeIcons.Prev className="w-5 h-5" /></button>
          <button aria-label={playing ? 'Pause' : 'Play'} disabled={!active} onClick={() => media('media_play_pause', HOME.music.group)} className={`${large ? 'w-14 h-14' : 'w-11 h-11'} rounded-full flex items-center justify-center bg-slate-900 text-white shadow-lg disabled:opacity-30`}>
            {playing ? <HomeIcons.Pause className="w-5 h-5" /> : <HomeIcons.Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button aria-label="Next" disabled={!active} onClick={() => media('media_next_track', HOME.music.group)} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><HomeIcons.Next className="w-5 h-5" /></button>
          {large && active && (
            <FillSlider className="h-10 flex-1 ml-4" tone="indigo" value={vol} onCommit={v => media('volume_set', HOME.music.group, { volume_level: v / 100 })} label="Group volume" />
          )}
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
          className={`text-left rounded-2xl bg-gradient-to-br ${TONE_STYLES[m.tone] || TONE_STYLES.indigo} text-white shadow-lg active:scale-[0.97] transition-transform ${large ? 'p-5' : 'px-3.5 py-3'}`}
        >
          <span className={`block font-black truncate ${large ? 'text-xl' : 'text-sm'}`}>{m.name}</span>
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
