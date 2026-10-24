// lib/hass.ts
// A tiny store for the Home Assistant `hass` object.
// Home Assistant hands the panel a new `hass` object on every state change; components
// subscribe only to the entities they care about, so the rest of the app doesn't re-render.

import { useSyncExternalStore } from 'react';

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface Hass {
  states: Record<string, HassEntity>;
  callService: (domain: string, service: string, data?: Record<string, any>, target?: Record<string, any>) => Promise<any>;
  hassUrl?: (path?: string) => string;
  [key: string]: any;
}

let current: Hass | null = null;
const listeners = new Set<() => void>();

export const hassStore = {
  get: () => current,
  set: (hass: Hass) => {
    current = hass;
    listeners.forEach(l => l());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

/** True when Homedash is running inside Home Assistant. */
export const useIsHome = () => useSyncExternalStore(hassStore.subscribe, () => current !== null);

/** One entity's state object. Only re-renders when that entity changes. */
export const useEntity = (entityId?: string): HassEntity | undefined =>
  useSyncExternalStore(hassStore.subscribe, () => (entityId && current ? current.states[entityId] : undefined));

/** Several entities at once; re-renders when any of them change. */
export const useEntities = (entityIds: string[]): (HassEntity | undefined)[] => {
  const key = useSyncExternalStore(hassStore.subscribe, () =>
    current ? entityIds.map(id => current!.states[id]?.last_updated ?? '').join('|') : ''
  );
  // `key` changes whenever any listed entity updates; read fresh states for it.
  void key;
  return entityIds.map(id => current?.states[id]);
};

export const callService = (
  domain: string,
  service: string,
  data?: Record<string, any>,
  target?: Record<string, any>
) => {
  if (!current) return Promise.resolve();
  return current.callService(domain, service, data, target).catch((err: any) => {
    console.error(`Homedash: ${domain}.${service} failed`, err);
  });
};

export const runScript = (entityId: string) => callService('script', 'turn_on', undefined, { entity_id: entityId });

/** Turn a Home Assistant relative URL (e.g. album art) into one the page can load. */
export const hassAsset = (path?: string) => {
  if (!path) return undefined;
  if (/^https?:/.test(path)) return path;
  return current?.hassUrl ? current.hassUrl(path) : path;
};
