// components/home/NewShowSearch.tsx
// "Get a new show" on the TV page: search for a show by name and send it to Sonarr, which finds
// and downloads the episodes. They turn up under All shows (from Jellyfin) as each one finishes.

import React, { useState } from 'react';
import { MonitorChoice, ShowResult, SonarrNotSetUp, addShow, searchShows } from '../../lib/sonarr';
import { HomeIcons } from './icons';

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

const CHOICES: { value: MonitorChoice; label: string }[] = [
  { value: 'all', label: 'Whole show' },
  { value: 'firstSeason', label: 'Season 1 only' },
  { value: 'latestSeason', label: 'Latest season' },
];

const ResultRow: React.FC<{ show: ShowResult }> = ({ show }) => {
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<'idle' | 'adding' | 'added'>(show.inLibrary ? 'added' : 'idle');
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState('');

  const add = async (monitor: MonitorChoice) => {
    setState('adding');
    setError('');
    try {
      await addShow(show, monitor);
      setState('added');
      setJustAdded(true);
      setPicking(false);
    } catch (e: any) {
      setError(e?.message || 'Couldn\'t add it');
      setState('idle');
    }
  };

  const facts = [show.year, show.network, show.seasons ? `${show.seasons} season${show.seasons === 1 ? '' : 's'}` : null, show.status === 'ended' ? 'Ended' : null]
    .filter(Boolean).join(' · ');

  return (
    <li className="flex gap-4 p-2 rounded-2xl hover:bg-slate-50">
      <SearchPoster src={show.poster} title={show.title} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900">{show.title}</p>
        {facts && <p className="text-sm text-slate-500">{facts}</p>}
        {show.overview && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{show.overview}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {state === 'added' ? (
            <p className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              {justAdded
                ? 'Added. Episodes appear under All shows as they finish downloading.'
                : show.want ? `Already getting this · ${show.have || 0} of ${show.want} episodes in` : 'Already getting this'}
            </p>
          ) : picking ? (
            <>
              {CHOICES.map(c => (
                <button key={c.value} onClick={() => add(c.value)} disabled={state === 'adding'}
                  className="h-10 px-3.5 rounded-xl bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60">
                  {c.label}
                </button>
              ))}
              <button onClick={() => setPicking(false)} disabled={state === 'adding'} className="h-10 px-3 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
              {state === 'adding' && <span className="text-sm text-slate-500">Adding…</span>}
            </>
          ) : (
            <button onClick={() => setPicking(true)} className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" /></svg>
              Get this show
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm font-semibold text-rose-700">{error}</p>}
      </div>
    </li>
  );
};

const NewShowSearch: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ShowResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notSetUp, setNotSetUp] = useState(false);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true);
    setError('');
    try {
      setResults(await searchShows(term));
    } catch (err: any) {
      if (err instanceof SonarrNotSetUp) setNotSetUp(true);
      else setError(err?.message || 'Couldn\'t search');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-2xl text-slate-900">Get a new show</h2>
        <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center"><HomeIcons.Close className="w-5 h-5" /></button>
      </div>

      <form onSubmit={run} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search for a TV show…" enterKeyHint="search"
          className="h-12 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-2xl px-4 outline-none focus:ring-2 focus:ring-indigo-200" />
        <button type="submit" disabled={busy || !q.trim()} className="h-12 px-5 rounded-2xl bg-slate-900 text-white font-semibold disabled:opacity-50">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {notSetUp && (
        <p className="mt-4 text-sm text-slate-600 bg-amber-50 rounded-2xl p-3">
          Sonarr isn't connected to Home Assistant yet. Add the <code>sonarr_get</code> and <code>sonarr_post</code> REST commands
          from the README (section “Get a new show”), restart Home Assistant and try again.
        </p>
      )}
      {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}

      {results && (
        results.length === 0
          ? <p className="mt-4 text-slate-500">Nothing found. Try a different spelling.</p>
          : <ul className="mt-4 space-y-1">{results.map(r => <ResultRow key={r.tvdbId} show={r} />)}</ul>
      )}
    </section>
  );
};

export default NewShowSearch;
