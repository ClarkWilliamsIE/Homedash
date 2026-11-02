// lib/tv.ts
// TV shows from Jellyfin, through Home Assistant: browse the library, play an episode on the
// living room TV (Chromecast), and keep track of what's been watched and where you got to.
// Progress is kept in the family's synced state, so every device shows the same ticks.

import { useSyncExternalStore } from 'react';
import { hassStore } from './hass';

export const TV = 'media_player.living_room_tv';
export const TV_REMOTE = 'media_player.living_room_tv_2';
const ROOT = 'media-source://jellyfin';

export interface MediaNode {
  id: string;
  title: string;
  kind: string; // tv_show, season (tv_show), episode, movie, directory
  playable: boolean;
  thumb?: string;
}

export interface TvProgress {
  /** Jellyfin item id */
  id: string;
  title: string;
  show?: string;
  season?: string;
  episode?: number;
  thumb?: string;
  /** Seconds watched, and the full length */
  pos: number;
  dur: number;
  done: boolean;
  /** When this was last updated (ms) */
  at: number;
}

const itemId = (mediaId: string) => mediaId.replace(`${ROOT}/`, '');

// --- Library ------------------------------------------------------------------------------
const cache = new Map<string, { at: number; nodes: MediaNode[] }>();

export async function browse(id = ROOT): Promise<MediaNode[]> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.nodes;
  const hass = hassStore.get();
  if (!hass) throw new Error('TV needs Home Assistant. Connect to home and try again.');
  const res = await hass.callWS({ type: 'media_source/browse_media', media_content_id: id });
  const nodes: MediaNode[] = (res.children || []).map((c: any) => ({
    id: c.media_content_id,
    title: c.title,
    kind: c.media_class,
    playable: !!c.can_play,
    thumb: c.thumbnail || undefined,
  }));
  cache.set(id, { at: Date.now(), nodes });
  return nodes;
}

/** Every show and film across the Jellyfin libraries. */
export async function allTitles(): Promise<MediaNode[]> {
  const libs = await browse();
  const lists = await Promise.all(libs.map(l => (l.playable ? Promise.resolve([l]) : browse(l.id))));
  return lists.flat().sort((a, b) => a.title.localeCompare(b.title));
}

export const refreshLibrary = () => cache.clear();

// --- Watched / where you got to ------------------------------------------------------------
// The list lives in App (so it syncs with the meal plan etc.); this mirrors it for components.
let progress: TvProgress[] = [];
let setProgress: ((fn: (p: TvProgress[]) => TvProgress[]) => void) | null = null;
const listeners = new Set<() => void>();
export const bindTvProgress = (value: TvProgress[], set: typeof setProgress) => {
  setProgress = set;
  if (value !== progress) { progress = value; listeners.forEach(l => l()); }
};
export const useTvProgress = () =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => progress);

export const upsertProgress = (p: Partial<TvProgress> & { id: string }) => {
  setProgress?.(list => {
    const old = list.find(x => x.id === p.id);
    const next: TvProgress = { title: '', pos: 0, dur: 0, done: false, ...old, ...p, at: Date.now() } as TvProgress;
    return [next, ...list.filter(x => x.id !== p.id)].slice(0, 300);
  });
};

export const setWatched = (node: MediaNode, meta: Partial<TvProgress>, done: boolean) =>
  upsertProgress({ id: itemId(node.id), title: node.title, thumb: node.thumb, ...meta, done, pos: 0 });

export const progressFor = (list: TvProgress[], node: MediaNode) => list.find(p => p.id === itemId(node.id));

/** Started but not finished, most recent first. */
export const continueWatching = (list: TvProgress[]) =>
  list.filter(p => !p.done && p.pos > 60 && p.dur > 0 && p.pos < p.dur * 0.92).sort((a, b) => b.at - a.at);

// --- Playing on the TV ---------------------------------------------------------------------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The Jellyfin item playing on the TV right now, if any. */
export const playingItemId = (attrs: Record<string, any> | undefined) => {
  const m = String(attrs?.media_content_id || '').match(/\/(?:Videos|Items)\/([0-9a-f]{32})\//i);
  return m ? m[1] : undefined;
};

/** Live position: Home Assistant only updates it now and then, so add the time since. */
export const livePosition = (attrs: Record<string, any> | undefined, state?: string) => {
  const pos = Number(attrs?.media_position || 0);
  if (state !== 'playing' || !attrs?.media_position_updated_at) return pos;
  return pos + Math.max(0, (Date.now() - new Date(attrs.media_position_updated_at).getTime()) / 1000);
};

export async function playOnTv(node: MediaNode, meta: Partial<TvProgress>, opts: { resumeAt?: number } = {}) {
  const hass = hassStore.get();
  if (!hass) throw new Error('TV needs Home Assistant. Connect to home and try again.');
  const call = (domain: string, service: string, data?: any, entity_id?: string) =>
    hass.callService(domain, service, data, entity_id ? { entity_id } : undefined);
  // Photos off, TV on.
  if (hass.states['script.tv_photos']?.state === 'on') await call('script', 'turn_off', undefined, 'script.tv_photos').catch(() => {});
  if (hass.states[TV_REMOTE]?.state === 'off') {
    await call('media_player', 'turn_on', undefined, TV_REMOTE).catch(() => {});
    await sleep(4000);
  }
  upsertProgress({ id: itemId(node.id), title: node.title, thumb: node.thumb, ...meta });
  await call('media_player', 'play_media', { media_content_id: node.id, media_content_type: 'video' }, TV);
  const resumeAt = opts.resumeAt || 0;
  if (resumeAt > 30) {
    // The TV takes a few seconds to load the file; jump once it's playing.
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      if (hassStore.get()?.states[TV]?.state === 'playing') {
        await call('media_player', 'media_seek', { seek_position: Math.max(0, resumeAt - 5) }, TV).catch(() => {});
        break;
      }
    }
  }
}

export const tvControl = (service: 'media_play_pause' | 'media_stop', ) =>
  hassStore.get()?.callService('media_player', service, undefined, { entity_id: TV });

export const tvSeekBy = (seconds: number) => {
  const h = hassStore.get();
  const s = h?.states[TV];
  if (!h || !s) return;
  const to = Math.max(0, livePosition(s.attributes, s.state) + seconds);
  return h.callService('media_player', 'media_seek', { seek_position: to }, { entity_id: TV });
};

/** Record how far through the TV is, every so often while a Jellyfin episode plays.
 *  Returns a stop function. Run it on any device; they all write the same numbers. */
export function startTvTracker(): () => void {
  let lastSaved = 0;
  let lastId: string | undefined;
  let lastPos = 0;
  let lastDur = 0;
  const tick = () => {
    const s = hassStore.get()?.states[TV];
    const id = playingItemId(s?.attributes);
    if (id && s && (s.state === 'playing' || s.state === 'paused')) {
      const dur = Number(s.attributes.media_duration || 0);
      const pos = livePosition(s.attributes, s.state);
      lastId = id; lastPos = pos; lastDur = dur;
      if (Date.now() - lastSaved > 30000 && dur > 0) {
        lastSaved = Date.now();
        upsertProgress({ id, pos: Math.round(pos), dur: Math.round(dur), done: pos >= dur * 0.92, ...(s.attributes.media_title && !progress.find(p => p.id === id)?.title ? { title: s.attributes.media_title } : {}) });
      }
    } else if (lastId) {
      // Just stopped or finished: save where it got to.
      if (lastDur > 0) upsertProgress({ id: lastId, pos: Math.round(lastPos), dur: Math.round(lastDur), done: lastPos >= lastDur * 0.92 });
      lastId = undefined;
    }
  };
  const t = setInterval(tick, 5000);
  return () => clearInterval(t);
}

export const fmtMins = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
