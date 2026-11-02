// components/home/NewShowSearch.tsx
// "Get a new show" / "Get a movie" on the TV page: search by name and send it to Sonarr (TV) or
// Radarr (films), which find and download it. It turns up under All shows (from Jellyfin) once
// it has finished downloading.

import React, { useState } from 'react';
import { ArrNotSetUp } from '../../lib/arr';
import { MonitorChoice, addShow, searchShows } from '../../lib/sonarr';
import { addMovie, searchMovies } from '../../lib/radarr';
import { HomeIcons } from './icons';

export type FindKind = 'show' | 'movie';

/** One search result, the same shape for shows and films. */
interface Found {
  key: string;
  title: string;
  poster?: string;
  facts: string;
  overview?: string;
  inLibrary: boolean;
  /** What to say when it's already in Sonarr/Radarr */
  libraryNote: string;
  /** Options to pick from before adding (shows), or none to add straight away (films) */
  choices: { value: MonitorChoice; label: string }[] | null;
  add: (choice?: MonitorChoice) => Promise<unknown>;
}

const SHOW_CHOICES: { value: MonitorChoice; label: string }[] = [
  { value: 'all', label: 'Whole show' },
  { value: 'firstSeason', label: 'Season 1 only' },
  { value: 'latestSeason', label: 'Latest season' },
];

const join = (bits: (string | number | null | undefined | false)[]) => bits.filter(Boolean).join(' · ');

async function find(kind: FindKind, term: string): Promise<Found[]> {
  if (kind === 'show') {
    return (await searchShows(term)).map(s => ({
      key: `tv-${s.tvdbId}`,
      title: s.title,
      poster: s.poster,
      facts: join([s.year, s.network, s.seasons ? `${s.seasons} season${s.seasons === 1 ? '' : 's'}` : null, s.status === 'ended' && 'Ended']),
      overview: s.overview,
      inLibrary: s.inLibrary,
      libraryNote: s.want ? `Already getting this · ${s.have || 0} of ${s.want} episodes in` : 'Already getting this',
      choices: SHOW_CHOICES,
      add: (c?: MonitorChoice) => addShow(s, c || 'all'),
    }));
  }
  return (await searchMovies(term)).map(m => ({
    key: `film-${m.tmdbId}`,
    title: m.title,
    poster: m.poster,
    facts: join([m.year, m.certification, m.runtime ? `${Math.floor(m.runtime / 60) ? `${Math.floor(m.runtime / 60)}h ` : ''}${m.runtime % 60}m` : null, m.studio]),
    overview: m.overview,
    inLibrary: m.inLibrary,
    libraryNote: m.downloaded ? 'Already got this' : 'Already getting this · still downloading',
    choices: null,
    add: () => addMovie(m),
  }));
}

const SearchPoster: React.FC<{ src?: string; title: string }> = ({ src, title }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative w-20 sm:w-24 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-slate-200">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-display text-slate-500">{title}</span>}
    </div>
  );
};

const Tick = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

const ResultRow: React.FC<{ item: Found; kind: FindKind }> = ({ item, kind }) => {
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<'idle' | 'adding' | 'added'>(item.inLibrary ? 'added' : 'idle');
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState('');

  const add = async (choice?: MonitorChoice) => {
    setState('adding');
    setError('');
    try {
      await item.add(choice);
      setState('added');
      setJustAdded(true);
      setPicking(false);
    } catch (e: any) {
      setError(e?.message || 'Couldn\'t add it');
      setState('idle');
    }
  };

  return (
    <li className="flex gap-4 p-2 rounded-2xl hover:bg-slate-50">
      <SearchPoster src={item.poster} title={item.title} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900">{item.title}</p>
        {item.facts && <p className="text-sm text-slate-500">{item.facts}</p>}
        {item.overview && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.overview}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {state === 'added' ? (
            <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
              <Tick />
              {justAdded
                ? kind === 'show' ? 'Added. Episodes appear under All shows as they finish downloading.' : 'Added. It appears under All shows once it has downloaded.'
                : item.libraryNote}
            </p>
          ) : picking && item.choices ? (
            <>
              {item.choices.map(c => (
                <button key={c.value} onClick={() => add(c.value)} disabled={state === 'adding'}
                  className="h-10 px-3.5 rounded-xl bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60">
                  {c.label}
                </button>
              ))}
              <button onClick={() => setPicking(false)} disabled={state === 'adding'} className="h-10 px-3 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
              {state === 'adding' && <span className="text-sm text-slate-500">Adding…</span>}
            </>
          ) : (
            <button onClick={() => (item.choices ? setPicking(true) : add())} disabled={state === 'adding'}
              className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" /></svg>
              {state === 'adding' ? 'Adding…' : kind === 'show' ? 'Get this show' : 'Get this movie'}
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </li>
  );
};

const NewShowSearch: React.FC<{ kind: FindKind; onKind: (k: FindKind) => void; onClose: () => void }> = ({ kind, onKind, onClose }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notSetUp, setNotSetUp] = useState<string | null>(null);

  const run = async (k: FindKind, e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true);
    setError('');
    setNotSetUp(null);
    try {
      setResults(await find(k, term));
    } catch (err: any) {
      setResults(null);
      if (err instanceof ArrNotSetUp) setNotSetUp(err.app);
      else setError(err?.message || 'Couldn\'t search');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (k: FindKind) => {
    if (k === kind) return;
    onKind(k);
    setResults(null);
    setNotSetUp(null);
    setError('');
    if (q.trim()) run(k);
  };

  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex gap-1 p-1 rounded-2xl bg-slate-100">
          {(['show', 'movie'] as FindKind[]).map(k => (
            <button key={k} onClick={() => switchTo(k)} aria-pressed={kind === k}
              className={`h-10 px-4 rounded-xl text-sm font-semibold ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              {k === 'show' ? 'TV show' : 'Movie'}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center"><HomeIcons.Close className="w-5 h-5" /></button>
      </div>

      <form onSubmit={e => run(kind, e)} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus enterKeyHint="search"
          placeholder={kind === 'show' ? 'Search for a TV show…' : 'Search for a movie…'}
          className="h-12 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-2xl px-4 outline-none focus:ring-2 focus:ring-indigo-200" />
        <button type="submit" disabled={busy || !q.trim()} className="h-12 px-5 rounded-2xl bg-slate-900 text-white font-semibold disabled:opacity-50">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {notSetUp && (
        <p className="mt-4 text-sm text-slate-600 bg-amber-50 rounded-2xl p-3">
          {notSetUp === 'radarr' ? 'Radarr' : 'Sonarr'} isn't connected to Home Assistant yet. Add the <code>{notSetUp}_get</code> and <code>{notSetUp}_post</code> REST
          commands from the README (section “Get a new show or movie”), restart Home Assistant and try again.
        </p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}

      {results && (
        results.length === 0
          ? <p className="mt-4 text-slate-500">Nothing found. Try a different spelling.</p>
          : <ul className="mt-4 space-y-1">{results.map(r => <ResultRow key={r.key} item={r} kind={kind} />)}</ul>
      )}
    </section>
  );
};

export default NewShowSearch;
