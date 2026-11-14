// lib/newworld.ts
// New World products and prices for the shopping list.
// Lookups go through this site's /api/newworld (which uses New World's public guest access),
// and are remembered on this device for a few hours so the list opens instantly.
// Which product the family buys for each item ("butter" → Pams Pure Butter 500g) is a
// NwChoice, saved with the rest of the shared state so every device agrees.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiUrl } from './runtime';

/** The store prices are looked up for. Change these three to shop somewhere else. */
export const NW_STORE = {
  id: 'f54433e6-5c6c-41b9-a5e2-d7502f454da8',
  name: 'New World Kapiti',
  site: 'https://www.newworld.co.nz',
};

export interface NwSpecial { price?: number; label: string; club: boolean }

export interface NwProduct {
  id: string;
  brand: string;
  name: string;
  size: string;
  /** Shelf price in cents (per kg for things sold by weight). */
  price: number | null;
  unitPrice: string;
  /** UNITS (each), WEIGHT (by the gram) or BOTH (loose produce you can buy each). */
  saleType: string;
  online: boolean;
  special?: NwSpecial;
}

/** The product the family buys for a shopping-list item. `productId: ''` means "not from New World". */
export interface NwChoice {
  /** The item's name in lower case, e.g. "butter". */
  id: string;
  productId: string;
  label: string;
  saleType: string;
}

export const nwKey = (itemName: string) => itemName.toLowerCase().replace(/\s+/g, ' ').trim();

export const productLabel = (p: Pick<NwProduct, 'brand' | 'name' | 'size'>) =>
  [p.brand, p.name, p.size && p.size !== 'kg' && p.size !== 'ea' ? p.size : ''].filter(Boolean).join(' ');

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const byWeight = (p: NwProduct) => p.saleType === 'WEIGHT' || p.saleType === 'BOTH' || p.size === 'kg';

/** "$7.19", or "$19.99/kg" for things sold by weight. */
export const priceText = (p: NwProduct) => (p.price == null ? '' : `${money(p.special?.price ?? p.price)}${byWeight(p) ? '/kg' : ''}`);

/** The shelf price before any special. */
export const shelfText = (p: NwProduct) => (p.price == null ? '' : `${money(p.price)}${byWeight(p) ? '/kg' : ''}`);

/** Grams sent to the trolley for things only sold by weight (mince, deli). */
export const DEFAULT_GRAMS = 500;

/** What one of this item adds to the estimated total, in cents. null when it can't be guessed
 *  (loose produce bought "each" is priced per kg). */
export const estimateCents = (p: NwProduct): number | null => {
  if (p.price == null) return null;
  const price = p.special?.price ?? p.price;
  if (p.saleType === 'WEIGHT') return Math.round(price * DEFAULT_GRAMS / 1000);
  if (p.saleType === 'BOTH' || p.size === 'kg') return null;
  return price;
};

/** What to ask the trolley for: one of it, or 500 g when it's only sold by weight. */
export const trolleyLine = (p: { id: string; saleType: string }, label: string) =>
  p.saleType === 'WEIGHT'
    ? { id: p.id, q: DEFAULT_GRAMS, t: 'WEIGHT', n: label }
    : { id: p.id, q: 1, t: 'UNITS', n: label };

// Recipe ingredients come with cooking words that confuse a shop search ("garlic cloves, crushed").
const NOISE = /\b(fresh|freshly|finely|roughly|thinly|chopped|diced|sliced|minced|grated|crushed|peeled|trimmed|halved|quartered|cubed|shredded|melted|softened|cooked|drained|rinsed|large|small|medium|ripe|optional|to taste|to serve|for serving|of)\b/g;
export const searchTerm = (itemName: string) => {
  const base = itemName.toLowerCase().replace(/\(.*?\)/g, ' ').split(',')[0];
  const cleaned = base.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || base.trim() || itemName;
};

// --- Talking to /api/newworld ---
export class NwUnavailable extends Error {}

async function api<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/newworld'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: NW_STORE.id, ...body }),
    });
  } catch {
    throw new NwUnavailable("Couldn't reach Homedash for New World prices.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new NwUnavailable(data?.error || `New World prices aren't available (${res.status}).`);
  return data as T;
}

export const searchProducts = (query: string, limit = 12) =>
  api<{ products: NwProduct[] }>({ action: 'search', query, limit }).then(r => r.products || []);

// --- What this device already knows (prices go stale, so entries expire) ---
const CACHE_KEY = 'homedash_nw_cache_v1';
const MATCH_TTL = 12 * 3600_000;
const PRICE_TTL = 6 * 3600_000;

interface Cache {
  /** search term → suggested products */
  match: Record<string, { at: number; products: NwProduct[] }>;
  /** product id → latest details */
  product: Record<string, { at: number; product: NwProduct }>;
}

const loadCache = (): Cache => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return { match: c.match || {}, product: c.product || {} };
  } catch { return { match: {}, product: {} }; }
};
let cache: Cache = loadCache();
let version = 0;
let lastError = '';
let busy = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };
const persist = () => {
  // Drop anything long out of date so this never grows without limit.
  const cutoff = Date.now() - 7 * 24 * 3600_000;
  for (const k of Object.keys(cache.match)) if (cache.match[k].at < cutoff) delete cache.match[k];
  for (const k of Object.keys(cache.product)) if (cache.product[k].at < cutoff) delete cache.product[k];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Remember a product the family just picked, so its price shows straight away. */
export const rememberProduct = (p: NwProduct) => {
  cache.product[p.id] = { at: Date.now(), product: p };
  persist();
  emit();
};

const pendingTerms = new Set<string>();
const pendingIds = new Set<string>();
const failedAt = { terms: 0, ids: 0 };
const RETRY_AFTER = 60_000;

async function fetchMatches(terms: string[]) {
  terms.forEach(t => pendingTerms.add(t));
  busy++; emit();
  try {
    for (let i = 0; i < terms.length; i += 15) {
      const chunk = terms.slice(i, i + 15);
      const { results } = await api<{ results: Record<string, NwProduct[]> }>({ action: 'match', items: chunk });
      const now = Date.now();
      chunk.forEach(t => {
        const products = results?.[t] || [];
        cache.match[t] = { at: now, products };
        products.forEach(p => { cache.product[p.id] = { at: now, product: p }; });
      });
      lastError = '';
      persist(); emit();
    }
  } catch (e: any) {
    lastError = e?.message || 'New World prices are unavailable.';
    failedAt.terms = Date.now();
  } finally {
    terms.forEach(t => pendingTerms.delete(t));
    busy--; emit();
  }
}

async function fetchDetails(ids: string[]) {
  ids.forEach(i => pendingIds.add(i));
  busy++; emit();
  try {
    const { products } = await api<{ products: NwProduct[] }>({ action: 'details', ids });
    const now = Date.now();
    (products || []).forEach(p => { cache.product[p.id] = { at: now, product: p }; });
    // Anything New World no longer lists keeps its old details but isn't asked for again for a while.
    ids.forEach(id => { if (cache.product[id]) cache.product[id].at = now; });
    lastError = '';
    persist();
  } catch (e: any) {
    lastError = e?.message || 'New World prices are unavailable.';
    failedAt.ids = Date.now();
  } finally {
    ids.forEach(i => pendingIds.delete(i));
    busy--; emit();
  }
}

export interface NwRowMatch {
  /** The product for this item: the family's choice, or the best guess. */
  product?: NwProduct;
  /** True when the family picked this product; false when it's New World's top result. */
  chosen: boolean;
  /** The family said this item doesn't come from New World. */
  skipped: boolean;
  /** Other products to offer in the swap list. */
  suggestions: NwProduct[];
  loading: boolean;
}

export interface NwState {
  matches: Map<string, NwRowMatch>;
  error: string;
  loading: boolean;
  retry: () => void;
}

/** Products and prices for a set of shopping-list item names. */
export function useNewWorld(itemNames: string[], choices: NwChoice[], enabled = true): NwState {
  const v = useSyncExternalStore(subscribe, () => version);
  const [retryTick, setRetryTick] = useState(0);
  const keys = useMemo(() => [...new Set(itemNames.map(nwKey).filter(Boolean))].sort(), [itemNames.join('|')]);
  const choiceMap = useMemo(() => new Map(choices.map(c => [c.id, c])), [choices]);

  // Ask for whatever isn't known yet (or has gone stale).
  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    const now = Date.now();
    const terms: string[] = [];
    const ids: string[] = [];
    for (const key of keys) {
      const choice = choiceMap.get(key);
      if (choice) {
        if (!choice.productId) continue;
        const known = cache.product[choice.productId];
        if ((!known || now - known.at > PRICE_TTL) && !pendingIds.has(choice.productId)) ids.push(choice.productId);
        continue;
      }
      const term = searchTerm(key);
      const known = cache.match[term];
      if ((!known || now - known.at > MATCH_TTL) && !pendingTerms.has(term)) terms.push(term);
    }
    const uniqueTerms = [...new Set(terms)];
    if (uniqueTerms.length && now - failedAt.terms > RETRY_AFTER) fetchMatches(uniqueTerms);
    if (ids.length && now - failedAt.ids > RETRY_AFTER) fetchDetails([...new Set(ids)]);
  }, [keys, choiceMap, enabled, retryTick]);

  const matches = useMemo(() => {
    const out = new Map<string, NwRowMatch>();
    for (const key of keys) {
      const term = searchTerm(key);
      const suggestions = cache.match[term]?.products || [];
      const choice = choiceMap.get(key);
      if (choice) {
        const product = choice.productId ? cache.product[choice.productId]?.product : undefined;
        out.set(key, {
          product: product || (choice.productId
            ? { id: choice.productId, brand: '', name: choice.label, size: '', price: null, unitPrice: '', saleType: choice.saleType, online: true }
            : undefined),
          chosen: true,
          skipped: !choice.productId,
          suggestions,
          loading: !!choice.productId && !product && pendingIds.has(choice.productId),
        });
      } else {
        out.set(key, {
          product: suggestions.find(p => p.online) || suggestions[0],
          chosen: false,
          skipped: false,
          suggestions,
          loading: !cache.match[term] && pendingTerms.has(term),
        });
      }
    }
    return out;
  }, [keys, choiceMap, v]);

  return {
    matches,
    error: lastError,
    loading: busy > 0,
    retry: () => { failedAt.terms = 0; failedAt.ids = 0; lastError = ''; setRetryTick(t => t + 1); emit(); },
  };
}

// --- Handing the list to New World ---
export interface TrolleyLine { id: string; q: number; t: string; n: string }

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The list, packed small enough to ride along in a web address. */
export const trolleyPayload = (lines: TrolleyLine[]) =>
  toBase64Url(JSON.stringify({ v: 1, store: NW_STORE.id, storeName: NW_STORE.name, items: lines }));

/** New World's home page with the list attached after the #, where only the bookmark reads it. */
export const trolleyLink = (lines: TrolleyLine[]) => `${NW_STORE.site}/#homedash=${trolleyPayload(lines)}`;
