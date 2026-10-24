// lib/items.ts
// Suggestions for the "add an item" boxes: things you've added before on this device
// (most used first), plus every recipe ingredient and pantry item.

import { useSyncExternalStore } from 'react';

const KEY = 'homedash_item_history';
type History = Record<string, { name: string; count: number; last: number }>;

const load = (): History => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
let history: History = load();
let catalog: string[] = [];
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };

const tidy = (s: string) => s.replace(/\s*\(.*\)\s*$/, '').replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Remember something that was added, so it's suggested first next time. */
export const recordItem = (raw: string) => {
  const name = cap(tidy(raw));
  if (!name) return;
  const key = name.toLowerCase();
  const prev = history[key];
  history = { ...history, [key]: { name, count: (prev?.count || 0) + 1, last: Date.now() } };
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch { /* storage blocked */ }
  emit();
};

/** Recipe ingredients and pantry items, set by the app whenever they change. */
export const setItemCatalog = (names: string[]) => {
  const next = [...new Set(names.map(n => tidy(n).toLowerCase()).filter(Boolean))].sort();
  if (next.join('|') === catalog.join('|')) return;
  catalog = next;
  emit();
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const useVersion = () => useSyncExternalStore(subscribe, () => version);

/** Up to `limit` suggestions for what's been typed so far, leaving out anything in `exclude`. */
export const useItemSuggestions = (query: string, exclude: string[] = [], limit = 6): string[] => {
  useVersion();
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const skip = new Set(exclude.map(e => tidy(e).toLowerCase()));
  skip.add(q);
  const scored = new Map<string, { name: string; score: number }>();
  const consider = (name: string, bonus: number) => {
    const key = name.toLowerCase();
    if (skip.has(key) || scored.has(key) && scored.get(key)!.score >= bonus) return;
    const at = key.indexOf(q);
    if (at < 0) return;
    const wordStart = at === 0 || key[at - 1] === ' ';
    if (!wordStart) return;
    scored.set(key, { name: cap(name), score: bonus + (at === 0 ? 1000 : 0) });
  };
  Object.values(history).forEach(h => consider(h.name, 100 + Math.min(h.count, 50) * 10));
  catalog.forEach(c => consider(c, 0));
  return [...scored.values()].sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, limit).map(s => s.name);
};
