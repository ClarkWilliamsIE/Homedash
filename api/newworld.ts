// api/newworld.ts
// Looks up New World and PAK'nSAVE products and prices for the shopping list (POST banner: 'nw' | 'pns').
// It uses the same public "guest" access the New World website gives any visitor who isn't
// signed in, so no New World login or password is involved and none is stored anywhere.
// Putting things in your trolley is NOT done here: that happens in your own signed-in New World
// tab, with the "Fill trolley from Homedash" bookmark (see lib/nwBookmarklet.ts).
//
// POST { action: 'match',   items: ['butter', 'milk'] }        → { results: { butter: Product[], milk: Product[] } }
// POST { action: 'search',  query: 'butter 500g', limit: 12 }  → { products: Product[] }
// POST { action: 'details', ids: ['5023660-EA-000'] }          → { products: Product[] }
// Optional on every call: storeId (defaults to NW_STORE_ID, else New World Kapiti).
//
// This is New World's own website API, not a published one. If they change it, lookups stop
// working and the shopping list carries on without prices.

// Both Foodstuffs supermarkets run on the same system; only the web addresses differ.
type Banner = 'nw' | 'pns';
const BANNERS: Record<Banner, { site: string; api: string; store: string; name: string }> = {
  nw: { site: 'https://www.newworld.co.nz', api: 'https://api-prod.newworld.co.nz/v1/edge', name: 'New World',
    store: process.env.NW_STORE_ID || 'f54433e6-5c6c-41b9-a5e2-d7502f454da8' }, // New World Kapiti
  pns: { site: 'https://www.paknsave.co.nz', api: 'https://api-prod.paknsave.co.nz/v1/edge', name: "PAK'nSAVE",
    store: process.env.PNS_STORE_ID || 'c180a72d-5dbe-4403-b7c7-91655e505492' }, // PAK'nSAVE Kapiti
};
const REGION = process.env.NW_REGION === 'SI' ? 'SI' : 'NI';
const UA = 'Homedash/1.0 (family shopping list)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[0-9A-Za-z_-]{3,40}$/;

// Same rule as api/importRecipe.ts: lets the Homedash panel inside Home Assistant call this.
const HOME_ORIGIN = /^https?:\/\/(homeassistant\.local|[a-z0-9-]+\.local|localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const NABU_CASA = /^https:\/\/[a-z0-9]+\.ui\.nabu\.casa$/;

function applyCors(req: any, res: any): boolean {
  const origin: string | undefined = req.headers?.origin;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && (HOME_ORIGIN.test(origin) || NABU_CASA.test(origin) || extra.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export interface NwSpecial {
  /** Price in cents with the special, when it's a simple "new price for one". */
  price?: number;
  label: string;
  /** Needs a Club+ card. */
  club: boolean;
}

export interface NwProduct {
  id: string;
  brand: string;
  name: string;
  size: string;
  /** Shelf price in cents. */
  price: number | null;
  unitPrice: string;
  saleType: string;
  online: boolean;
  special?: NwSpecial;
}

class Upstream extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// --- Guest tokens, one per supermarket (kept for the life of this server instance) ---
const tokens: Record<string, { token: string; expires: number; request: Promise<string> | null }> = {};

function guestToken(b: Banner, fetchFn: typeof fetch = fetch): Promise<string> {
  const t = (tokens[b] ||= { token: '', expires: 0, request: null });
  if (t.token && Date.now() < t.expires - 60_000) return Promise.resolve(t.token);
  // Several lookups starting together share one sign-in.
  t.request ||= (async () => {
    const r = await fetchFn(`${BANNERS[b].site}/api/user/get-current-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
    });
    if (!r.ok) throw new Upstream(r.status, `${BANNERS[b].name} refused the guest sign-in (${r.status})`);
    const j: any = await r.json();
    if (!j?.access_token) throw new Upstream(502, `${BANNERS[b].name} gave no guest token`);
    t.token = j.access_token;
    t.expires = Date.parse(j.expires_time) || Date.now() + 10 * 60_000;
    return t.token;
  })().finally(() => { t.request = null; });
  return t.request;
}

async function call(b: Banner, path: string, body: any, fetchFn: typeof fetch = fetch, retry = true): Promise<any> {
  const r = await fetchFn(`${BANNERS[b].api}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await guestToken(b, fetchFn)}`, 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify(body),
  });
  if (r.status === 401 && retry) { if (tokens[b]) tokens[b].token = ''; return call(b, path, body, fetchFn, false); }
  if (!r.ok) throw new Upstream(r.status, `${BANNERS[b].name} said ${r.status}`);
  return r.json();
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The best current special on a product, in plain words. */
export function specialOf(p: any): NwSpecial | undefined {
  const promos: any[] = Array.isArray(p?.promotions) ? p.promotions : [];
  if (!promos.length) return undefined;
  const best = promos.find(x => x.bestPromotion) || promos[0];
  const club = !!best.cardDependencyFlag;
  const value = Number(best.rewardValue);
  const threshold = Number(best.threshold || 1);
  if (best.rewardType === 'NEW_PRICE' && Number.isFinite(value) && value > 0) {
    if (threshold <= 1) return { price: value, label: `${club ? 'Club+ ' : 'Special '}${money(value)}`, club };
    return { label: `${club ? 'Club+ ' : ''}${threshold} for ${money(value)}`, club };
  }
  return { label: club ? 'Club+ deal' : 'On special', club };
}

export function slim(p: any): NwProduct | null {
  if (!p?.productId || !p?.name) return null;
  const single = p.singlePrice || {};
  const cp = single.comparativePrice;
  const special = specialOf(p);
  return {
    id: String(p.productId),
    brand: p.brand || '',
    name: p.name,
    size: p.displayName || '',
    price: typeof single.price === 'number' ? single.price : null,
    unitPrice: cp && typeof cp.pricePerUnit === 'number' ? `${money(cp.pricePerUnit)}/${cp.measureDescription || cp.unitQuantityUom || ''}` : '',
    saleType: p.saleType || 'UNITS',
    online: Array.isArray(p.availability) ? p.availability.includes('ONLINE') : true,
    ...(special ? { special } : {}),
  };
}

export async function search(b: Banner, query: string, storeId: string, limit: number, fetchFn: typeof fetch = fetch): Promise<NwProduct[]> {
  const r = await call(b, '/search/paginated/products', {
    algoliaQuery: {
      attributesToHighlight: [],
      attributesToRetrieve: ['productID', 'Type', 'sponsored'],
      facets: [],
      filters: `stores:${storeId}`,
      hitsPerPage: limit,
      page: 0,
      query,
    },
    algoliaFacetQueries: [],
    storeId,
    hitsPerPage: limit,
    page: 0,
    sortOrder: `${REGION}_POPULARITY_ASC`,
    tobaccoQuery: false,
    precisionMedia: { adDomain: 'SEARCH_PAGE', adPositions: [], publishImpressionEvent: false, disableAds: true },
  }, fetchFn);
  return (r?.products || []).map(slim).filter(Boolean) as NwProduct[];
}

export async function details(b: Banner, ids: string[], storeId: string, fetchFn: typeof fetch = fetch): Promise<NwProduct[]> {
  if (!ids.length) return [];
  const r = await call(b, `/store/${storeId}/decorateProducts`, { productIds: ids }, fetchFn);
  return (r?.products || []).map(slim).filter(Boolean) as NwProduct[];
}

/** Run `work` over `items`, a few at a time, so New World isn't hit with a burst. */
async function pooled<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  }));
  return out;
}

const cleanText = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {};
  const b: Banner = body.banner === 'pns' ? 'pns' : 'nw';
  const storeId = UUID.test(String(body.storeId || '')) ? String(body.storeId) : BANNERS[b].store;

  try {
    if (body.action === 'match') {
      const items: string[] = [...new Set((Array.isArray(body.items) ? body.items : []).map((i: unknown) => cleanText(i, 80)).filter(Boolean))].slice(0, 20) as string[];
      const found = await pooled(items, 3, async item => {
        try { return await search(b, item, storeId, 6); }
        catch (e) { if (e instanceof Upstream && (e.status === 403 || e.status === 429)) throw e; return []; }
      });
      return res.status(200).json({ results: Object.fromEntries(items.map((item, i) => [item, found[i]])) });
    }
    if (body.action === 'search') {
      const query = cleanText(body.query, 80);
      if (!query) return res.status(400).json({ error: 'Nothing to search for' });
      const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 24);
      return res.status(200).json({ products: await search(b, query, storeId, limit) });
    }
    if (body.action === 'details') {
      const ids: string[] = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter((i: string) => PRODUCT_ID.test(i)))].slice(0, 60) as string[];
      return res.status(200).json({ products: await details(b, ids, storeId) });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err: any) {
    console.error('newworld lookup failed', err);
    const status = err instanceof Upstream ? err.status : 0;
    const blocked = status === 403 || status === 429;
    return res.status(502).json({
      error: blocked ? `${BANNERS[b].name} isn't answering price lookups from here right now.` : `Couldn't reach ${BANNERS[b].name}. Try again in a minute.`,
      upstream: status || undefined,
    });
  }
}
