// lib/radarr.ts
// Find films and send them to Radarr to download, through Home Assistant (see lib/arr.ts).

import { arrGet, arrPost, pickProfile, posterOf, rootFolder } from './arr';

export interface MovieResult {
  tmdbId: number;
  title: string;
  year?: number;
  studio?: string;
  /** minutes */
  runtime?: number;
  certification?: string;
  overview?: string;
  poster?: string;
  /** Already in Radarr */
  inLibrary: boolean;
  /** Radarr has the file */
  downloaded?: boolean;
  /** Radarr's own lookup record, sent back when adding */
  raw: any;
}

/** Search for films by name. Films already in Radarr say so, and whether they've downloaded. */
export async function searchMovies(term: string): Promise<MovieResult[]> {
  const [found, library] = await Promise.all([
    arrGet('radarr', `movie/lookup?term=${encodeURIComponent(term)}`),
    arrGet('radarr', 'movie').catch(() => []),
  ]);
  const byTmdb = new Map<number, any>((library || []).map((m: any) => [m.tmdbId, m]));
  return (Array.isArray(found) ? found : []).filter((m: any) => m.tmdbId).slice(0, 20).map((m: any) => {
    const mine = byTmdb.get(m.tmdbId);
    return {
      tmdbId: m.tmdbId,
      title: m.title,
      year: m.year || undefined,
      studio: m.studio || undefined,
      runtime: m.runtime || undefined,
      certification: m.certification || undefined,
      overview: m.overview || undefined,
      poster: posterOf(m),
      inLibrary: !!mine,
      downloaded: !!mine?.hasFile,
      raw: m,
    };
  });
}

/** Add a film to Radarr and start looking for it straight away. */
export async function addMovie(movie: MovieResult) {
  const library = await arrGet('radarr', 'movie').catch(() => []);
  const [qualityProfileId, rootFolderPath] = await Promise.all([pickProfile('radarr', library), rootFolder('radarr')]);
  return arrPost('radarr', 'movie', {
    ...movie.raw,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    minimumAvailability: 'released',
    addOptions: { searchForMovie: true, monitor: 'movieOnly' },
  });
}
