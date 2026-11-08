// components/home/Jukebox.tsx
// A shelf of album covers to flick through, like a jukebox: every album in the family's
// library (saved in Spotify), or any followed artist's albums. Tap one, then play it.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { hassStore } from '../../lib/hass';
import { MediaItem, artistDetail, friendlyError, library, play } from '../../lib/musicLibrary';
import { HomeIcons } from './icons';
import { useStreams } from './music';

const ALL = '__all__';
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

  const shown = artist === ALL ? albums : artistAlbums;
  const letters = useMemo(() => {
    if (artist !== ALL || !albums) return [];
    const first = new Map<string, number>();
    albums.forEach((a, i) => { const l = letterOf(a); if (!first.has(l)) first.set(l, i); });
    return [...first.entries()];
  }, [albums, artist]);

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
          <option value={ALL}>All your albums{albums ? ` (${albums.length})` : ''}</option>
          <optgroup label="Artists you follow">
            {artists.map(a => <option key={a.uri} value={a.uri}>{a.name}</option>)}
          </optgroup>
        </select>
        <span className="ml-auto text-sm text-white/60 hidden md:block">Flick sideways, tap a cover</span>
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
                <button key={a.uri} role="listitem" onClick={() => { setPicked(on ? null : a); setMsg(null); }} aria-pressed={on}
                  className="snap-start shrink-0 w-36 text-left group">
                  <Cover item={a} className={`w-36 h-36 rounded-md shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition-transform ${on ? 'ring-[3px] ring-amber-200 ring-offset-[3px] ring-offset-slate-950 -translate-y-1' : 'group-active:scale-[0.97]'}`} />
                  <p className="mt-2 text-[15px] font-semibold text-white truncate">{a.name}</p>
                  <p className="text-[13px] text-white/60 truncate">{a.subtitle}</p>
                </button>
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

          {picked && (
            <div className="mt-4 p-4 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-5">
              <Cover item={picked} className="w-24 h-24 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-2xl text-white truncate">{picked.name}</p>
                <p className="text-white/70 truncate">{picked.subtitle}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => go('play')} disabled={!!busy} className="h-11 px-5 rounded-full bg-white text-slate-950 font-semibold flex items-center gap-2 disabled:opacity-60">
                    <HomeIcons.Play className="w-4 h-4" /> {busy === 'play' ? 'Starting…' : 'Play'}
                  </button>
                  <button onClick={() => go('shuffle')} disabled={!!busy} className="h-11 px-4 rounded-full border border-white/30 text-white font-semibold flex items-center gap-2 disabled:opacity-60">
                    <HomeIcons.Shuffle className="w-4 h-4" /> {busy === 'shuffle' ? 'Starting…' : 'Shuffle'}
                  </button>
                  <button onClick={() => go('queue')} disabled={!!busy} className="h-11 px-4 rounded-full text-white/80 font-semibold hover:bg-white/10 disabled:opacity-60">
                    {busy === 'queue' ? 'Adding…' : 'Add to queue'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className={`mt-3 text-sm font-semibold ${msg.error ? 'text-orange-300' : 'text-amber-200'}`}>{msg.text}</p>}
    </section>
  );
};

export default Jukebox;
