// lib/haRemote.ts
// Connects the Homedash website/phone app straight to Home Assistant over its secure Tailscale
// address, when the phone can reach it (home Wi-Fi with Tailscale on, or anywhere with Tailscale).
// It builds the same `hass` object the kitchen iPad gets from Home Assistant, so lights, music
// and timers work unchanged. When Home Assistant can't be reached, the house tabs simply hide.

import { useSyncExternalStore } from 'react';
import { hassStore, Hass, HassEntity } from './hass';

export type RemoteStatus = 'off' | 'connecting' | 'connected' | 'unreachable';

let status: RemoteStatus = 'off';
const statusListeners = new Set<() => void>();
const setStatus = (s: RemoteStatus) => { status = s; statusListeners.forEach(l => l()); };
export const useRemoteStatus = () =>
  useSyncExternalStore(l => { statusListeners.add(l); return () => { statusListeners.delete(l); }; }, () => status);

let ws: WebSocket | null = null;
let creds: { url: string; token: string } | null = null;
let retryTimer: any = null;
let retryDelay = 5000;
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let states: Record<string, HassEntity> = {};
let user: any = null;
let publishTimer: any = null;

const publish = () => {
  if (publishTimer) return;
  // Batch bursts of updates (a whole room of lights changing at once) into one re-render.
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (!creds || status !== 'connected') return;
    hassStore.set(makeHass());
  }, 120);
};

const send = (msg: Record<string, any>): Promise<any> => new Promise((resolve, reject) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('Not connected to Home Assistant')); return; }
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ ...msg, id }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Home Assistant took too long to answer')); } }, 30000);
});

const makeHass = (): Hass => {
  const base = creds!.url;
  return {
    states,
    user,
    remote: true,
    hassUrl: (path = '') => `${base}${path}`,
    callWS: (msg: Record<string, any>) => send(msg),
    callService: (domain, service, data, target) =>
      send({ type: 'call_service', domain, service, service_data: data || {}, ...(target ? { target } : {}) }),
    callApi: async (method: string, path: string, body?: any) => {
      const r = await fetch(`${base}/api/${path}`, {
        method,
        headers: { Authorization: `Bearer ${creds!.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Home Assistant said ${r.status}`);
      const text = await r.text();
      return text ? JSON.parse(text) : null;
    },
  };
};

const failAll = (why: string) => {
  pending.forEach(p => p.reject(new Error(why)));
  pending.clear();
};

const scheduleRetry = () => {
  clearTimeout(retryTimer);
  if (!creds) return;
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
};

function connect() {
  if (!creds || (ws && ws.readyState <= WebSocket.OPEN)) return;
  if (!navigator.onLine) { setStatus('unreachable'); scheduleRetry(); return; }
  setStatus(status === 'connected' ? 'connected' : 'connecting');
  const socket = new WebSocket(`${creds.url.replace(/^http/, 'ws')}/api/websocket`);
  ws = socket;
  // Not reachable (no Tailscale, no signal): give up quickly rather than hang.
  const openTimer = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) socket.close(); }, 8000);

  socket.onmessage = async ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'auth_required') { socket.send(JSON.stringify({ type: 'auth', access_token: creds!.token })); return; }
    if (msg.type === 'auth_invalid') { console.warn('Homedash: Home Assistant token was refused'); socket.close(); return; }
    if (msg.type === 'auth_ok') {
      clearTimeout(openTimer);
      retryDelay = 5000;
      try {
        const [list, me] = await Promise.all([send({ type: 'get_states' }), send({ type: 'auth/current_user' })]);
        states = Object.fromEntries((list as HassEntity[]).map(e => [e.entity_id, e]));
        user = me;
        await send({ type: 'subscribe_events', event_type: 'state_changed' });
        setStatus('connected');
        hassStore.set(makeHass());
      } catch (err) { console.error('Homedash: Home Assistant setup failed', err); socket.close(); }
      return;
    }
    if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
      const { entity_id, new_state } = msg.event.data;
      if (new_state) states = { ...states, [entity_id]: new_state };
      else { const { [entity_id]: _gone, ...rest } = states; states = rest; }
      publish();
      return;
    }
    if (msg.type === 'result' && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.success) p.resolve(msg.result);
      else p.reject(new Error(msg.error?.message || 'Home Assistant refused that'));
    }
  };

  socket.onclose = () => {
    clearTimeout(openTimer);
    if (ws === socket) ws = null;
    failAll('Lost the connection to Home Assistant');
    if (status === 'connected' || status === 'connecting') hassStore.set(null);
    setStatus(creds ? 'unreachable' : 'off');
    scheduleRetry();
  };
  socket.onerror = () => { /* onclose follows */ };
}

/** Start (or keep) the connection. Safe to call repeatedly, e.g. after every sign-in. */
export const startRemoteHass = (url: string, token: string) => {
  const clean = url.replace(/\/+$/, '');
  if (creds && creds.url === clean && creds.token === token) {
    if (status !== 'connected') { retryDelay = 5000; connect(); }
    return;
  }
  stopRemoteHass();
  creds = { url: clean, token };
  connect();
};

export const stopRemoteHass = () => {
  creds = null;
  clearTimeout(retryTimer);
  if (ws) { const s = ws; ws = null; s.close(); }
  failAll('Disconnected');
  if (status === 'connected') hassStore.set(null);
  setStatus('off');
};

/** Try again straight away (coming back to the app, or back online). */
export const nudgeRemoteHass = () => {
  if (creds && status !== 'connected') { retryDelay = 5000; clearTimeout(retryTimer); connect(); }
};
