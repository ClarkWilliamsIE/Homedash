// lib/arr.ts
// Shared plumbing for Sonarr (TV) and Radarr (films). Home Assistant talks to them with
// rest_command services (sonarr_get / sonarr_post / radarr_get / radarr_post, set up in
// configuration.yaml, see the README), so their API keys stay in Home Assistant and never
// reach the browser. Works inside Home Assistant and over Tailscale alike.

import { hassStore } from './hass';

export type ArrApp = 'sonarr' | 'radarr';

const NAMES: Record<ArrApp, string> = { sonarr: 'Sonarr', radarr: 'Radarr' };

/** Thrown when the rest_command services haven't been added to Home Assistant yet. */
export class ArrNotSetUp extends Error {
  constructor(public app: ArrApp) { super(`${NAMES[app]} isn't connected to Home Assistant yet.`); }
}

const errorText = (app: ArrApp, content: any, status: number) => {
  if (Array.isArray(content) && content[0]?.errorMessage) return content.map((c: any) => c.errorMessage).join(' ');
  if (content?.message) return content.message;
  if (status === 401) return `${NAMES[app]} refused the API key. Check ${app}_api_key in secrets.yaml.`;
  return `${NAMES[app]} said ${status}`;
};

async function call(app: ArrApp, method: 'get' | 'post', data: Record<string, any>) {
  const hass = hassStore.get();
  if (!hass) throw new Error('This needs Home Assistant. Connect to home and try again.');
  let r: any;
  try {
    r = await hass.callWS({ type: 'call_service', domain: 'rest_command', service: `${app}_${method}`, service_data: data, return_response: true });
  } catch (e: any) {
    const m = `${e?.code || ''} ${e?.message || e}`;
    if (/not.?found|unknown (service|action)/i.test(m)) throw new ArrNotSetUp(app);
    if (/timeout|cannot connect|client ?error/i.test(m)) throw new Error(`Home Assistant couldn't reach ${NAMES[app]}. Is the add-on running?`);
    throw new Error(e?.message || `Couldn't reach ${NAMES[app]}`);
  }
  const res = r?.response || {};
  let content = res.content;
  if (typeof content === 'string') { try { content = JSON.parse(content); } catch { /* leave as text */ } }
  const status = Number(res.status || 0);
  if (status >= 400) throw new Error(errorText(app, content, status));
  return content;
}

export const arrGet = (app: ArrApp, path: string) => call(app, 'get', { path });
export const arrPost = (app: ArrApp, path: string, body: any) => call(app, 'post', { path, body });

/** A poster address from a Sonarr/Radarr lookup record. */
export const posterOf = (s: any): string | undefined =>
  s.remotePoster || (s.images || []).find((i: any) => i.coverType === 'poster')?.remoteUrl || undefined;

/** The quality profile the family already picks most, else the app's first one. */
export async function pickProfile(app: ArrApp, library: any[]) {
  const profiles = await arrGet(app, 'qualityprofile');
  if (!profiles?.length) throw new Error(`${NAMES[app]} has no quality profiles.`);
  const counts = new Map<number, number>();
  (library || []).forEach((s: any) => counts.set(s.qualityProfileId, (counts.get(s.qualityProfileId) || 0) + 1));
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return profiles.some((p: any) => p.id === used) ? used : profiles[0].id;
}

export async function rootFolder(app: ArrApp) {
  const folders = await arrGet(app, 'rootfolder');
  if (!folders?.length) throw new Error(`${NAMES[app]} has no folder set up yet.`);
  return folders[0].path as string;
}
