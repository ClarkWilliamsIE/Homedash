// lib/musicLibrary.ts
// Browse and search Spotify (and anything else in Music Assistant) from Homedash.
// Uses Home Assistant's normal service calls, so it works on a non-admin login too.

import { callService, hassStore } from './hass';

export type MediaKind = 'track' | 'album' | 'artist' | 'playlist' | 'radio';

export interface MediaItem {
  uri: string;
  name: string;
  kind: MediaKind;
  image?: string | null;
  subtitle?: string;
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

const toItem = (i: any): MediaItem => ({
  uri: i.uri,
  name: i.name,
  kind: i.media_type,
  image: i.image || i.album?.image || null,
  subtitle: (i.artists || []).map((a: any) => a.name).join(', ') || undefined,
});

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

export async function library(kind: MediaKind, orderBy?: string, limit = 60): Promise<MediaItem[]> {
  const r = await call('get_library', { media_type: kind, limit, ...(orderBy ? { order_by: orderBy } : {}) });
  return (r?.items || []).map(toItem);
}

/** Play now (replace the queue) or add to the end of the queue. */
export const play = (target: string, item: MediaItem, enqueue: 'replace' | 'add' = 'replace') =>
  callService('music_assistant', 'play_media', { media_id: item.uri, media_type: item.kind, enqueue }, { entity_id: target });
