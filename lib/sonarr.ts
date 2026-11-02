// lib/sonarr.ts
// Find TV shows and send them to Sonarr to download, through Home Assistant.
// Home Assistant talks to Sonarr with two rest_command services (sonarr_get / sonarr_post, set up
// in configuration.yaml, see the README), so Sonarr's API key stays in Home Assistant and never
// reaches the browser. Works inside Home Assistant and over Tailscale alike.

import { hassStore } from './hass';

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

/** Thrown when the rest_command services haven't been added to Home Assistant yet. */
export class SonarrNotSetUp extends Error {}

const errorText = (content: any, status: number) => {
  if (Array.isArray(content) && content[0]?.errorMessage) return content.map((c: any) => c.errorMessage).join(' ');
  if (content?.message) return content.message;
  if (status === 401) return 'Sonarr refused the API key. Check sonarr_api_key in secrets.yaml.';
  return `Sonarr said ${status}`;
};

async function call(service: 'sonarr_get' | 'sonarr_post', data: Record<string, any>) {
  const hass = hassStore.get();
  if (!hass) throw new Error('Finding new shows needs Home Assistant. Connect to home and try again.');
  let r: any;
  try {
    r = await hass.callWS({ type: 'call_service', domain: 'rest_command', service, service_data: data, return_response: true });
  } catch (e: any) {
    const m = `${e?.code || ''} ${e?.message || e}`;
    if (/not.?found|unknown (service|action)/i.test(m)) throw new SonarrNotSetUp('Sonarr isn\'t connected to Home Assistant yet.');
    if (/timeout|cannot connect|client ?error/i.test(m)) throw new Error('Home Assistant couldn\'t reach Sonarr. Is the Sonarr add-on running?');
    throw new Error(e?.message || 'Couldn\'t reach Sonarr');
  }
  const res = r?.response || {};
  let content = res.content;
  if (typeof content === 'string') { try { content = JSON.parse(content); } catch { /* leave as text */ } }
  const status = Number(res.status || 0);
  if (status >= 400) throw new Error(errorText(content, status));
  return content;
}

const get = (path: string) => call('sonarr_get', { path });
const post = (path: string, body: any) => call('sonarr_post', { path, body });

const posterOf = (s: any): string | undefined =>
  s.remotePoster || (s.images || []).find((i: any) => i.coverType === 'poster')?.remoteUrl || undefined;

/** Search for shows by name. Shows already in Sonarr say so, with how many episodes are in. */
export async function searchShows(term: string): Promise<ShowResult[]> {
  const [found, library] = await Promise.all([
    get(`series/lookup?term=${encodeURIComponent(term)}`),
    get('series').catch(() => []),
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
  const [profiles, folders, library] = await Promise.all([get('qualityprofile'), get('rootfolder'), get('series').catch(() => [])]);
  if (!folders?.length) throw new Error('Sonarr has no TV folder set up yet.');
  if (!profiles?.length) throw new Error('Sonarr has no quality profiles.');
  // Use whatever quality the family already picks most, else Sonarr's first profile.
  const counts = new Map<number, number>();
  (library || []).forEach((s: any) => counts.set(s.qualityProfileId, (counts.get(s.qualityProfileId) || 0) + 1));
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const qualityProfileId = profiles.some((p: any) => p.id === used) ? used : profiles[0].id;

  const added = await post('series', {
    ...show.raw,
    qualityProfileId,
    rootFolderPath: folders[0].path,
    monitored: true,
    seasonFolder: true,
    addOptions: { monitor, searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false },
  });
  return added;
}
