// lib/newworld.ts
// Supermarket products and prices for the shopping list: New World or PAK'nSAVE.
// Both are Foodstuffs stores on the same system and share product codes, so a product picked at
// one can be priced at the other. Lookups go through this site's /api/newworld (which uses the
// stores' public guest access), and are remembered on this device for a few hours.
// Which product the family buys for each item ("butter" → Pams Pure Butter 500g) is a
// NwChoice, saved with the rest of the shared state so every device agrees.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { apiUrl } from './runtime';

/** The supermarkets you can shop at. Change the ids and names to use other branches. */
export type Banner = 'nw' | 'pns';
export interface ShopStore { banner: Banner; id: string; name: string; short: string; site: string }
export const STORES: Record<Banner, ShopStore> = {
  nw: { banner: 'nw', id: 'f54433e6-5c6c-41b9-a5e2-d7502f454da8', name: 'New World Kapiti', short: 'New World', site: 'https://www.newworld.co.nz' },
  pns: { banner: 'pns', id: 'c180a72d-5dbe-4403-b7c7-91655e505492', name: "PAK'nSAVE Kapiti", short: "PAK'nSAVE", site: 'https://www.paknsave.co.nz' },
};
export const otherBanner = (b: Banner): Banner => (b === 'nw' ? 'pns' : 'nw');
/** @deprecated kept for older imports; use STORES / useStore(). */
export const NW_STORE = STORES.nw;

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

/** The product the family buys for a shopping-list item. `productId: ''` means "not from the supermarket". */
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
export const estimateCents = (p: NwProduct, q = defaultQty(p)): number | null => {
  if (p.price == null) return null;
  const price = p.special?.price ?? p.price;
  if (p.saleType === 'WEIGHT') return Math.round(price * q / 1000);
  if (p.saleType === 'BOTH' || p.size === 'kg') return null;
  return price * q;
};

// --- Which product is picked when the family hasn't chosen one ---
/** 'popular' takes the store's top result; 'value' takes the cheapest per 100 g / litre among the top few. */
export type PickMode = 'popular' | 'value';
const MODE_KEY = 'homedash_nw_pick';
let pickMode: PickMode = (() => { try { return localStorage.getItem(MODE_KEY) === 'value' ? 'value' : 'popular'; } catch { return 'popular'; } })();

const unitOf = (p: NwProduct) => {
  const m = /^\$([\d.]+)\/(.+)$/.exec(p.unitPrice || '');
  return m ? { cents: Math.round(parseFloat(m[1]) * 100), per: m[2] } : null;
};

/** The product to use for an item nobody has chosen for yet. */
export const pickDefault = (suggestions: NwProduct[], mode: PickMode): NwProduct | undefined => {
  const top = suggestions.find(p => p.online) || suggestions[0];
  if (!top || mode === 'popular') return top;
  // Only compare like with like (same "per 100g"), and only among the closest matches, so
  // "milk" can't turn into a cheap chocolate bar further down the results.
  const base = unitOf(top);
  if (!base) return top;
  let best = top, bestCents = base.cents;
  for (const p of suggestions.slice(0, 5)) {
    const u = unitOf(p);
    if (!p.online || !u || u.per !== base.per || p.saleType !== top.saleType) continue;
    if (u.cents < bestCents) { best = p; bestCents = u.cents; }
  }
  return best;
};

/** How much one tap of + or - changes the amount: one each, or 250 g for things sold by weight. */
export const qtyStep = (p: { saleType: string }) => (p.saleType === 'WEIGHT' ? 250 : 1);
/** The amount an item starts at: one of it, or 500 g when it's only sold by weight. */
export const defaultQty = (p: { saleType: string }) => (p.saleType === 'WEIGHT' ? DEFAULT_GRAMS : 1);
export const qtyText = (p: { saleType: string }, q: number) =>
  p.saleType === 'WEIGHT' ? (q >= 1000 ? `${+(q / 1000).toFixed(2)} kg` : `${q} g`) : String(q);

/** What to ask the trolley for. `q` is a count, or grams for things only sold by weight. */
export const trolleyLine = (p: { id: string; saleType: string }, label: string, q = defaultQty(p)) =>
  ({ id: p.id, q, t: p.saleType === 'WEIGHT' ? 'WEIGHT' : 'UNITS', n: label });

// Recipe ingredients come with cooking words that confuse a shop search ("garlic cloves, crushed").
const NOISE = /\b(fresh|freshly|finely|roughly|thinly|chopped|diced|sliced|minced|grated|crushed|peeled|trimmed|halved|quartered|cubed|shredded|melted|softened|cooked|drained|rinsed|large|small|medium|ripe|optional|to taste|to serve|for serving|of)\b/g;
export const searchTerm = (itemName: string) => {
  const base = itemName.toLowerCase().replace(/\(.*?\)/g, ' ').split(',')[0];
  const cleaned = base.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || base.trim() || itemName;
};

// --- Talking to /api/newworld ---
export class NwUnavailable extends Error {}

async function api<T>(b: Banner, body: Record<string, unknown>): Promise<T> {
  const store = STORES[b];
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/newworld'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banner: b, storeId: store.id, ...body }),
    });
  } catch {
    throw new NwUnavailable(`Couldn't reach Homedash for ${store.short} prices.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new NwUnavailable(data?.error || `${store.short} prices aren't available (${res.status}).`);
  return data as T;
}

export const searchProducts = (query: string, limit = 12, b: Banner = banner) =>
  api<{ products: NwProduct[] }>(b, { action: 'search', query, limit }).then(r => r.products || []);

// --- Which supermarket this device is shopping at ---
const BANNER_KEY = 'homedash_shop_store';
let banner: Banner = (() => { try { return localStorage.getItem(BANNER_KEY) === 'pns' ? 'pns' : 'nw'; } catch { return 'nw'; } })();

// --- What this device already knows (prices go stale, so entries expire) ---
// Keys start with the store ("nw|butter", "pns|5023660-EA-000"): prices differ between them.
const CACHE_KEY = 'homedash_nw_cache_v3';
const MATCH_TTL = 12 * 3600_000;
const PRICE_TTL = 6 * 3600_000;

interface Cache {
  /** store|search term → suggested products */
  match: Record<string, { at: number; products: NwProduct[] }>;
  /** store|product id → latest details */
  product: Record<string, { at: number; product: NwProduct }>;
  /** store|product id → when that store said it doesn't sell it */
  missing: Record<string, number>;
}

const loadCache = (): Cache => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return { match: c.match || {}, product: c.product || {}, missing: c.missing || {} };
  } catch { return { match: {}, product: {}, missing: {} }; }
};
let cache: Cache = loadCache();
let version = 0;
const lastError: Record<Banner, string> = { nw: '', pns: '' };
let busy = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };
const persist = () => {
  // Drop anything long out of date so this never grows without limit.
  const cutoff = Date.now() - 7 * 24 * 3600_000;
  for (const k of Object.keys(cache.match)) if (cache.match[k].at < cutoff) delete cache.match[k];
  for (const k of Object.keys(cache.product)) if (cache.product[k].at < cutoff) delete cache.product[k];
  for (const k of Object.keys(cache.missing)) if (cache.missing[k] < cutoff) delete cache.missing[k];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const k = (b: Banner, x: string) => `${b}|${x}`;

export const getBanner = () => banner;
export const setBanner = (b: Banner) => {
  banner = b;
  try { localStorage.setItem(BANNER_KEY, b); } catch { /* storage blocked */ }
  emit();
};
export const useBanner = () => useSyncExternalStore(subscribe, () => banner);
export const useStore = () => STORES[useBanner()];

export const getPickMode = () => pickMode;
export const setPickMode = (mode: PickMode) => {
  pickMode = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
  emit();
};
export const usePickMode = () => useSyncExternalStore(subscribe, () => pickMode);

/** Remember a product the family just picked, so its price shows straight away. */
export const rememberProduct = (p: NwProduct, b: Banner = banner) => {
  cache.product[k(b, p.id)] = { at: Date.now(), product: p };
  delete cache.missing[k(b, p.id)];
  persist();
  emit();
};

const pendingTerms = new Set<string>();
const pendingIds = new Set<string>();
const failedAt: Record<string, number> = {};
const RETRY_AFTER = 60_000;
const canTry = (what: string) => Date.now() - (failedAt[what] || 0) > RETRY_AFTER;

async function fetchMatches(b: Banner, terms: string[]) {
  terms.forEach(t => pendingTerms.add(k(b, t)));
  busy++; emit();
  try {
    for (let i = 0; i < terms.length; i += 15) {
      const chunk = terms.slice(i, i + 15);
      const { results } = await api<{ results: Record<string, NwProduct[]> }>(b, { action: 'match', items: chunk });
      const now = Date.now();
      chunk.forEach(t => {
        const products = results?.[t] || [];
        cache.match[k(b, t)] = { at: now, products };
        products.forEach(p => { cache.product[k(b, p.id)] = { at: now, product: p }; delete cache.missing[k(b, p.id)]; });
      });
      lastError[b] = '';
      persist(); emit();
    }
  } catch (e: any) {
    lastError[b] = e?.message || `${STORES[b].short} prices are unavailable.`;
    failedAt[`${b}:terms`] = Date.now();
  } finally {
    terms.forEach(t => pendingTerms.delete(k(b, t)));
    busy--; emit();
  }
}

async function fetchDetails(b: Banner, ids: string[]) {
  ids.forEach(i => pendingIds.add(k(b, i)));
  busy++; emit();
  try {
    for (let i = 0; i < ids.length; i += 60) {
      const chunk = ids.slice(i, i + 60);
      const { products } = await api<{ products: NwProduct[] }>(b, { action: 'details', ids: chunk });
      const now = Date.now();
      const found = new Set((products || []).map(p => p.id));
      (products || []).forEach(p => { cache.product[k(b, p.id)] = { at: now, product: p }; delete cache.missing[k(b, p.id)]; });
      // Not listed by this store: it doesn't sell it (or no longer does).
      chunk.forEach(id => { if (!found.has(id)) { cache.missing[k(b, id)] = now; delete cache.product[k(b, id)]; } });
    }
    lastError[b] = '';
    persist();
  } catch (e: any) {
    lastError[b] = e?.message || `${STORES[b].short} prices are unavailable.`;
    failedAt[`${b}:ids`] = Date.now();
  } finally {
    ids.forEach(i => pendingIds.delete(k(b, i)));
    busy--; emit();
  }
}

/** Ask for details of these products at this store, unless they're already known. */
const ensureDetails = (b: Banner, ids: string[]) => {
  const now = Date.now();
  const need = [...new Set(ids)].filter(id => {
    if (!id || pendingIds.has(k(b, id))) return false;
    const known = cache.product[k(b, id)];
    const gone = cache.missing[k(b, id)];
    return !(known && now - known.at < PRICE_TTL) && !(gone && now - gone < PRICE_TTL);
  });
  if (need.length && canTry(`${b}:ids`)) fetchDetails(b, need);
};

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
  /** The family's usual product, when this store doesn't sell it (a stand-in is picked instead). */
  notStocked?: string;
}

export interface NwState {
  matches: Map<string, NwRowMatch>;
  error: string;
  loading: boolean;
  retry: () => void;
}

/** Products and prices for a set of shopping-list item names, at the store this device is shopping at. */
export function useNewWorld(itemNames: string[], choices: NwChoice[], enabled = true): NwState {
  const v = useSyncExternalStore(subscribe, () => version);
  const b = useBanner();
  const [retryTick, setRetryTick] = useState(0);
  const keys = useMemo(() => [...new Set(itemNames.map(nwKey).filter(Boolean))].sort(), [itemNames.join('|')]);
  const choiceMap = useMemo(() => new Map(choices.map(c => [c.id, c])), [choices]);

  // Ask for whatever isn't known yet (or has gone stale): search results for every item (they
  // give the swap options, and a stand-in when the usual product isn't sold here), and the
  // latest details of each chosen product.
  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    const now = Date.now();
    const terms: string[] = [];
    const ids: string[] = [];
    for (const key of keys) {
      const choice = choiceMap.get(key);
      if (choice && !choice.productId) continue;
      if (choice) ids.push(choice.productId);
      const term = searchTerm(key);
      const known = cache.match[k(b, term)];
      if ((!known || now - known.at > MATCH_TTL) && !pendingTerms.has(k(b, term))) terms.push(term);
    }
    const uniqueTerms = [...new Set(terms)];
    if (uniqueTerms.length && canTry(`${b}:terms`)) fetchMatches(b, uniqueTerms);
    ensureDetails(b, ids);
  }, [keys, choiceMap, enabled, retryTick, b]);

  const matches = useMemo(() => {
    const out = new Map<string, NwRowMatch>();
    for (const key of keys) {
      const term = searchTerm(key);
      const suggestions = cache.match[k(b, term)]?.products || [];
      const searching = !cache.match[k(b, term)] && pendingTerms.has(k(b, term));
      const choice = choiceMap.get(key);
      if (choice && !choice.productId) {
        out.set(key, { chosen: true, skipped: true, suggestions, loading: false });
        continue;
      }
      if (choice) {
        const product = cache.product[k(b, choice.productId)]?.product;
        if (!product && cache.missing[k(b, choice.productId)]) {
          out.set(key, {
            product: pickDefault(suggestions, pickMode),
            chosen: false,
            skipped: false,
            suggestions,
            loading: searching,
            notStocked: choice.label,
          });
          continue;
        }
        out.set(key, {
          product: product || { id: choice.productId, brand: '', name: choice.label, size: '', price: null, unitPrice: '', saleType: choice.saleType, online: true },
          chosen: true,
          skipped: false,
          suggestions,
          loading: !product && pendingIds.has(k(b, choice.productId)),
        });
        continue;
      }
      out.set(key, { product: pickDefault(suggestions, pickMode), chosen: false, skipped: false, suggestions, loading: searching });
    }
    return out;
  }, [keys, choiceMap, v, b]);

  return {
    matches,
    error: lastError[b],
    loading: busy > 0,
    retry: () => {
      delete failedAt[`${b}:terms`]; delete failedAt[`${b}:ids`]; lastError[b] = '';
      setRetryTick(t => t + 1); emit();
    },
  };
}

export interface Comparison {
  store: ShopStore;
  /** Estimated cost here and there of the items both stores sell, in cents. */
  here: number;
  there: number;
  /** How many of the trolley's items were compared. */
  compared: number;
  /** Items the other store doesn't sell. */
  missing: number;
  loading: boolean;
}

/** The same trolley priced at the other store, product for product. */
export function useComparison(lines: { id: string; q: number; product: NwProduct }[], enabled = true): Comparison {
  const v = useSyncExternalStore(subscribe, () => version);
  const other = otherBanner(useBanner());
  const ids = lines.map(l => l.id).sort().join(',');
  useEffect(() => {
    if (enabled && navigator.onLine && ids) ensureDetails(other, ids.split(','));
  }, [ids, other, enabled]);
  return useMemo(() => {
    let here = 0, there = 0, compared = 0, missing = 0, loading = false;
    for (const l of lines) {
      if (cache.missing[k(other, l.id)]) { missing++; continue; }
      const p = cache.product[k(other, l.id)]?.product;
      if (!p) { if (pendingIds.has(k(other, l.id))) loading = true; continue; }
      const a = estimateCents(l.product, l.q), b2 = estimateCents(p, l.q);
      if (a == null || b2 == null) continue;
      here += a; there += b2; compared++;
    }
    return { store: STORES[other], here, there, compared, missing, loading };
  }, [lines, other, v]);
}

// --- Handing the list to the supermarket ---
export interface TrolleyLine { id: string; q: number; t: string; n: string }

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The list, packed small enough to ride along in a web address. */
export const trolleyPayload = (lines: TrolleyLine[], b: Banner = banner) =>
  toBase64Url(JSON.stringify({ v: 1, store: STORES[b].id, storeName: STORES[b].name, items: lines }));

/** The store's home page with the list attached after the #, where only the Homedash script reads it. */
export const trolleyLink = (lines: TrolleyLine[], b: Banner = banner) => `${STORES[b].site}/#homedash=${trolleyPayload(lines, b)}`;
