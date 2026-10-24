// api/addItem.ts
// Add to the family shopping list from anywhere that can send a web request: the "Add to Homedash"
// Siri shortcut on the iPhones ("Hey Siri, add to Homedash" → "milk and bread"), a widget, etc.
// POST { "pin": "<family PIN>", "text": "milk, bread and eggs" } → { "message": "Added Milk, Bread and Eggs…" }
// Uses the same Google settings as api/getToken.

const SHEET_ID = process.env.SHEET_ID || '1IwqSELEbCQPAzM9-o5d1g4lXuuGzcev7F1kJeFjpihQ';
const SYNC_CELL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SyncData!A1`;

async function googleToken(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error('No Google token');
  return t.access_token;
}

async function readState(token: string): Promise<any> {
  const r = await fetch(`${SYNC_CELL}?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Sheet read failed (${r.status})`);
  const raw = (await r.json()).values?.[0]?.[0];
  return raw ? JSON.parse(raw) : {};
}

async function writeState(token: string, state: any) {
  const r = await fetch(`${SYNC_CELL}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[JSON.stringify(state)]] }),
  });
  if (!r.ok) throw new Error(`Sheet write failed (${r.status})`);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "milk, bread and two lemons" → ["Milk", "Bread", "Two lemons"] */
// Things that have "and" in their name, so they aren't split in two.
const PAIRS = ['mac and cheese', 'macaroni and cheese', 'salt and pepper', 'fish and chips', 'sweet and sour', 'salt and vinegar', 'bread and butter', 'cheese and onion', 'sweet and salty'];
const splitItems = (spoken: string) =>
  PAIRS.reduce((s, p) => s.replace(new RegExp(p, 'gi'), m => m.replace(/ and /i, ' & ')), spoken)
    .replace(/^(some|a|an)\s+/i, '')
    .replace(/\s+(to|on|onto)\s+(the|my|our)\s+(shopping\s+)?list$/i, '')
    .split(/\s*(?:,|\band\b|\balso\b)\s*/i)
    .map(s => s.replace(/^(some|a|an)\s+/i, '').trim())
    .filter(Boolean)
    .map(cap);

const listWords = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** What's still to buy: one-off items plus this week's recipe ingredients (same rules as the app). */
const stillToBuy = (s: any) => {
  const manual: string[] = (s.manualItems || []).filter((i: any) => !i.checked).map((i: any) => i.name);
  const hidden: string[] = s.hiddenIngredients || [];
  const cleared: string[] = s.clearedIngredients || [];
  const checked: string[] = s.checkedIngredients || [];
  const recipe = new Set<string>();
  Object.values(s.weeklyPlan || {}).flat().forEach((r: any) => (r.ingredients || []).forEach((ing: any) => {
    const n = String(ing.item || '').toLowerCase().trim();
    if (n && !hidden.includes(n) && !cleared.includes(n) && !checked.includes(n)) recipe.add(n);
  }));
  return { manual, recipe: [...recipe] };
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: any, res: any) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Use POST' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return { text: req.body }; } })() : req.body || {};

  if (!process.env.FAMILY_PIN || String(body.pin || '') !== process.env.FAMILY_PIN) {
    return res.status(401).json({ message: "That PIN didn't work." });
  }
  const items = splitItems(String(body.text || body.item || ''));
  if (!items.length) return res.status(400).json({ message: "I didn't catch what to add." });

  try {
    const token = await googleToken();
    const state = await readState(token);
    const list: any[] = state.manualItems || [];
    const already = items.filter(n => list.some(i => !i.checked && String(i.name).toLowerCase() === n.toLowerCase()));
    const added = items.filter(n => !already.includes(n));
    const now = Date.now();
    added.forEach((name, k) => list.push({ id: `${now + k}`, name, checked: false }));
    state.clearedIngredients = (state.clearedIngredients || []).filter((c: string) => !added.some(a => a.toLowerCase() === c));
    state.manualItems = list;
    if (added.length) await writeState(token, state);
    const message = [
      added.length ? `Added ${listWords(added)} to the shopping list.` : '',
      already.length ? `${listWords(already)} ${already.length === 1 ? 'is' : 'are'} already on it.` : '',
    ].filter(Boolean).join(' ');
    return res.status(200).json({ message, added, already });
  } catch (err: any) {
    console.error('addItem failed', err);
    return res.status(500).json({ message: "Couldn't reach the shopping list. Try again in a minute." });
  }
}
