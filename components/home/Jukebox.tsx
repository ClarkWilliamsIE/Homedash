// components/home/Jukebox.tsx
// A shelf of album covers to flick through, like a jukebox: every album in the family's
// library (saved in Spotify), or any followed artist's albums. Tap one, then play it.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { hassStore } from '../../lib/hass';
import { MediaItem, artistDetail, friendlyError, library, play } from '../../lib/musicLibrary';
import { Card } from './controls';
import { HomeIcons } from './icons';
import { useStreams } from './music';

const ALL = '__all__';
const firstArtist = (a: MediaItem) => (a.artistNames?.[0] || a.subtitle || '').replace(/^the\s+/i, '');
const letterOf = (a: MediaItem) => {
  const c = firstArtist(a).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

const Cover: React.FC<{ item: MediaItem; className?: string }> = ({ item, className = '' }) => (
  <div className={`relative overflow-hidden bg-slate-200 ${className}`}>
    {item.image
      ? <img src={item.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      : <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-display text-slate-500">{item.name}</span>}
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
    <Card
      title="Jukebox"
      action={
        <select value={artist} onChange={e => { setArtist(e.target.value); setPicked(null); }} aria-label="Whose albums"
          className="h-10 max-w-[14rem] bg-slate-100 rounded-xl px-3 font-semibold text-slate-800 outline-none">
          <option value={ALL}>All your albums{albums ? ` (${albums.length})` : ''}</option>
          <optgroup label="Artists you follow">
            {artists.map(a => <option key={a.uri} value={a.uri}>{a.name}</option>)}
          </optgroup>
        </select>
      }
    >
      {shown === null ? (
        <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3, 4].map(i => <div key={i} className="w-40 h-40 shrink-0 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <p className="text-slate-500">{artist === ALL ? 'No saved albums yet. Albums you save in Spotify appear here.' : 'No albums found for this artist.'}</p>
      ) : (
        <>
          {/* The shelf: flick sideways; each cover snaps into place. */}
          <div ref={shelf} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pt-2 pb-3 -mx-2 px-2 no-scrollbar" role="list">
            {shown.map(a => {
              const on = picked?.uri === a.uri;
              return (
                <button key={a.uri} role="listitem" onClick={() => { setPicked(on ? null : a); setMsg(null); }} aria-pressed={on}
                  className="snap-start shrink-0 w-40 text-left group">
                  <Cover item={a} className={`w-40 h-40 rounded-2xl shadow-sm transition-transform ${on ? 'ring-4 ring-indigo-600 ring-offset-2 ring-offset-white scale-[1.02]' : 'group-active:scale-[0.98]'}`} />
                  <p className="mt-2 font-semibold text-slate-900 truncate">{a.name}</p>
                  <p className="text-sm text-slate-500 truncate">{a.subtitle}</p>
                </button>
              );
            })}
          </div>

          {letters.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1" aria-label="Jump to artist letter">
              {letters.map(([l, i]) => (
                <button key={l} onClick={() => jump(i)} className="w-8 h-8 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 active:bg-indigo-50">{l}</button>
              ))}
            </div>
          )}

          {picked && (
            <div className="mt-4 p-4 rounded-2xl bg-slate-50 flex items-center gap-5">
              <Cover item={picked} className="w-24 h-24 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-2xl text-slate-900 truncate">{picked.name}</p>
                <p className="text-slate-500 truncate">{picked.subtitle}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => go('play')} disabled={!!busy} className="h-11 px-5 rounded-xl bg-indigo-700 text-white font-semibold flex items-center gap-2 disabled:opacity-60">
                    <HomeIcons.Play className="w-4 h-4" /> {busy === 'play' ? 'Starting…' : 'Play'}
                  </button>
                  <button onClick={() => go('shuffle')} disabled={!!busy} className="h-11 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold flex items-center gap-2 disabled:opacity-60">
                    <HomeIcons.Shuffle className="w-4 h-4" /> {busy === 'shuffle' ? 'Starting…' : 'Shuffle'}
                  </button>
                  <button onClick={() => go('queue')} disabled={!!busy} className="h-11 px-4 rounded-xl text-slate-600 font-semibold hover:bg-white disabled:opacity-60">
                    {busy === 'queue' ? 'Adding…' : 'Add to queue'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className={`mt-3 text-sm font-semibold ${msg.error ? 'text-rose-700' : 'text-emerald-700'}`}>{msg.text}</p>}
    </Card>
  );
};

export default Jukebox;
