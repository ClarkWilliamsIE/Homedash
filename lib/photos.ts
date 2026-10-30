// lib/photos.ts
// Family photos, kept on the Home Assistant server (its "My media" folder). Homedash adds them
// (shrunk to a sensible size first), shows them on the home screen and as a photo frame, and
// keeps Home Assistant's list up to date so the TV slideshow can pick from them.

import { useSyncExternalStore } from 'react';
import { hassStore, hassAsset } from './hass';

export interface Photo {
  /** media-source id, e.g. media-source://media_source/local/2024-03-17_1432_ab12.jpg */
  id: string;
  /** File name in the media folder */
  name: string;
  /** Small copy for grids, when there is one */
  thumbId?: string;
  /** When it was taken, if known */
  taken?: Date;
}

const ROOT = 'media-source://media_source/local/.';
/** Home Assistant's photo list for the TV (an input_select of file names). */
export const TV_LIST = 'input_select.family_photos';
export const TV_SCRIPT = 'script.tv_photos';
export const TV_STOP = 'script.tv_photos_stop';
export const TV_AUTO = 'input_boolean.tv_photos_when_idle';

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const THUMB = /\.thumb\.jpg$/i;

// --- Store --------------------------------------------------------------------------------
type State = { photos: Photo[] | null; error: string; busy: string };
let state: State = { photos: null, error: '', busy: '' };
const listeners = new Set<() => void>();
const setState = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
export const usePhotos = () =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);

const hass = () => {
  const h = hassStore.get();
  if (!h) throw new Error('Photos need Home Assistant. Connect to home (or turn on Tailscale) and try again.');
  return h;
};

/** "2024-03-17_1432_ab12.jpg" → that date. */
const dateFromName = (name: string) => {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d.getTime()) ? undefined : d;
};

let loading: Promise<void> | null = null;
let loadedAt = 0;

/** Read the photo folder (again). */
export function refreshPhotos(force = false): Promise<void> {
  if (!hassStore.get()) return Promise.resolve();
  if (loading) return loading;
  if (!force && state.photos && Date.now() - loadedAt < 10 * 60 * 1000) return Promise.resolve();
  loading = (async () => {
    try {
      const res = await hass().callWS({ type: 'media_source/browse_media', media_content_id: ROOT });
      const files: { id: string; name: string }[] = (res.children || [])
        .filter((c: any) => !c.can_expand && IMAGE.test(c.title || c.media_content_id))
        .map((c: any) => ({ id: c.media_content_id, name: c.title || c.media_content_id.split('/').pop() }));
      const thumbs = new Map(files.filter(f => THUMB.test(f.name)).map(f => [f.name.replace(THUMB, ''), f.id]));
      const photos = files
        .filter(f => !THUMB.test(f.name))
        .map(f => ({ ...f, thumbId: thumbs.get(f.name.replace(/\.[^.]+$/, '')), taken: dateFromName(f.name) }))
        .sort((a, b) => (b.taken?.getTime() || 0) - (a.taken?.getTime() || 0) || b.name.localeCompare(a.name));
      loadedAt = Date.now();
      setState({ photos, error: '' });
      syncTvList(photos);
    } catch (e: any) {
      setState({ error: e?.message || 'Couldn\'t read the photos' });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Keep Home Assistant's list (used by the TV slideshow) matching the folder. */
const syncTvList = (photos: Photo[]) => {
  const h = hassStore.get();
  if (!h || !h.states[TV_LIST]) return;
  const want = photos.length ? photos.map(p => p.name) : ['none'];
  const have: string[] = h.states[TV_LIST].attributes.options || [];
  if (want.length === have.length && want.every((n, i) => n === have[i])) return;
  h.callService('input_select', 'set_options', { options: want }, { entity_id: TV_LIST }).catch(() => {});
};

// --- Showing them -------------------------------------------------------------------------
// Home Assistant hands out signed links that expire; keep each for a few hours.
const urls = new Map<string, { url: string; until: number }>();
export async function photoUrl(id: string): Promise<string> {
  const hit = urls.get(id);
  if (hit && hit.until > Date.now()) return hit.url;
  const res = await hass().callWS({ type: 'media_source/resolve_media', media_content_id: id, expires: 6 * 3600 });
  const url = hassAsset(res.url) || res.url;
  urls.set(id, { url, until: Date.now() + 5 * 3600 * 1000 });
  return url;
}

// --- Adding and removing ------------------------------------------------------------------
/** The date a photo was taken, from its EXIF data (JPEG only). */
async function exifDate(file: File): Promise<Date | undefined> {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return undefined;
    let off = 2;
    while (off < buf.byteLength - 4) {
      const marker = buf.getUint16(off);
      const len = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) { // "Exif"
        const tiff = off + 10;
        const le = buf.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => buf.getUint16(o, le);
        const u32 = (o: number) => buf.getUint32(o, le);
        const readTag = (ifd: number, tag: number): number | undefined => {
          const n = u16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return u32(e + 8);
          }
          return undefined;
        };
        const ascii = (o: number) => { let s = ''; for (let i = 0; i < 19; i++) s += String.fromCharCode(buf.getUint8(o + i)); return s; };
        const ifd0 = tiff + u32(tiff + 4);
        const exifPtr = readTag(ifd0, 0x8769);
        const original = exifPtr !== undefined ? readTag(tiff + exifPtr, 0x9003) : undefined;
        const at = original ?? readTag(ifd0, 0x0132);
        if (at === undefined) return undefined;
        const m = ascii(tiff + at).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
        if (!m) return undefined;
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        return isNaN(d.getTime()) ? undefined : d;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch { /* not a JPEG we can read */ }
  return undefined;
}

/** Shrink a picture to at most `max` pixels on its long side, as a JPEG. */
async function shrink(file: File, max: number, quality: number): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Couldn't open ${file.name}`));
        img.src = url;
      });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w = (source as any).naturalWidth || source.width;
  const h = (source as any).naturalHeight || source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Couldn\'t shrink the photo'))), 'image/jpeg', quality));
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

async function upload(blob: Blob, name: string) {
  const h = hass();
  const fd = new FormData();
  fd.append('media_content_id', ROOT);
  fd.append('file', blob, name);
  const path = '/api/media_source/local_source/upload';
  const res = h.fetchWithAuth
    ? await h.fetchWithAuth(path, { method: 'POST', body: fd })
    : await fetch(hassAsset(path)!, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${h.auth?.data?.access_token || h.token}` } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Home Assistant only lets admin accounts add photos.');
    throw new Error(`Home Assistant didn't take the photo (${res.status})`);
  }
}

/** Add photos from the phone or computer. Calls back with progress ("3 of 12"). */
export async function addPhotos(files: File[]): Promise<{ added: number; failed: string[] }> {
  const failed: string[] = [];
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setState({ busy: `Adding ${i + 1} of ${files.length}…` });
    try {
      const taken = (await exifDate(file)) || new Date(file.lastModified || Date.now());
      const base = `${stamp(taken)}_${Math.random().toString(36).slice(2, 6)}`;
      const big = await shrink(file, 2560, 0.85);
      const small = await shrink(file, 480, 0.75);
      await upload(big, `${base}.jpg`);
      await upload(small, `${base}.thumb.jpg`);
      added++;
    } catch (e: any) {
      failed.push(`${file.name}: ${e?.message || 'failed'}`);
      if (/admin/.test(e?.message || '')) break;
    }
  }
  setState({ busy: '' });
  await refreshPhotos(true);
  return { added, failed };
}

export async function removePhoto(p: Photo) {
  const h = hass();
  setState({ busy: 'Removing…' });
  try {
    await h.callWS({ type: 'media_source/local_source/remove', media_content_id: p.id });
    if (p.thumbId) await h.callWS({ type: 'media_source/local_source/remove', media_content_id: p.thumbId }).catch(() => {});
  } finally {
    setState({ busy: '' });
  }
  await refreshPhotos(true);
}

/** "March 2024" for a caption. */
export const photoCaption = (p?: Photo) =>
  p?.taken ? p.taken.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }) : '';

/** A shuffled copy, so slideshows don't always start in the same place. */
export const shuffled = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
