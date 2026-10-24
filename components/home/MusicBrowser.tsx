// components/home/MusicBrowser.tsx
// Search and browse Spotify / your Music Assistant library, and play on any speaker.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '../../home.config';
import { MediaItem, MediaKind, artistDetail, friendlyError, library, play, search } from '../../lib/musicLibrary';
import { Card } from './controls';
import { HomeIcons } from './icons';

type Tab = { id: string; label: string; kind: MediaKind; orderBy?: string; limit?: number };
const TABS: Tab[] = [
  { id: 'playlists', label: 'Your playlists', kind: 'playlist', orderBy: 'last_played_desc' },
  { id: 'recent', label: 'Recently played', kind: 'track', orderBy: 'last_played_desc' },
  { id: 'albums', label: 'Albums', kind: 'album', orderBy: 'timestamp_added_desc', limit: 120 },
  { id: 'artists', label: 'Artists', kind: 'artist', orderBy: 'sort_name', limit: 1000 },
  { id: 'radio', label: 'Radio', kind: 'radio' },
];

const TARGETS = [
  { entity: HOME.music.group, name: 'Kitchen & family room' },
  ...HOME.music.speakers.map(s => ({ entity: s.entity, name: s.name })),
];

type Actions = { onPlay: (i: MediaItem) => void; onQueue: (i: MediaItem) => void; onOpen: (i: MediaItem) => void; busy: boolean };

const Cover: React.FC<{ item: MediaItem; round?: boolean; className?: string }> = ({ item, round, className = '' }) => (
  <div className={`bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden flex items-center justify-center shrink-0 ${round ? 'rounded-full' : 'rounded-2xl'} ${className}`}>
    {item.image
      ? <img src={item.image} alt="" loading="lazy" className="w-full h-full object-cover" />
      : (item.kind === 'radio' ? <HomeIcons.Radio className="w-1/3 h-1/3 text-slate-400" /> : <HomeIcons.Music className="w-1/3 h-1/3 text-slate-400" />)}
  </div>
);

/** Album/playlist/radio tile plays when tapped; an artist tile opens the artist. */
const Tile: React.FC<{ item: MediaItem; a: Actions; queue?: boolean }> = ({ item, a, queue }) => {
  const isArtist = item.kind === 'artist';
  return (
    <div className="group relative min-w-0">
      <button disabled={a.busy && !isArtist} onClick={() => (isArtist ? a.onOpen(item) : a.onPlay(item))} className="block w-full text-left disabled:opacity-60">
        <div className="relative">
          <Cover item={item} round={isArtist} className="w-full aspect-square shadow-sm" />
          {!isArtist && (
            <span className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center touch-show opacity-0 group-hover:opacity-100 transition-opacity">
              <HomeIcons.Play className="w-4 h-4 ml-0.5" />
            </span>
          )}
        </div>
        <p className={`mt-2 text-sm font-bold text-slate-800 truncate ${isArtist ? 'text-center' : ''}`}>{item.name}</p>
        {item.subtitle && !isArtist && <p className="text-xs font-semibold text-slate-400 truncate">{item.subtitle}</p>}
      </button>
      {queue && (
        <button disabled={a.busy} onClick={() => a.onQueue(item)} aria-label={`Add ${item.name} to queue`}
          className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/50 text-white text-[11px] font-bold touch-show opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30">
          + Queue
        </button>
      )}
    </div>
  );
};

const TrackRow: React.FC<{ item: MediaItem; a: Actions }> = ({ item, a }) => (
  <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50">
    <button disabled={a.busy} onClick={() => a.onPlay(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60">
      <Cover item={item} className="w-12 h-12 !rounded-xl" />
      <span className="min-w-0">
        <span className="block font-bold text-slate-800 truncate">{item.name}</span>
        <span className="block text-xs font-semibold text-slate-400 truncate">{item.subtitle}</span>
      </span>
    </button>
    <button disabled={a.busy} onClick={() => a.onQueue(item)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-40">+ Queue</button>
    <button disabled={a.busy} onClick={() => a.onPlay(item)} aria-label={`Play ${item.name}`} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40">
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

const Loading: React.FC<{ children?: React.ReactNode }> = ({ children = 'Loading…' }) => (
  <p className="text-sm font-semibold text-slate-400 py-6 text-center">{children}</p>
);

/** An artist's page: their songs and albums, plus "Play artist". */
const ArtistView: React.FC<{ artist: MediaItem; a: Actions; onBack: () => void }> = ({ artist, a, onBack }) => {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof artistDetail>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    artistDetail(artist).then(d => { if (!cancelled) setDetail(d); }).catch(e => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, [artist.uri]);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-indigo-600 mb-4">
        <HomeIcons.Chevron className="w-4 h-4 rotate-180" /> Back
      </button>
      <div className="flex items-center gap-5">
        <Cover item={artist} round className="w-28 h-28 shadow-md" />
        <div className="min-w-0">
          <h3 className="text-3xl font-black text-slate-900 tracking-tight truncate">{artist.name}</h3>
          <button disabled={a.busy} onClick={() => a.onPlay(artist)} className="mt-3 flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 disabled:opacity-50">
            <HomeIcons.Play className="w-4 h-4" /> Play all
          </button>
          <p className="text-xs font-semibold text-slate-400 mt-2">Playing everything by an artist can take 10–20 seconds to start. A song or album starts faster.</p>
        </div>
      </div>
      {error && <p className="text-sm font-bold text-red-600 bg-red-50 rounded-2xl p-4 mt-5">{error}</p>}
      {!detail && !error && <Loading />}
      {detail && (
        <div className="mt-6">
          {detail.tracks.length > 0 && <>
            <SectionTitle>Songs</SectionTitle>
            <div className="space-y-1">{detail.tracks.map(i => <TrackRow key={i.uri} item={i} a={a} />)}</div>
          </>}
          {detail.albums.length > 0 && <>
            <SectionTitle>Albums</SectionTitle>
            <Grid>{detail.albums.map(i => <Tile key={i.uri} item={i} a={a} queue />)}</Grid>
          </>}
          {!detail.tracks.length && !detail.albums.length && <Loading>No songs found for {artist.name}.</Loading>}
        </div>
      )}
    </div>
  );
};

const MusicBrowser: React.FC = () => {
  const [target, setTarget] = useState<string>(() => {
    try { return localStorage.getItem('homedash_play_on') || HOME.music.group; } catch { return HOME.music.group; }
  });
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof search>> | null>(null);
  const [artist, setArtist] = useState<MediaItem | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'ok' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<any>(null);

  const targetName = useMemo(() => TARGETS.find(t => t.entity === target)?.name || 'speaker', [target]);
  const chooseTarget = (t: string) => { setTarget(t); try { localStorage.setItem('homedash_play_on', t); } catch { /* ignore */ } };

  // Library tab
  useEffect(() => {
    if (query.trim()) return;
    let cancelled = false;
    setItems(null); setError('');
    library(tab.kind, tab.orderBy, tab.limit).then(r => { if (!cancelled) setItems(r); }).catch(e => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, [tab, query]);

  // Search (waits until you stop typing)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setArtist(null);
    let cancelled = false;
    const t = setTimeout(() => {
      setError('');
      search(q).then(r => { if (!cancelled) setResults(r); }).catch(e => { if (!cancelled) setError(friendlyError(e)); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const show = (text: string, kind: 'info' | 'ok' | 'error', ms = 3500) => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    if (ms) toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  // One request at a time, so repeated taps don't start competing Spotify streams.
  const run = async (item: MediaItem, enqueue: 'replace' | 'add') => {
    if (busy) return;
    setBusy(true);
    show(enqueue === 'add' ? `Adding ${item.name}…` : `Starting ${item.name} on ${targetName}…`, 'info', 0);
    try {
      await play(target, item, enqueue);
      show(enqueue === 'add' ? `Added ${item.name} to the queue` : `Playing ${item.name} on ${targetName}`, 'ok');
    } catch (e) {
      show(friendlyError(e), 'error', 7000);
    } finally {
      setBusy(false);
    }
  };
  const actions: Actions = { onPlay: i => run(i, 'replace'), onQueue: i => run(i, 'add'), onOpen: setArtist, busy };

  const shownItems = useMemo(() => {
    if (!items || tab.id !== 'artists' || !artistFilter.trim()) return items;
    const f = artistFilter.trim().toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(f));
  }, [items, tab.id, artistFilter]);

  const toastStyle = toast?.kind === 'error' ? 'bg-rose-600' : toast?.kind === 'ok' ? 'bg-emerald-600' : 'bg-slate-900';

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
      {artist ? (
        <ArtistView artist={artist} a={actions} onBack={() => setArtist(null)} />
      ) : (
        <>
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
              shownItems === null ? <Loading /> : (
                <>
                  {tab.id === 'artists' && (
                    <div className="flex items-center gap-3 mb-4">
                      <input value={artistFilter} onChange={e => setArtistFilter(e.target.value)} placeholder="Filter your artists…"
                        className="flex-1 bg-slate-50 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-100" />
                      <span className="text-xs font-bold text-slate-400 whitespace-nowrap">{shownItems.length} artists</span>
                    </div>
                  )}
                  {shownItems.length === 0 ? <Loading>Nothing here yet.</Loading>
                    : tab.kind === 'track'
                      ? <div className="space-y-1">{shownItems.slice(0, 40).map(i => <TrackRow key={i.uri} item={i} a={actions} />)}</div>
                      : <Grid>{shownItems.map(i => <Tile key={i.uri} item={i} a={actions} queue={i.kind === 'album'} />)}</Grid>}
                </>
              )
            )}

            {/* Search results */}
            {query.trim() && !error && (
              results === null ? <Loading>Searching…</Loading> : (
                <div>
                  {results.tracks.length > 0 && <>
                    <SectionTitle>Songs</SectionTitle>
                    <div className="space-y-1">{results.tracks.slice(0, 5).map(i => <TrackRow key={i.uri} item={i} a={actions} />)}</div>
                  </>}
                  {results.artists.length > 0 && <>
                    <SectionTitle>Artists</SectionTitle>
                    <Grid>{results.artists.slice(0, 6).map(i => <Tile key={i.uri} item={i} a={actions} />)}</Grid>
                  </>}
                  {results.albums.length > 0 && <>
                    <SectionTitle>Albums</SectionTitle>
                    <Grid>{results.albums.slice(0, 6).map(i => <Tile key={i.uri} item={i} a={actions} queue />)}</Grid>
                  </>}
                  {results.playlists.length > 0 && <>
                    <SectionTitle>Playlists</SectionTitle>
                    <Grid>{results.playlists.slice(0, 6).map(i => <Tile key={i.uri} item={i} a={actions} />)}</Grid>
                  </>}
                  {results.radio.length > 0 && <>
                    <SectionTitle>Radio</SectionTitle>
                    <Grid>{results.radio.slice(0, 6).map(i => <Tile key={i.uri} item={i} a={actions} />)}</Grid>
                  </>}
                  {!results.tracks.length && !results.artists.length && !results.albums.length && !results.playlists.length && !results.radio.length && (
                    <Loading>No results for "{query}".</Loading>
                  )}
                </div>
              )
            )}
          </div>
        </>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[160] ${toastStyle} text-white font-bold px-5 py-3 rounded-2xl shadow-2xl max-w-[90vw] flex items-center gap-3`}>
          {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </Card>
  );
};

export default MusicBrowser;
