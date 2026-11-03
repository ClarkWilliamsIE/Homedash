// components/home/TvView.tsx
// TV shows from Jellyfin: a card on the home screen and a full page to pick a show, season and
// episode and play it on the living room TV (in the Jellyfin app). Episodes get a watched tick and a progress bar,
// and "Continue watching" picks up where you left off.

import React, { useEffect, useMemo, useState } from 'react';
import { useEntities, useEntity } from '../../lib/hass';
import {
  CAST_TV, MediaNode, TvProgress, currentTv, loadJellyfinPlayers, useJellyfinPlayers, allTitles, browse, continueWatching, fmtMins, livePosition, playOnTv,
  pictureUrl, playingItemId, progressFor, setWatched, tvControl, tvSeekBy, useTvProgress,
} from '../../lib/tv';
import { Panel } from '../ui';
import { MoreLink } from './controls';
import { HomeIcons } from './icons';
import NewShowSearch, { FindKind } from './NewShowSearch';

// --- Small pieces ---------------------------------------------------------------------------

const Poster: React.FC<{ src?: string; title: string; wide?: boolean; className?: string }> = ({ src: thumb, title, wide, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    setFailed(false);
    pictureUrl(thumb).then(u => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [thumb]);
  return (
    <div className={`relative overflow-hidden bg-slate-200 ${wide ? 'aspect-video' : 'aspect-[2/3]'} ${className}`}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-display text-slate-500">{title}</span>}
    </div>
  );
};

const Bar: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`h-1.5 rounded-full bg-black/10 overflow-hidden ${className}`}>
    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }} />
  </div>
);

const Tick: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

/** What's on the TV now (a Jellyfin episode), with simple controls. */
const useNowPlaying = () => {
  // Watch the Jellyfin app's player(s) and the Chromecast; show whichever is playing.
  const players = useJellyfinPlayers();
  useEffect(() => { loadJellyfinPlayers(); }, []);
  useEntities([...players, CAST_TV]);
  const s = useEntity(currentTv());
  const progress = useTvProgress();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 5000); return () => clearInterval(t); }, []);
  const id = playingItemId(s?.attributes);
  if (!id || !s || !['playing', 'paused', 'buffering'].includes(s.state)) return null;
  const meta = progress.find(p => p.id === id);
  const dur = Number(s.attributes.media_duration || meta?.dur || 0);
  const pos = livePosition(s.attributes, s.state);
  return { id, state: s.state, pos, dur, meta };
};

const NowOnTv: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const now = useNowPlaying();
  if (!now) return null;
  const label = now.state === 'buffering' ? 'Starting on the TV…' : now.state === 'paused' ? 'Paused on the TV' : 'On the TV now';
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-indigo-50 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="w-24 shrink-0 rounded-xl overflow-hidden"><Poster wide src={now.meta?.thumb} title={now.meta?.title || ''} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-indigo-800 font-semibold">{label}</p>
        <p className="font-semibold text-slate-900 truncate">{now.meta?.title || 'TV show'}</p>
        {now.meta?.show && <p className="text-sm text-slate-500 truncate">{now.meta.show}{now.meta.episode ? ` · Episode ${now.meta.episode}` : ''}</p>}
        {now.dur > 0 && <Bar value={now.pos / now.dur} className="mt-1.5" />}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!compact && <button aria-label="Back 30 seconds" onClick={() => tvSeekBy(-30)} className="w-10 h-10 rounded-full text-slate-600 hover:bg-white text-xs font-bold">−30</button>}
        <button aria-label={now.state === 'playing' ? 'Pause the TV' : 'Play the TV'} onClick={() => tvControl('media_play_pause')}
          className="w-11 h-11 rounded-full bg-indigo-700 text-white flex items-center justify-center">
          {now.state === 'playing' ? <HomeIcons.Pause className="w-5 h-5" /> : <HomeIcons.Play className="w-5 h-5 ml-0.5" />}
        </button>
        {!compact && <button aria-label="Forward 30 seconds" onClick={() => tvSeekBy(30)} className="w-10 h-10 rounded-full text-slate-600 hover:bg-white text-xs font-bold">+30</button>}
        <button aria-label="Stop the TV" onClick={() => tvControl('media_stop')} className="w-10 h-10 rounded-full text-slate-500 hover:bg-white flex items-center justify-center"><HomeIcons.Close className="w-5 h-5" /></button>
      </div>
    </div>
  );
};

/** One "continue watching" tile. */
const ResumeTile: React.FC<{ p: TvProgress; onError: (m: string) => void }> = ({ p, onError }) => (
  <button
    onClick={() => playOnTv({ id: `media-source://jellyfin/${p.id}`, title: p.title, kind: 'episode', playable: true, thumb: p.thumb }, {}, { resumeAt: p.pos }).catch(e => onError(e?.message || 'Couldn\'t play it'))}
    className="text-left group">
    <div className="relative rounded-2xl overflow-hidden">
      <Poster wide src={p.thumb} title={p.title} />
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
        <span className="w-12 h-12 rounded-full bg-white/90 text-indigo-700 flex items-center justify-center shadow"><HomeIcons.Play className="w-5 h-5 ml-0.5" /></span>
      </span>
      <Bar value={p.pos / p.dur} className="absolute left-2 right-2 bottom-2 !bg-white/40" />
    </div>
    <p className="mt-1.5 font-semibold text-slate-900 truncate">{p.title}</p>
    <p className="text-sm text-slate-500 truncate">{p.show ? `${p.show} · ` : ''}{fmtMins(p.dur - p.pos)} left</p>
  </button>
);

// --- Home screen card ---------------------------------------------------------------------

export const TvCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const progress = useTvProgress();
  const resume = continueWatching(progress).slice(0, 2);
  const [titles, setTitles] = useState<MediaNode[] | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { allTitles().then(setTitles).catch(() => setTitles([])); }, []);
  return (
    <Panel title="TV" action={<MoreLink onClick={onOpen}>All shows</MoreLink>}>
      <div className="space-y-4">
        <NowOnTv compact />
        {resume.length > 0 ? (
          <div>
            <p className="text-sm font-semibold text-slate-600 mb-2">Continue watching</p>
            <div className="grid grid-cols-2 gap-3">{resume.map(p => <ResumeTile key={p.id} p={p} onError={setMsg} />)}</div>
          </div>
        ) : titles && titles.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {titles.slice(0, 3).map(t => (
              <button key={t.id} onClick={onOpen} className="text-left">
                <Poster src={t.thumb} title={t.title} className="rounded-xl" />
                <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{t.title}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">{titles === null ? 'Loading shows…' : 'No shows in Jellyfin yet.'}</p>
        )}
        {msg && <p className="text-sm font-semibold text-rose-700">{msg}</p>}
      </div>
    </Panel>
  );
};

// --- The page -----------------------------------------------------------------------------

const EpisodeRow: React.FC<{ ep: MediaNode; n: number; show: string; season: string; onError: (m: string) => void }> = ({ ep, n, show, season, onError }) => {
  const progress = useTvProgress();
  const p = progressFor(progress, ep);
  const started = p && !p.done && p.pos > 60 && p.dur > 0;
  const [starting, setStarting] = useState(false);
  const meta = { show, season, episode: n };
  const play = (resumeAt?: number) => {
    setStarting(true);
    playOnTv(ep, meta, { resumeAt }).catch(e => onError(e?.message || 'Couldn\'t play it')).finally(() => setTimeout(() => setStarting(false), 4000));
  };
  return (
    <li className="flex items-center gap-4 p-2 rounded-2xl hover:bg-slate-50">
      <button onClick={() => play(started ? p!.pos : undefined)} className="relative w-36 sm:w-44 shrink-0 rounded-xl overflow-hidden" aria-label={`Play ${ep.title} on the TV`}>
        <Poster wide src={ep.thumb} title={ep.title} />
        {started && <Bar value={p!.pos / p!.dur} className="absolute left-2 right-2 bottom-2 !bg-white/40" />}
        {p?.done && <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-indigo-700 text-white flex items-center justify-center"><Tick className="w-3.5 h-3.5" /></span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500">Episode {n}</p>
        <p className={`font-semibold truncate ${p?.done ? 'text-slate-500' : 'text-slate-900'}`}>{ep.title}</p>
        <p className="text-sm text-slate-500">{p?.done ? 'Watched' : started ? `${fmtMins(p!.dur - p!.pos)} left` : p?.dur ? fmtMins(p.dur) : ' '}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => setWatched(ep, meta, !p?.done)} aria-pressed={!!p?.done}
          className={`hidden sm:flex h-10 px-3 rounded-xl text-sm font-semibold items-center gap-1.5 ${p?.done ? 'bg-indigo-50 text-indigo-800' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Tick /> {p?.done ? 'Watched' : 'Mark watched'}
        </button>
        <button onClick={() => setWatched(ep, meta, !p?.done)} aria-label={p?.done ? 'Mark as not watched' : 'Mark as watched'}
          className={`sm:hidden w-10 h-10 rounded-xl flex items-center justify-center ${p?.done ? 'bg-indigo-50 text-indigo-800' : 'text-slate-400'}`}><Tick /></button>
        <button onClick={() => play(started ? p!.pos : undefined)} disabled={starting}
          className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
          {starting ? 'Starting…' : <><HomeIcons.Play className="w-3.5 h-3.5" /> {started ? 'Resume' : 'Play'}</>}
        </button>
      </div>
    </li>
  );
};

const ShowPage: React.FC<{ show: MediaNode; onBack: () => void }> = ({ show, onBack }) => {
  const [seasons, setSeasons] = useState<MediaNode[] | null>(null);
  const [season, setSeason] = useState<MediaNode | null>(null);
  const [episodes, setEpisodes] = useState<MediaNode[] | null>(null);
  const [error, setError] = useState('');
  const progress = useTvProgress();

  useEffect(() => {
    browse(show.id).then(list => {
      // A film or a show with episodes straight under it has no seasons.
      const hasSeasons = list.some(n => !n.playable);
      setSeasons(hasSeasons ? list.filter(n => !n.playable) : []);
      if (!hasSeasons) setEpisodes(list);
    }).catch(e => setError(e?.message || 'Couldn\'t load the show'));
  }, [show.id]);

  // Open the season you're part way through (else the first with something unwatched).
  useEffect(() => {
    if (!seasons?.length || season) return;
    const pick = seasons.find(s => progress.some(p => p.season === s.title && p.show === show.title && !p.done)) || seasons[0];
    setSeason(pick);
  }, [seasons]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!season) return;
    setEpisodes(null);
    browse(season.id).then(setEpisodes).catch(e => setError(e?.message || 'Couldn\'t load the episodes'));
  }, [season?.id]);

  const watched = episodes?.filter(e => progressFor(progress, e)?.done).length || 0;
  const next = episodes?.find(e => !progressFor(progress, e)?.done);
  const nextN = next && episodes ? episodes.indexOf(next) + 1 : 0;
  const nextP = next ? progressFor(progress, next) : undefined;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-indigo-700 mb-4">
        <HomeIcons.Chevron className="w-4 h-4 rotate-180" /> All shows
      </button>
      <div className="flex gap-5 md:gap-8 items-end">
        <div className="w-28 md:w-40 shrink-0 rounded-2xl overflow-hidden shadow-md"><Poster src={show.thumb} title={show.title} /></div>
        <div className="min-w-0 pb-1">
          <h1 className="font-display text-3xl md:text-5xl leading-tight text-slate-900">{show.title}</h1>
          {episodes && <p className="text-slate-500 mt-1">{season ? `${season.title} · ` : ''}{watched} of {episodes.length} watched</p>}
          {next && (
            <button onClick={() => playOnTv(next, { show: show.title, season: season?.title, episode: nextN }, { resumeAt: nextP && !nextP.done ? nextP.pos : undefined }).catch(e => setError(e?.message || 'Couldn\'t play it'))}
              className="mt-4 h-12 px-5 rounded-2xl bg-indigo-700 text-white font-semibold flex items-center gap-2 shadow-sm">
              <HomeIcons.Play className="w-4 h-4" /> {nextP && nextP.pos > 60 && !nextP.done ? 'Resume' : 'Play'} episode {nextN} on the TV
            </button>
          )}
        </div>
      </div>

      {seasons && seasons.length > 1 && (
        <div className="flex gap-2 mt-6 overflow-x-auto pb-1">
          {seasons.map(s => (
            <button key={s.id} onClick={() => setSeason(s)}
              className={`h-10 px-4 rounded-xl text-sm font-semibold whitespace-nowrap ${season?.id === s.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {s.title}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p>}
      {episodes === null && !error ? <p className="mt-6 text-slate-500">Loading episodes…</p> : (
        <ul className="mt-5 space-y-1">
          {(episodes || []).map((ep, i) => (
            <EpisodeRow key={ep.id} ep={ep} n={i + 1} show={show.title} season={season?.title || ''} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
};

const TvView: React.FC = () => {
  const [titles, setTitles] = useState<MediaNode[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<MediaNode | null>(null);
  const [filter, setFilter] = useState('');
  const [finding, setFinding] = useState<FindKind | null>(null);
  const progress = useTvProgress();
  const resume = continueWatching(progress).slice(0, 4);

  useEffect(() => { allTitles().then(setTitles).catch(e => setError(e?.message || 'Couldn\'t reach Jellyfin')); }, []);
  const shown = useMemo(() => (titles || []).filter(t => t.title.toLowerCase().includes(filter.trim().toLowerCase())), [titles, filter]);

  return (
    <div className="max-w-6xl space-y-6 pb-16">
      <NowOnTv />
      {open ? <ShowPage show={open} onBack={() => setOpen(null)} /> : (
        <>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h1 className="font-display text-4xl text-slate-900">TV</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {(titles?.length || 0) > 8 && (
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a show…"
                  className="h-11 w-64 max-w-full bg-white border border-slate-200 rounded-2xl px-4 outline-none focus:ring-2 focus:ring-indigo-200" />
              )}
              {!finding && (
                <>
                  <button onClick={() => setFinding('show')} className="h-11 px-4 rounded-2xl bg-indigo-700 text-white font-semibold flex items-center gap-1.5 shadow-sm">
                    <span className="text-lg leading-none">+</span> Get a new show
                  </button>
                  <button onClick={() => setFinding('movie')} className="h-11 px-4 rounded-2xl bg-white border border-slate-200 text-indigo-800 font-semibold flex items-center gap-1.5 shadow-sm">
                    <span className="text-lg leading-none">+</span> Get a movie
                  </button>
                </>
              )}
            </div>
          </div>
          {finding && <NewShowSearch kind={finding} onKind={setFinding} onClose={() => setFinding(null)} />}
          {resume.length > 0 && (
            <section>
              <h2 className="font-display text-xl text-slate-900 mb-3">Continue watching</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{resume.map(p => <ResumeTile key={p.id} p={p} onError={setError} />)}</div>
            </section>
          )}
          <section>
            {resume.length > 0 && <h2 className="font-display text-xl text-slate-900 mb-3">All shows</h2>}
            {error && <p className="text-sm font-semibold text-rose-700 mb-3">{error}</p>}
            {titles === null && !error ? <p className="text-slate-500">Loading shows…</p> : shown.length === 0 ? (
              <p className="text-slate-500">{titles?.length ? 'No shows match.' : 'No shows in Jellyfin yet. Anything added to its Shows library appears here.'}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {shown.map(t => {
                  const seen = progress.filter(p => p.show === t.title);
                  return (
                    <button key={t.id} onClick={() => setOpen(t)} className="text-left">
                      <Poster src={t.thumb} title={t.title} className="rounded-2xl shadow-sm" />
                      <p className="mt-1.5 font-semibold text-slate-900 truncate">{t.title}</p>
                      <p className="text-sm text-slate-500 truncate">{seen.some(p => p.done) ? `${seen.filter(p => p.done).length} watched` : ' '}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default TvView;
