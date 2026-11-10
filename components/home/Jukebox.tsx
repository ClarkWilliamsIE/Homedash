// components/home/Jukebox.tsx
// A shelf of album covers to flick through, like a jukebox: every album in the family's
// library (saved in Spotify), or any followed artist's albums. Tap one, then play it.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { hassStore } from '../../lib/hass';
import { MediaItem, artistDetail, friendlyError, knownTrackCount, library, play, trackCount } from '../../lib/musicLibrary';
import { HomeIcons } from './icons';
import { useStreams } from './music';

const ALL = '__all__';
const ORDER_KEY = 'homedash_jukebox_order';
/** Fewer songs than this and it's a single (or a two-song release), not an album. */
const MIN_TRACKS = 4;
type Order = 'shuffle' | 'az';

// A steady random order: the same seed gives the same order, so the shelf doesn't jump about
// while singles are being weeded out. A new seed reshuffles.
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const firstArtist = (a: MediaItem) => (a.artistNames?.[0] || a.subtitle || '').replace(/^the\s+/i, '');
const letterOf = (a: MediaItem) => {
  const c = firstArtist(a).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

const Cover: React.FC<{ item: MediaItem; className?: string }> = ({ item, className = '' }) => (
  <div className={`relative overflow-hidden bg-white/10 ${className}`}>
    {item.image
      ? <img src={item.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      : <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-display text-white/60">{item.name}</span>}
  </div>
);

const Jukebox: React.FC = () => {
  const [albums, setAlbums] = useState<MediaItem[] | null>(null);
  const [artists, setArtists] = useState<MediaItem[]>([]);
  const [artist, setArtist] = useState<string>(ALL);
  const [artistAlbums, setArtistAlbums] = useState<MediaItem[] | null>(null);
  const [picked, setPicked] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const shelf = useRef<HTMLDivElement>(null);
  const main = useStreams()[0];
  const [order, setOrder] = useState<Order>(() => { try { return localStorage.getItem(ORDER_KEY) === 'az' ? 'az' : 'shuffle'; } catch { return 'shuffle'; } });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [, setCounted] = useState(0);

  useEffect(() => {
    library('album', 'artist_name', 500).then(setAlbums).catch(e => { setAlbums([]); setMsg({ text: friendlyError(e), error: true }); });
    library('artist', 'name', 500).then(setArtists).catch(() => {});
  }, []);

  // A followed artist: their albums, found on Spotify.
  useEffect(() => {
    if (artist === ALL) { setArtistAlbums(null); return; }
    const a = artists.find(x => x.uri === artist);
    if (!a) return;
    setArtistAlbums(null);
    artistDetail(a).then(r => setArtistAlbums(r.albums)).catch(() => setArtistAlbums([]));
    shelf.current?.scrollTo({ left: 0 });
  }, [artist]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = artist === ALL ? albums : artistAlbums;

  // Count the songs on any album we haven't checked yet; singles drop off as answers come in.
  useEffect(() => {
    if (!source) return;
    let live = true;
    source.filter(a => knownTrackCount(a.uri) === undefined).forEach(a => {
      trackCount(a.uri).then(() => { if (live) setCounted(n => n + 1); });
    });
    return () => { live = false; };
  }, [source]);

  const unchecked = source ? source.filter(a => knownTrackCount(a.uri) === undefined).length : 0;
  const isAlbum = (a: MediaItem) => { const n = knownTrackCount(a.uri); return n === undefined || n < 0 || n >= MIN_TRACKS; };
  const shown = source === null ? null : (
    order === 'shuffle'
      ? [...source].sort((a, b) => hash(a.uri + seed) - hash(b.uri + seed))
      : source
  ).filter(isAlbum);

  const letters = useMemo(() => {
    if (artist !== ALL || order !== 'az' || !shown) return [];
    const first = new Map<string, number>();
    shown.forEach((a, i) => { const l = letterOf(a); if (!first.has(l)) first.set(l, i); });
    return [...first.entries()];
  }, [shown, artist, order]);

  const chooseOrder = (o: Order) => {
    if (o === 'shuffle' && order === 'shuffle') setSeed(Math.floor(Math.random() * 1e9));
    setOrder(o);
    try { localStorage.setItem(ORDER_KEY, o); } catch { /* ignore */ }
    shelf.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const jump = (index: number) => {
    const el = shelf.current?.children[index] as HTMLElement | undefined;
    if (el && shelf.current) shelf.current.scrollTo({ left: el.offsetLeft - shelf.current.offsetLeft, behavior: 'smooth' });
  };

  // Play where the music already is, else in the kitchen & family room.
  const target = main && !main.direct ? main.entity : HOME.music.group;
  const go = async (mode: 'play' | 'shuffle' | 'queue') => {
    if (!picked) return;
    setBusy(mode); setMsg(null);
    try {
      const hass = hassStore.get();
      if (mode !== 'queue') await hass?.callService('media_player', 'shuffle_set', { shuffle: mode === 'shuffle' }, { entity_id: target }).catch(() => {});
      await play(target, picked, mode === 'queue' ? 'add' : 'replace');
      setMsg({ text: mode === 'queue' ? `Added ${picked.name} to the queue` : `Playing ${picked.name}` });
    } catch (e) {
      setMsg({ text: friendlyError(e), error: true });
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-label="Jukebox">
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <h2 className="font-display text-[26px] leading-tight">Jukebox</h2>
        <select value={artist} onChange={e => { setArtist(e.target.value); setPicked(null); }} aria-label="Whose albums"
          className="h-10 max-w-[16rem] bg-white/10 rounded-full px-4 font-semibold text-white outline-none [&>*]:text-slate-900">
          <option value={ALL}>All your albums{albums ? ` (${albums.filter(isAlbum).length})` : ''}</option>
          <optgroup label="Artists you follow">
            {artists.map(a => <option key={a.uri} value={a.uri}>{a.name}</option>)}
          </optgroup>
        </select>
        <div className="ml-auto flex rounded-full bg-white/10 p-1" role="group" aria-label="Album order">
          <button onClick={() => chooseOrder('shuffle')} aria-pressed={order === 'shuffle'}
            title={order === 'shuffle' ? 'Shuffle again' : 'Shuffled'}
            className={`h-9 px-3.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${order === 'shuffle' ? 'bg-white text-slate-950' : 'text-white/75'}`}>
            <HomeIcons.Shuffle className="w-4 h-4" /> {order === 'shuffle' ? 'Shuffle again' : 'Shuffled'}
          </button>
          <button onClick={() => chooseOrder('az')} aria-pressed={order === 'az'}
            className={`h-9 px-3.5 rounded-full text-sm font-semibold ${order === 'az' ? 'bg-white text-slate-950' : 'text-white/75'}`}>
            A–Z
          </button>
        </div>
      </div>
      {shown === null ? (
        <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3, 4].map(i => <div key={i} className="w-36 h-36 shrink-0 rounded-md bg-white/10 animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <p className="text-white/60">{artist === ALL ? 'No saved albums yet. Albums you save in Spotify appear here.' : 'No albums found for this artist.'}</p>
      ) : (
        <>
          {/* The shelf: flick sideways; each cover snaps into place. */}
          <div ref={shelf} className="flex gap-[18px] overflow-x-auto snap-x snap-mandatory pt-2 pb-3 -mx-6 px-6 lg:-mx-9 lg:px-9 scroll-px-6 lg:scroll-px-9 no-scrollbar" role="list">
            {shown.map(a => {
              const on = picked?.uri === a.uri;
              return (
                <div key={a.uri} role="listitem" className="snap-start shrink-0 w-36">
                  <div className={`relative w-36 h-36 transition-transform ${on ? '-translate-y-1' : ''}`}>
                    <button onClick={() => { setPicked(on ? null : a); setMsg(null); }} aria-pressed={on}
                      aria-label={on ? `Close ${a.name}` : `${a.name}, ${a.subtitle || ''}`}
                      className="block w-36 h-36 rounded-md active:scale-[0.97] transition-transform">
                      <Cover item={a} className={`w-36 h-36 rounded-md shadow-[0_10px_24px_rgba(0,0,0,0.45)] ${on ? 'ring-[3px] ring-amber-200 ring-offset-[3px] ring-offset-slate-950' : ''}`} />
                    </button>
                    {/* Tap a cover and its buttons appear right on it, like pressing a jukebox key. */}
                    {on && (
                      <div className="absolute inset-0 rounded-md bg-black/55 flex flex-col items-center justify-center gap-2.5 pointer-events-none">
                        <button onClick={() => go('play')} disabled={!!busy} aria-label={`Play ${a.name}`}
                          className="pointer-events-auto w-16 h-16 rounded-full bg-white text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-70">
                          {busy === 'play'
                            ? <span className="w-6 h-6 border-[3px] border-slate-950 border-t-transparent rounded-full animate-spin" />
                            : <HomeIcons.Play className="w-7 h-7 ml-1" />}
                        </button>
                        <div className="flex gap-2 pointer-events-auto">
                          <button onClick={() => go('shuffle')} disabled={!!busy} aria-label={`Shuffle ${a.name}`}
                            className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center active:bg-white/30 disabled:opacity-60">
                            {busy === 'shuffle' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <HomeIcons.Shuffle className="w-5 h-5" />}
                          </button>
                          <button onClick={() => go('queue')} disabled={!!busy} aria-label={`Add ${a.name} to the queue`}
                            className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center active:bg-white/30 disabled:opacity-60">
                            {busy === 'queue' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <HomeIcons.Plus className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-white truncate">{a.name}</p>
                  <p className="text-[13px] text-white/60 truncate">{a.subtitle}</p>
                </div>
              );
            })}
          </div>

          {letters.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1" aria-label="Jump to artist letter">
              {letters.map(([l, i]) => (
                <button key={l} onClick={() => jump(i)} className="w-8 h-8 rounded-lg text-sm font-semibold text-white/60 hover:bg-white/10 active:bg-white/20">{l}</button>
              ))}
            </div>
          )}

        </>
      )}
      {unchecked > 0 && shown && shown.length > 0 && <p className="mt-2 text-sm text-white/50">Weeding out singles… {unchecked} left to check (only the first time)</p>}
      {msg && <p className={`mt-3 text-sm font-semibold ${msg.error ? 'text-orange-300' : 'text-amber-200'}`}>{msg.text}</p>}
    </section>
  );
};

export default Jukebox;
