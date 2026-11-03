// lib/tv.ts
// TV shows from Jellyfin, through Home Assistant: browse the library, play an episode or film on
// the living room TV (in the Jellyfin app, or the Chromecast as a fallback), and keep track of
// what's been watched and where you got to.
// Progress is kept in the family's synced state, so every device shows the same ticks.

import { useSyncExternalStore } from 'react';
import { hassStore } from './hass';

/** The TV's Chromecast (used only when the Jellyfin app can't be reached). */
export const CAST_TV = 'media_player.living_room_tv';
/** The TV itself (Google TV remote): turns it on and opens apps. */
export const TV_REMOTE = 'media_player.living_room_tv_2';
/** Pin the Jellyfin app's media player here if the automatic pick gets it wrong,
 *  e.g. 'media_player.living_room_tv_jellyfin'. Leave empty to find it automatically. */
const JELLYFIN_TV_OVERRIDE = '';
const JELLYFIN_APP = 'org.jellyfin.androidtv';
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

// --- Pictures -------------------------------------------------------------------------------
// Jellyfin's own address often isn't reachable from a computer or phone (and is plain http), so
// inside Home Assistant the posters are fetched through Home Assistant's add-on link instead.
let ingress: { base: string; until: number } | null = null;
let ingressLoading: Promise<string | null> | null = null;

async function jellyfinIngress(): Promise<string | null> {
  const hass = hassStore.get();
  if (!hass || hass.remote) return null; // only works on Home Assistant's own page
  if (ingress && ingress.until > Date.now()) return ingress.base;
  if (ingressLoading) return ingressLoading;
  ingressLoading = (async () => {
    try {
      const sup = (endpoint: string, method = 'get') => hass.callWS({ type: 'supervisor/api', endpoint, method });
      const addons = (await sup('/addons')).addons || [];
      const jf = addons.find((a: any) => /jellyfin/i.test(a.slug) && a.state === 'started');
      if (!jf) return null;
      const info = await sup(`/addons/${jf.slug}/info`);
      const session = await sup('/ingress/session', 'post');
      document.cookie = `ingress_session=${session.session};path=/api/hassio_ingress/;SameSite=Strict`;
      ingress = { base: info.ingress_url, until: Date.now() + 10 * 60 * 1000 };
      return ingress.base;
    } catch {
      return null;
    } finally {
      ingressLoading = null;
    }
  })();
  return ingressLoading;
}

/** A picture address the page can actually load. */
export async function pictureUrl(thumb?: string): Promise<string | undefined> {
  if (!thumb) return undefined;
  const base = await jellyfinIngress();
  if (!base) return thumb;
  try { const u = new URL(thumb); return `${base}${u.pathname.slice(1)}${u.search}`; } catch { return thumb; }
}

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
// Films and episodes play in the Jellyfin app on the TV: it plays every file (the Chromecast
// can't play the surround sound most films have) and buffers far less. Home Assistant's Jellyfin
// integration gives the app a media player while it's open; if it isn't open, Homedash opens it
// with the TV's remote and waits for it. The Chromecast is only the fallback.
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let jfPlayers: string[] = [];
let jfLoadedAt = 0;
const jfListeners = new Set<() => void>();

/** Every Jellyfin media player Home Assistant knows (one per device that has used Jellyfin). */
export async function loadJellyfinPlayers(force = false): Promise<string[]> {
  const hass = hassStore.get();
  if (!hass || (!force && Date.now() - jfLoadedAt < 60_000)) return jfPlayers;
  jfLoadedAt = Date.now();
  try {
    const r = await hass.callWS({ type: 'entity_registry/list_for_display' });
    const list: string[] = (r?.entities || [])
      .filter((e: any) => e.pl === 'jellyfin' && String(e.ei).startsWith('media_player.'))
      .map((e: any) => e.ei);
    if (list.join() !== jfPlayers.join()) { jfPlayers = list; jfListeners.forEach(l => l()); }
  } catch { /* keep what we had */ }
  return jfPlayers;
}

export const useJellyfinPlayers = () =>
  useSyncExternalStore((l: () => void) => { jfListeners.add(l); return () => { jfListeners.delete(l); }; }, () => jfPlayers);

const isTvLike = (text: string) => /\btv\b|android|google|shield|bravia|chromecast|living|lounge|family/i.test(text);
const isBrowserOrPhone = (text: string) => /\bweb\b|\bchrome\b|firefox|safari|edge|opera|iphone|ipad|\bmac|windows|linux/i.test(text);

/** The Jellyfin app on the TV, if Home Assistant can see it, and whether it's open right now. */
export function jellyfinTv(): { id: string; ready: boolean } | null {
  const states = hassStore.get()?.states || {};
  const ids = JELLYFIN_TV_OVERRIDE ? [JELLYFIN_TV_OVERRIDE] : jfPlayers;
  const found = ids.filter(id => states[id]).map(id => {
    const label = `${id} ${states[id].attributes.friendly_name || ''}`;
    return {
      id,
      ready: !['unavailable', 'unknown', 'off'].includes(states[id].state),
      tv: !!JELLYFIN_TV_OVERRIDE || isTvLike(label),
      other: isBrowserOrPhone(label),
    };
  });
  const pick = found.find(x => x.tv && x.ready) || found.find(x => !x.other && x.ready) || found.find(x => x.tv) || found.find(x => !x.other);
  return pick ? { id: pick.id, ready: pick.ready } : null;
}

/** The Jellyfin item playing on a player right now, if any. The Chromecast reports a stream
 *  address (…/Videos/<id>/…); the Jellyfin app reports the item id itself. */
export const playingItemId = (attrs: Record<string, any> | undefined) => {
  const raw = String(attrs?.media_content_id || '');
  const m = raw.match(/\/(?:Videos|Items)\/([0-9a-f]{32})\//i) || raw.match(/^([0-9a-f]{32})$/i);
  return m ? m[1] : undefined;
};

const isBusy = (id?: string) => {
  const s = id ? hassStore.get()?.states[id] : undefined;
  return !!s && ['playing', 'paused', 'buffering'].includes(s.state) && !!playingItemId(s.attributes);
};

/** The player to show and control: whichever is playing something from Jellyfin (the app
 *  first), else the Jellyfin app if it's open, else the Chromecast. */
export function currentTv(): string {
  const jf = jellyfinTv();
  if (jf && isBusy(jf.id)) return jf.id;
  if (isBusy(CAST_TV)) return CAST_TV;
  return jf?.ready ? jf.id : CAST_TV;
}

/** Live position: Home Assistant only updates it now and then, so add the time since. */
export const livePosition = (attrs: Record<string, any> | undefined, state?: string) => {
  const pos = Number(attrs?.media_position || 0);
  if (state !== 'playing' || !attrs?.media_position_updated_at) return pos;
  return pos + Math.max(0, (Date.now() - new Date(attrs.media_position_updated_at).getTime()) / 1000);
};

/** Open the Jellyfin app on the TV if it isn't already, and wait until Home Assistant sees it. */
async function openJellyfinApp(): Promise<string | null> {
  await loadJellyfinPlayers();
  let jf = jellyfinTv();
  if (jf?.ready) return jf.id;
  const hass = hassStore.get();
  if (!hass?.states[TV_REMOTE]) return null;
  await hass.callService('media_player', 'play_media', { media_content_type: 'app', media_content_id: JELLYFIN_APP }, { entity_id: TV_REMOTE }).catch(() => {});
  // Home Assistant checks Jellyfin every 10 seconds or so, so give it a little while.
  for (let i = 0; i < 18; i++) {
    await sleep(1500);
    await loadJellyfinPlayers(i % 4 === 3);
    jf = jellyfinTv();
    if (jf?.ready) { await sleep(1500); return jf.id; }
  }
  return null;
}

async function seekWhenPlaying(player: string, resumeAt = 0) {
  if (resumeAt <= 30) return;
  const hass = hassStore.get();
  // The TV takes a few seconds to load the file; jump once it's playing.
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    if (hassStore.get()?.states[player]?.state === 'playing') {
      await hass?.callService('media_player', 'media_seek', { seek_position: Math.max(0, resumeAt - 5) }, { entity_id: player }).catch(() => {});
      break;
    }
  }
}

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

  const jf = await openJellyfinApp();
  if (jf) {
    await call('media_player', 'play_media', { media_content_id: itemId(node.id), media_content_type: node.kind === 'movie' ? 'movie' : 'episode' }, jf);
    await seekWhenPlaying(jf, opts.resumeAt);
    return;
  }
  // Fallback: the Chromecast. Most films won't play this way (it can't do their surround sound).
  await call('media_player', 'play_media', { media_content_id: node.id, media_content_type: 'video' }, CAST_TV);
  await seekWhenPlaying(CAST_TV, opts.resumeAt);
}

export const tvControl = (service: 'media_play_pause' | 'media_stop') =>
  hassStore.get()?.callService('media_player', service, undefined, { entity_id: currentTv() });

export const tvSeekBy = (seconds: number) => {
  const h = hassStore.get();
  const player = currentTv();
  const s = h?.states[player];
  if (!h || !s) return;
  const to = Math.max(0, livePosition(s.attributes, s.state) + seconds);
  return h.callService('media_player', 'media_seek', { seek_position: to }, { entity_id: player });
};

/** Record how far through the TV is, every so often while something from Jellyfin plays.
 *  Returns a stop function. Run it on any device; they all write the same numbers. */
export function startTvTracker(): () => void {
  let lastSaved = 0;
  let lastId: string | undefined;
  let lastPos = 0;
  let lastDur = 0;
  const tick = () => {
    const s = hassStore.get()?.states[currentTv()];
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
