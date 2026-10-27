// lib/musicLibrary.ts
// Browse and search Spotify (and anything else in Music Assistant) from Homedash.
// Uses Home Assistant's normal service calls, so it works on a non-admin login too.

import { HOME } from '../home.config';
import { hassStore } from './hass';

export type MediaKind = 'track' | 'album' | 'artist' | 'playlist' | 'radio';

export interface MediaItem {
  uri: string;
  name: string;
  kind: MediaKind;
  image?: string | null;
  subtitle?: string;
  /** artist names, for filtering an artist's songs/albums */
  artistNames?: string[];
}

let entryId: string | null = null;
const getEntryId = async () => {
  if (entryId) return entryId;
  const hass = hassStore.get();
  const entries = await hass?.callWS({ type: 'config_entries/get', domain: 'music_assistant' });
  entryId = entries?.[0]?.entry_id || null;
  return entryId;
};

const call = async (service: string, data: Record<string, any>) => {
  const hass = hassStore.get();
  const config_entry_id = await getEntryId();
  if (!hass || !config_entry_id) throw new Error('Music Assistant is not connected');
  const r = await hass.callWS({
    type: 'call_service',
    domain: 'music_assistant',
    service,
    service_data: { config_entry_id, ...data },
    return_response: true,
  });
  return r?.response;
};

const toItem = (i: any): MediaItem => {
  const artistNames = (i.artists || []).map((a: any) => a.name);
  return {
    uri: i.uri,
    name: i.name,
    kind: i.media_type,
    image: i.image || i.album?.image || null,
    subtitle: artistNames.join(', ') || undefined,
    artistNames,
  };
};

export async function search(query: string, limit = 8) {
  const r = await call('search', { name: query, media_type: ['track', 'album', 'artist', 'playlist', 'radio'], limit });
  return {
    tracks: (r?.tracks || []).map(toItem) as MediaItem[],
    artists: (r?.artists || []).map(toItem) as MediaItem[],
    albums: (r?.albums || []).map(toItem) as MediaItem[],
    playlists: (r?.playlists || []).map(toItem) as MediaItem[],
    radio: (r?.radio || []).map(toItem) as MediaItem[],
  };
}

/** An artist's songs and albums (from a search, filtered to that artist). */
export async function artistDetail(artist: MediaItem) {
  const r = await search(artist.name, 25);
  const byArtist = (i: MediaItem) => (i.artistNames || []).some(n => n.toLowerCase() === artist.name.toLowerCase());
  return { tracks: r.tracks.filter(byArtist).slice(0, 10), albums: r.albums.filter(byArtist) };
}

export async function library(kind: MediaKind, orderBy?: string, limit = 60): Promise<MediaItem[]> {
  const r = await call('get_library', { media_type: kind, limit, ...(orderBy ? { order_by: orderBy } : {}) });
  return (r?.items || []).map(toItem);
}

/** Speakers Homedash manages (Music Assistant players), group first. */
export const MANAGED_PLAYERS = [HOME.music.group, ...HOME.music.speakers.map(s => s.entity)];

/** Podcasts and radio don't use Spotify, so they can play alongside it. */
const notSpotify = (e: any) => /^(podcastfeed|https?:)/.test(String(e?.attributes?.media_content_id || ''));

export interface Source { name: string; mediaId: string; mediaType: string; spotify?: boolean; fallbackUrl?: boolean }

/**
 * Play a "Play something" choice on the speakers picked: the first one leads and the rest
 * join it. Anything else playing carries on, unless both are Spotify (one stream at a time).
 */
export async function playSource(src: Source, speakers: string[]) {
  const hass = hassStore.get();
  if (!hass) throw new Error('Not connected to Home Assistant');
  if (!speakers.length) throw new Error('Pick at least one speaker');
  const [lead, ...rest] = speakers;
  const call = (domain: string, service: string, data: any, entity_id: string | string[]) =>
    hass.callService(domain, service, data, { entity_id });
  // Take the speakers out of whatever they were part of first, so the new choice doesn't
  // replace the music in the rest of that group.
  await call('media_player', 'unjoin', undefined, speakers).catch(() => {});
  if (src.spotify) {
    const others = MANAGED_PLAYERS.filter(id => !speakers.includes(id) && hass.states[id]?.state === 'playing' && !notSpotify(hass.states[id]));
    if (others.length) await call('media_player', 'media_pause', undefined, others).catch(() => {});
  }
  try {
    await call('music_assistant', 'play_media', { media_id: src.mediaId, media_type: src.mediaType, enqueue: 'replace' }, lead);
  } catch (e) {
    if (!src.fallbackUrl) throw e;
    // Some streams Music Assistant won't take as a link; send them the ordinary way.
    await call('media_player', 'play_media', { media_content_id: src.mediaId, media_content_type: 'music' }, lead);
  }
  if (rest.length) {
    await new Promise(r => setTimeout(r, 1500));
    await call('media_player', 'join', { group_members: rest }, lead);
  }
}

/**
 * Play now (replace the queue) or add to the queue.
 * Spotify only allows one stream at a time, so any other of our speakers that's
 * playing is paused first. Errors are passed back so the screen can show them.
 */
export async function play(target: string, item: MediaItem, enqueue: 'replace' | 'add' = 'replace') {
  const hass = hassStore.get();
  if (!hass) throw new Error('Not connected to Home Assistant');
  if (enqueue === 'replace') {
    const groupMembers: string[] = hass.states[HOME.music.group]?.attributes.group_members || [];
    const sameStream = (id: string) =>
      id === target ||
      (target === HOME.music.group && groupMembers.includes(id)) ||
      (id === HOME.music.group && groupMembers.includes(target));
    // Only other Spotify music has to stop; kids' podcasts and radio can keep going.
    const others = MANAGED_PLAYERS.filter(id => !sameStream(id) && hass.states[id]?.state === 'playing' && !notSpotify(hass.states[id]));
    if (others.length) {
      await hass.callService('media_player', 'media_pause', undefined, { entity_id: others }).catch(() => {});
    }
  }
  await hass.callService('music_assistant', 'play_media', { media_id: item.uri, media_type: item.kind, enqueue }, { entity_id: target });
}

/** Turn a Home Assistant error into something readable. */
export const friendlyError = (e: any) => {
  const msg: string = e?.message || e?.error?.message || String(e || '');
  if (/simultaneous streams/i.test(msg)) return 'Spotify is already playing somewhere else (one stream at a time). Pause it there, then try again.';
  return msg.replace(/^Failed to perform the action [\w./]+\.\s*/, '') || 'Something went wrong';
};
