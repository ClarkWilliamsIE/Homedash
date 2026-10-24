// api/alexa.ts
// The "Homedash" Alexa skill: "Alexa, ask Homedash to add milk" puts milk on the family
// shopping list (the same Google Sheet the app uses), from any Alexa speaker, including the Sonos.
//
// Set up once (see README, "Alexa"):
//   ALEXA_SKILL_ID  the skill's ID from the Alexa developer console (amzn1.ask.skill.…)
// Uses the same GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN as api/getToken.

const SHEET_ID = process.env.SHEET_ID || '1IwqSELEbCQPAzM9-o5d1g4lXuuGzcev7F1kJeFjpihQ';
const SYNC_CELL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SyncData!A1`;

const say = (text: string, endSession = true, reprompt?: string) => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    ...(reprompt ? { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } } } : {}),
    shouldEndSession: endSession,
  },
});

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // Only answer our own skill, and only fresh requests.
  const skillId = body?.context?.System?.application?.applicationId || body?.session?.application?.applicationId;
  if (!process.env.ALEXA_SKILL_ID || skillId !== process.env.ALEXA_SKILL_ID) {
    return res.status(403).json({ error: 'Unknown skill' });
  }
  const sent = Date.parse(body?.request?.timestamp || '');
  if (!sent || Math.abs(Date.now() - sent) > 150 * 1000) {
    return res.status(400).json({ error: 'Stale request' });
  }

  const request = body.request || {};
  const intent = request.intent?.name;

  try {
    if (request.type === 'LaunchRequest') {
      return res.json(say("Homedash here. What should I add to the shopping list?", false, 'Say, add, and then what you need.'));
    }
    if (request.type === 'SessionEndedRequest') return res.json({ version: '1.0', response: {} });

    if (intent === 'AddItemIntent') {
      const spoken: string = request.intent.slots?.item?.value || '';
      const items = splitItems(spoken);
      if (!items.length) return res.json(say("Sorry, I didn't catch what to add. Try, add milk.", false, 'What should I add?'));

      const token = await googleToken();
      const state = await readState(token);
      const list: any[] = state.manualItems || [];
      const already = items.filter(n => list.some(i => !i.checked && String(i.name).toLowerCase() === n.toLowerCase()));
      const added = items.filter(n => !already.includes(n));
      const now = Date.now();
      added.forEach((name, k) => list.push({ id: `${now + k}`, name, checked: false }));
      // Bring something back if it had been marked as bought for this week's recipes.
      const cleared: string[] = state.clearedIngredients || [];
      state.clearedIngredients = cleared.filter(c => !added.some(a => a.toLowerCase() === c));
      state.manualItems = list;
      if (added.length) await writeState(token, state);

      const parts = [
        added.length ? `Added ${listWords(added)} to the shopping list.` : '',
        already.length ? `${listWords(already)} ${already.length === 1 ? 'is' : 'are'} already on it.` : '',
      ];
      return res.json(say(parts.filter(Boolean).join(' ')));
    }

    if (intent === 'ReadListIntent') {
      const token = await googleToken();
      const { manual, recipe } = stillToBuy(await readState(token));
      const total = manual.length + recipe.length;
      if (!total) return res.json(say('The shopping list is empty.'));
      const first = [...manual, ...recipe].slice(0, 10);
      const more = total - first.length;
      return res.json(say(`There ${total === 1 ? 'is one thing' : `are ${total} things`} on the list: ${listWords(first)}${more ? `, and ${more} more` : ''}.`));
    }

    if (intent === 'AMAZON.HelpIntent') {
      return res.json(say('You can say, add milk and bread, or, what\'s on the list. What would you like?', false, 'What should I add?'));
    }
    if (intent === 'AMAZON.FallbackIntent') {
      return res.json(say("Sorry, I can only add things to the shopping list or read it out. Try, add milk.", false, 'What should I add?'));
    }
    // Stop, Cancel, NavigateHome and anything else
    return res.json(say('Okay.'));
  } catch (err: any) {
    console.error('Alexa skill error', err);
    return res.json(say("Sorry, I couldn't reach the family shopping list just now. Try again in a minute."));
  }
}
