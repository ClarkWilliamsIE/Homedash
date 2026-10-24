// ha-panel.tsx
// Homedash as a Home Assistant dashboard card ("custom:homedash-panel").
// Home Assistant loads this script from the Vercel site, then gives the card its `hass`
// object, so Homedash can read and control the house with your normal Home Assistant login.
// Built by scripts/build-ha.mjs into dist/ha/homedash-panel.js.

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from './App';
import { hassStore, Hass } from './lib/hass';
import { setApiBase } from './lib/runtime';

declare const __PANEL_CSS__: string;
declare const __PANEL_PROPERTIES__: string;

// The PIN login and recipe import live on the Vercel site this script was loaded from.
setApiBase(new URL(import.meta.url).origin);

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap';

const ensureDocumentStyles = () => {
  if (document.getElementById('homedash-global')) return;
  // Fonts and CSS @property rules only work when registered on the page itself, not inside the card.
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = FONT_URL;
  document.head.appendChild(font);
  const props = document.createElement('style');
  props.id = 'homedash-global';
  props.textContent = __PANEL_PROPERTIES__;
  document.head.appendChild(props);
};

class HomedashPanel extends HTMLElement {
  private root?: Root;
  private config: Record<string, any> = {};

  setConfig(config: Record<string, any>) {
    this.config = config || {};
  }

  set hass(hass: Hass) {
    hassStore.set(hass);
    if (!this.root) this.mount();
  }

  get hass(): Hass {
    return hassStore.get() as Hass;
  }

  getCardSize() {
    return 20;
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' };
  }

  connectedCallback() {
    if (!this.root && hassStore.get()) this.mount();
  }

  private mount() {
    ensureDocumentStyles();
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = __PANEL_CSS__;
    const container = document.createElement('div');
    container.className = 'hd-root';
    shadow.append(style, container);
    this.root = createRoot(container);
    this.root.render(
      <React.StrictMode>
        <App embedded />
      </React.StrictMode>
    );
  }
}

if (!customElements.get('homedash-panel')) {
  customElements.define('homedash-panel', HomedashPanel);
  (window as any).customCards = (window as any).customCards || [];
  (window as any).customCards.push({
    type: 'homedash-panel',
    name: 'Homedash',
    description: 'Family meal planner, recipes and shopping list with home controls.',
  });
  console.info('%c HOMEDASH %c panel loaded', 'background:#4f46e5;color:#fff;border-radius:3px;padding:2px 4px', '');
}
