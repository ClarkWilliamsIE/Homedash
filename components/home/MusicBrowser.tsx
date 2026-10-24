// components/home/MusicBrowser.tsx
// Search and browse Spotify / your Music Assistant library, and play on any speaker.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { MediaItem, MediaKind, library, play, search } from '../../lib/musicLibrary';
import { Card } from './controls';
import { HomeIcons } from './icons';

type Tab = { id: string; label: string; kind: MediaKind; orderBy?: string };
const TABS: Tab[] = [
  { id: 'playlists', label: 'Your playlists', kind: 'playlist', orderBy: 'last_played_desc' },
  { id: 'recent', label: 'Recently played', kind: 'track', orderBy: 'last_played_desc' },
  { id: 'albums', label: 'Albums', kind: 'album', orderBy: 'timestamp_added_desc' },
  { id: 'artists', label: 'Artists', kind: 'artist', orderBy: 'play_count_desc' },
  { id: 'radio', label: 'Radio', kind: 'radio' },
];

const TARGETS = [
  { entity: HOME.music.group, name: 'Kitchen & family room' },
  ...HOME.music.speakers.map(s => ({ entity: s.entity, name: s.name })),
];

const Cover: React.FC<{ item: MediaItem; round?: boolean; className?: string }> = ({ item, round, className = '' }) => (
  <div className={`bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden flex items-center justify-center shrink-0 ${round ? 'rounded-full' : 'rounded-2xl'} ${className}`}>
    {item.image
      ? <img src={item.image} alt="" loading="lazy" className="w-full h-full object-cover" />
      : (item.kind === 'radio' ? <HomeIcons.Radio className="w-1/3 h-1/3 text-slate-400" /> : <HomeIcons.Music className="w-1/3 h-1/3 text-slate-400" />)}
  </div>
);

const Tile: React.FC<{ item: MediaItem; onPlay: (i: MediaItem) => void; onQueue?: (i: MediaItem) => void }> = ({ item, onPlay, onQueue }) => (
  <div className="group relative min-w-0">
    <button onClick={() => onPlay(item)} className="block w-full text-left">
      <div className="relative">
        <Cover item={item} round={item.kind === 'artist'} className="w-full aspect-square shadow-sm" />
        <span className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center touch-show opacity-0 group-hover:opacity-100 transition-opacity">
          <HomeIcons.Play className="w-4 h-4 ml-0.5" />
        </span>
      </div>
      <p className={`mt-2 text-sm font-bold text-slate-800 truncate ${item.kind === 'artist' ? 'text-center' : ''}`}>{item.name}</p>
      {item.subtitle && <p className="text-xs font-semibold text-slate-400 truncate">{item.subtitle}</p>}
    </button>
    {onQueue && (
      <button onClick={() => onQueue(item)} aria-label={`Add ${item.name} to queue`}
        className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/50 text-white text-[11px] font-bold touch-show opacity-0 group-hover:opacity-100 transition-opacity">
        + Queue
      </button>
    )}
  </div>
);

const TrackRow: React.FC<{ item: MediaItem; onPlay: (i: MediaItem) => void; onQueue: (i: MediaItem) => void }> = ({ item, onPlay, onQueue }) => (
  <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50">
    <button onClick={() => onPlay(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
      <Cover item={item} className="w-12 h-12 !rounded-xl" />
      <span className="min-w-0">
        <span className="block font-bold text-slate-800 truncate">{item.name}</span>
        <span className="block text-xs font-semibold text-slate-400 truncate">{item.subtitle}</span>
      </span>
    </button>
    <button onClick={() => onQueue(item)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200">+ Queue</button>
    <button onClick={() => onPlay(item)} aria-label={`Play ${item.name}`} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
      <HomeIcons.Play className="w-4 h-4 ml-0.5" />
    </button>
  </div>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">{children}</div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 mt-6 first:mt-0">{children}</h4>
);

const MusicBrowser: React.FC = () => {
  const [target, setTarget] = useState<string>(() => {
    try { return localStorage.getItem('homedash_play_on') || HOME.music.group; } catch { return HOME.music.group; }
  });
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof search>> | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<any>(null);

  const targetName = useMemo(() => TARGETS.find(t => t.entity === target)?.name || 'speaker', [target]);
  const chooseTarget = (t: string) => { setTarget(t); try { localStorage.setItem('homedash_play_on', t); } catch { /* ignore */ } };

  // Library tab
  useEffect(() => {
    if (query.trim()) return;
    let cancelled = false;
    setItems(null); setError('');
    library(tab.kind, tab.orderBy).then(r => { if (!cancelled) setItems(r); }).catch(e => { if (!cancelled) setError(e.message || 'Could not load'); });
    return () => { cancelled = true; };
  }, [tab, query]);

  // Search (waits until you stop typing)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      setError('');
      search(q).then(r => { if (!cancelled) setResults(r); }).catch(e => { if (!cancelled) setError(e.message || 'Search failed'); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const say = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };
  const onPlay = (i: MediaItem) => { play(target, i, 'replace'); say(`Playing ${i.name} on ${targetName}`); };
  const onQueue = (i: MediaItem) => { play(target, i, 'add'); say(`Added ${i.name} to the queue`); };

  const empty = (list?: MediaItem[] | null) => list && list.length === 0;

  return (
    <Card
      title="Browse music"
      action={
        <label className="flex items-center gap-2 text-sm font-bold text-slate-500">
          Play on
          <select value={target} onChange={e => chooseTarget(e.target.value)}
            className="bg-slate-100 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none">
            {TARGETS.map(t => <option key={t.entity} value={t.entity}>{t.name}</option>)}
          </select>
        </label>
      }
    >
      <div className="relative">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search Spotify: songs, artists, albums, playlists…"
          className="w-full bg-slate-50 rounded-2xl pl-12 pr-12 py-4 font-semibold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-50 focus:bg-white border border-transparent focus:border-indigo-100"
        />
        <svg className="absolute left-4 top-4 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        {query && <button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-3 top-3 w-9 h-9 rounded-full text-slate-400 hover:bg-slate-100">✕</button>}
      </div>

      {!query.trim() && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap ${tab.id === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {error && <p className="text-sm font-bold text-red-600 bg-red-50 rounded-2xl p-4">{error}</p>}

        {/* Library */}
        {!query.trim() && !error && (
          items === null ? <p className="text-sm font-semibold text-slate-400 py-6 text-center">Loading…</p>
            : empty(items) ? <p className="text-sm font-semibold text-slate-400 py-6 text-center">Nothing here yet.</p>
              : tab.kind === 'track'
                ? <div className="space-y-1">{items.slice(0, 30).map(i => <TrackRow key={i.uri} item={i} onPlay={onPlay} onQueue={onQueue} />)}</div>
                : <Grid>{items.map(i => <Tile key={i.uri} item={i} onPlay={onPlay} onQueue={i.kind === 'album' ? onQueue : undefined} />)}</Grid>
        )}

        {/* Search results */}
        {query.trim() && !error && (
          results === null ? <p className="text-sm font-semibold text-slate-400 py-6 text-center">Searching…</p> : (
            <div>
              {results.tracks.length > 0 && <>
                <SectionTitle>Songs</SectionTitle>
                <div className="space-y-1">{results.tracks.slice(0, 5).map(i => <TrackRow key={i.uri} item={i} onPlay={onPlay} onQueue={onQueue} />)}</div>
              </>}
              {results.artists.length > 0 && <>
                <SectionTitle>Artists</SectionTitle>
                <Grid>{results.artists.slice(0, 6).map(i => <Tile key={i.uri} item={i} onPlay={onPlay} />)}</Grid>
              </>}
              {results.albums.length > 0 && <>
                <SectionTitle>Albums</SectionTitle>
                <Grid>{results.albums.slice(0, 6).map(i => <Tile key={i.uri} item={i} onPlay={onPlay} onQueue={onQueue} />)}</Grid>
              </>}
              {results.playlists.length > 0 && <>
                <SectionTitle>Playlists</SectionTitle>
                <Grid>{results.playlists.slice(0, 6).map(i => <Tile key={i.uri} item={i} onPlay={onPlay} />)}</Grid>
              </>}
              {results.radio.length > 0 && <>
                <SectionTitle>Radio</SectionTitle>
                <Grid>{results.radio.slice(0, 6).map(i => <Tile key={i.uri} item={i} onPlay={onPlay} />)}</Grid>
              </>}
              {!results.tracks.length && !results.artists.length && !results.albums.length && !results.playlists.length && !results.radio.length && (
                <p className="text-sm font-semibold text-slate-400 py-6 text-center">No results for "{query}".</p>
              )}
            </div>
          )
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[160] bg-slate-900 text-white font-bold px-5 py-3 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}
    </Card>
  );
};

export default MusicBrowser;
