// lib/settings.ts
// Settings you can change from the Settings screen. They're saved in the family Google Sheet
// (with the meal plan), so every device sees the same ones. Music moods are also written to
// Home Assistant as scripts, so they work from anywhere in Home Assistant too.

import { useSyncExternalStore } from 'react';
import { HOME, Room } from '../home.config';
import { hassStore } from './hass';

export type Tone = 'orange' | 'amber' | 'rose' | 'emerald' | 'teal' | 'sky' | 'indigo' | 'violet' | 'slate';

export interface MoodMusic {
  /** 'if_idle': start only if nothing is playing · 'always': always switch to this · 'none': just set volumes */
  mode: 'if_idle' | 'always' | 'none';
  mediaId?: string;
  mediaType?: 'playlist' | 'radio' | 'album' | 'track' | 'artist' | 'podcast';
  label?: string;
  /** Play the playlist in random order. */
  shuffle?: boolean;
}

export interface Mood {
  /** Home Assistant script object id, e.g. "profile_cooking" → script.profile_cooking */
  id: string;
  name: string;
  hint: string;
  tone: Tone;
  /** 0–100 per speaker entity, or null for "off" */
  volumes: Record<string, number | null>;
  music: MoodMusic;
}

export interface CookingSettings {
  moodId: string | null;
  lights: string;
  brightness: number;
  kelvin: number;
}

export interface DinnerSettings {
  message: string;
  /** 0–100 announcement volume */
  volume: number;
  /** Lights that flash when dinner's called */
  flashLights: string[];
}

export interface TimerSettings {
  /** Speaker that announces finished timers ('' = chime on the screen only) */
  speaker: string;
}

export interface NightSettings {
  enabled: boolean;
  /** "21:30" style times */
  start: string;
  end: string;
  idleMinutes: number;
}

export interface FrameSettings {
  /** Turn the kitchen iPad into a photo frame when nobody's using it (daytime; night mode wins). */
  enabled: boolean;
  idleMinutes: number;
}

export interface HomeSettings {
  version: 1;
  moods: Mood[];
  /** Show the mood buttons on the home screen and Music page. */
  showMoods: boolean;
  rooms: Room[];
  cooking: CookingSettings;
  dinner: DinnerSettings;
  timers: TimerSettings;
  night: NightSettings;
  frame: FrameSettings;
  /** Google Calendar ids to show; null = the calendars ticked in Google Calendar itself */
  calendars: string[] | null;
}

const GOOD: MoodMusic = { mode: 'if_idle', mediaId: 'library://playlist/56', mediaType: 'playlist', label: 'Good' };
const [K, FR, ST, BR] = ['media_player.kitchen', 'media_player.family_room', 'media_player.living_room_3', 'media_player.bedroom'];

/** Matches the four mood scripts that were set up in Home Assistant. */
export const DEFAULT_SETTINGS: HomeSettings = {
  version: 1,
  moods: [
    { id: 'profile_cooking', name: 'Cooking', hint: 'Kitchen loud', tone: 'orange', volumes: { [K]: 55, [FR]: 20, [ST]: 20, [BR]: null }, music: GOOD },
    { id: 'profile_dinner', name: 'Dinner', hint: 'Soft, everywhere', tone: 'amber', volumes: { [K]: 15, [FR]: 25, [ST]: 25, [BR]: null }, music: GOOD },
    { id: 'profile_whole_house', name: 'Whole house', hint: 'Every speaker', tone: 'violet', volumes: { [K]: 40, [FR]: 40, [ST]: 40, [BR]: 30 }, music: GOOD },
    { id: 'profile_wind_down', name: 'Wind down', hint: 'Bedroom only', tone: 'indigo', volumes: { [K]: null, [FR]: null, [ST]: null, [BR]: 20 }, music: GOOD },
  ],
  showMoods: true,
  rooms: HOME.rooms,
  cooking: { moodId: 'profile_cooking', lights: HOME.cooking.lights, brightness: 100, kelvin: HOME.cooking.colorTempKelvin },
  dinner: { message: "Dinner's ready! Come and eat.", volume: 55, flashLights: ['light.kids_lights'] },
  timers: { speaker: 'media_player.kitchen' },
  night: { enabled: true, start: '21:30', end: '06:30', idleMinutes: 2 },
  frame: { enabled: true, idleMinutes: 5 },
  calendars: null,
};

/** Fill in anything missing (e.g. settings saved by an older version). */
export const withDefaults = (s?: Partial<HomeSettings> | null): HomeSettings => ({
  version: 1,
  moods: s?.moods?.length ? s.moods : DEFAULT_SETTINGS.moods,
  showMoods: s?.showMoods ?? true,
  rooms: s?.rooms?.length ? s.rooms : DEFAULT_SETTINGS.rooms,
  cooking: { ...DEFAULT_SETTINGS.cooking, ...(s?.cooking || {}) },
  dinner: { ...DEFAULT_SETTINGS.dinner, ...(s?.dinner || {}) },
  timers: { ...DEFAULT_SETTINGS.timers, ...(s?.timers || {}) },
  night: { ...DEFAULT_SETTINGS.night, ...(s?.night || {}) },
  frame: { ...DEFAULT_SETTINGS.frame, ...(s?.frame || {}) },
  calendars: s?.calendars ?? null,
});

// --- A small store so any screen can read the current settings ---
let current: HomeSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
export const settingsStore = {
  get: () => current,
  set: (s: HomeSettings) => { current = s; listeners.forEach(l => l()); },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useSettings = () => useSyncExternalStore(settingsStore.subscribe, settingsStore.get);

// --- Music moods → Home Assistant scripts ---

/** Speakers that are permanently part of the Kitchen & Family Room sync group. */
const GROUP_MEMBERS = [K, FR, ST];

export const TONE_STYLES: Record<Tone, string> = {
  // Earthy, kitchen-friendly colours (keys kept so saved moods still match).
  orange: 'from-orange-500 to-orange-600',
  amber: 'from-[#c99a3a] to-[#ad8128]',
  rose: 'from-[#b9645f] to-[#9c4e4a]',
  emerald: 'from-indigo-500 to-indigo-700',
  teal: 'from-[#4f8a86] to-[#3b6f6b]',
  sky: 'from-[#5b7fa3] to-[#466889]',
  indigo: 'from-indigo-700 to-indigo-900',
  violet: 'from-[#7a6493] to-[#5f4c76]',
  slate: 'from-slate-600 to-slate-800',
};

const step = (action: string, entityId: string | string[], data?: Record<string, any>) => ({
  action,
  target: { entity_id: entityId },
  ...(data ? { data } : {}),
  continue_on_error: true,
});

/** Builds the Home Assistant script that carries out a mood. */
export function moodToScript(mood: Mood) {
  const group = HOME.music.group;
  const speakers = Object.keys(mood.volumes);
  const on = speakers.filter(s => mood.volumes[s] !== null && mood.volumes[s] !== undefined);
  const off = speakers.filter(s => !on.includes(s));
  const extras = speakers.filter(s => !GROUP_MEMBERS.includes(s));
  const groupOn = on.filter(s => GROUP_MEMBERS.includes(s));

  const sequence: any[] = [];
  // 1. Volumes
  for (const s of on) sequence.push(step('media_player.volume_set', s, { volume_level: Math.round(mood.volumes[s]!) / 100 }));

  // 2. Who plays together
  let playTarget = group;
  if (groupOn.length) {
    for (const s of off) {
      sequence.push(step('media_player.unjoin', s));
      if (extras.includes(s)) sequence.push(step('media_player.media_pause', s));
    }
    const joiners = on.filter(s => s !== group);
    if (joiners.length) sequence.push(step('media_player.join', group, { group_members: joiners }));
  } else {
    sequence.push(step('media_player.media_pause', group));
    for (const s of extras) sequence.push(step('media_player.unjoin', s));
    playTarget = on[0] || group;
  }

  // 3. What plays
  const m = mood.music;
  if (m.mode !== 'none' && m.mediaId) {
    const play = [
      // Shuffle (or not) before loading the music, so the new queue starts in the right order.
      step('media_player.shuffle_set', playTarget, { shuffle: !!m.shuffle }),
      step('music_assistant.play_media', playTarget, { media_id: m.mediaId, media_type: m.mediaType || 'playlist', enqueue: 'replace' }),
    ];
    if (m.mode === 'always') sequence.push(...play);
    else sequence.push({
      if: [{ condition: 'template', value_template: `{{ not is_state('${playTarget}', 'playing') }}` }],
      then: play,
    });
  }

  return {
    alias: `Profile: ${mood.name}`,
    description: `${mood.hint}. Made in Homedash (Settings → Music moods); changes made here may be overwritten.`,
    icon: 'mdi:music-box-multiple',
    mode: 'restart',
    sequence,
  };
}

const requireHass = () => {
  const hass = hassStore.get();
  if (!hass) throw new Error('Not running inside Home Assistant');
  return hass;
};

export const isHassAdmin = () => !!hassStore.get()?.user?.is_admin;

export async function saveMoodScript(mood: Mood) {
  const hass = requireHass();
  await hass.callApi('POST', `config/script/config/${mood.id}`, moodToScript(mood));
}

export async function deleteMoodScript(id: string) {
  const hass = requireHass();
  await hass.callApi('DELETE', `config/script/config/${id}`);
}

export const newMoodId = (name: string) =>
  `profile_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'mood'}_${Date.now().toString(36).slice(-4)}`;

export interface MusicChoice { mediaId: string; mediaType: MoodMusic['mediaType']; label: string; group: string }

/** Playlists and radio stations from Music Assistant, for the "what plays" picker. */
export async function loadMusicChoices(): Promise<MusicChoice[]> {
  const hass = requireHass();
  const entries = await hass.callWS({ type: 'config_entries/get', domain: 'music_assistant' });
  const entryId = entries?.[0]?.entry_id;
  if (!entryId) return [];
  const fetchType = async (mediaType: 'playlist' | 'radio', group: string): Promise<MusicChoice[]> => {
    try {
      const r = await hass.callWS({
        type: 'execute_script',
        sequence: [
          { action: 'music_assistant.get_library', data: { config_entry_id: entryId, media_type: mediaType, limit: 200 }, response_variable: 'r' },
          { stop: 'done', response_variable: 'r' },
        ],
      });
      return (r?.response?.items || []).map((i: any) => ({ mediaId: i.uri, mediaType, label: i.name, group }));
    } catch { return []; }
  };
  const [playlists, radio] = await Promise.all([fetchType('playlist', 'Playlists'), fetchType('radio', 'Radio')]);
  return [...playlists, ...radio];
}
