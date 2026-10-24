// lib/kiosk.ts
// "Full screen" for the kitchen iPad: hides Home Assistant's top bar and side menu,
// on this device only (it's remembered in this browser, not shared).

import { useSyncExternalStore } from 'react';

const KEY = 'homedash_fullscreen';
let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
let on = read();

const KIOSK_CSS = `
  .header { display: none !important; }
  #view { padding-top: 0 !important; min-height: 100vh !important; }
`;

/** Walk up from the Homedash card to Home Assistant's dashboard frame. */
const findHuiRoot = (el: HTMLElement | null): HTMLElement | null => {
  let node: any = el;
  for (let i = 0; node && i < 12; i++) {
    if (node.tagName === 'HUI-ROOT') return node;
    node = node.getRootNode?.()?.host;
  }
  return null;
};

export const applyKiosk = () => {
  if (!host) return;
  host.toggleAttribute('kiosk', on);
  const root = findHuiRoot(host)?.shadowRoot;
  if (!root) return;
  const existing = root.getElementById('homedash-kiosk');
  if (on && !existing) {
    const style = document.createElement('style');
    style.id = 'homedash-kiosk';
    style.textContent = KIOSK_CSS;
    root.appendChild(style);
  } else if (!on && existing) {
    existing.remove();
  }
};

/** Called by the panel when it's on screen. */
export const registerPanelHost = (el: HTMLElement) => {
  host = el;
  applyKiosk();
  // Home Assistant may still be drawing the page; try again shortly.
  setTimeout(applyKiosk, 300);
  setTimeout(applyKiosk, 1500);
};

export const setFullscreen = (value: boolean) => {
  on = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* ignore */ }
  applyKiosk();
  // Ask Home Assistant to hide (or bring back) its side menu on this device.
  host?.dispatchEvent(new CustomEvent('hass-dock-sidebar', { detail: { dock: value ? 'always_hidden' : 'docked' }, bubbles: true, composed: true }));
  listeners.forEach(l => l());
};

export const useFullscreen = () =>
  useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => on);
