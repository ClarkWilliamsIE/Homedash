// lib/sonarr.ts
// Find TV shows and send them to Sonarr to download, through Home Assistant (see lib/arr.ts).

import { arrGet, arrPost, pickProfile, posterOf, rootFolder } from './arr';

export interface ShowResult {
  tvdbId: number;
  title: string;
  year?: number;
  network?: string;
  overview?: string;
  poster?: string;
  seasons: number;
  /** continuing / ended / upcoming */
  status?: string;
  /** Already in Sonarr */
  inLibrary: boolean;
  /** Episodes downloaded, and episodes Sonarr is after (only for shows already in Sonarr) */
  have?: number;
  want?: number;
  /** Sonarr's own lookup record, sent back when adding */
  raw: any;
}

/** Which episodes to get when adding a show. */
export type MonitorChoice = 'all' | 'firstSeason' | 'latestSeason';

/** Search for shows by name. Shows already in Sonarr say so, with how many episodes are in. */
export async function searchShows(term: string): Promise<ShowResult[]> {
  const [found, library] = await Promise.all([
    arrGet('sonarr', `series/lookup?term=${encodeURIComponent(term)}`),
    arrGet('sonarr', 'series').catch(() => []),
  ]);
  const byTvdb = new Map<number, any>((library || []).map((s: any) => [s.tvdbId, s]));
  return (Array.isArray(found) ? found : []).filter((s: any) => s.tvdbId).slice(0, 20).map((s: any) => {
    const mine = byTvdb.get(s.tvdbId);
    return {
      tvdbId: s.tvdbId,
      title: s.title,
      year: s.year || undefined,
      network: s.network || undefined,
      overview: s.overview || undefined,
      poster: posterOf(s),
      seasons: (s.seasons || []).filter((x: any) => x.seasonNumber > 0).length,
      status: s.status,
      inLibrary: !!mine,
      have: mine?.statistics?.episodeFileCount,
      want: mine?.statistics?.episodeCount,
      raw: s,
    };
  });
}

/** Add a show to Sonarr and start looking for its episodes straight away. */
export async function addShow(show: ShowResult, monitor: MonitorChoice) {
  const library = await arrGet('sonarr', 'series').catch(() => []);
  const [qualityProfileId, rootFolderPath] = await Promise.all([pickProfile('sonarr', library), rootFolder('sonarr')]);
  return arrPost('sonarr', 'series', {
    ...show.raw,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    seasonFolder: true,
    addOptions: { monitor, searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false },
  });
}
