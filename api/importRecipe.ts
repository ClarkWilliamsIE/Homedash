// api/importRecipe.ts
// Turns a recipe web page into a Homedash recipe.
// 1) Most recipe sites publish the recipe as structured data (schema.org JSON-LD), so we read that directly.
// 2) If a page doesn't, we send the page text to Gemini. The Gemini key stays on the server
//    (GEMINI_API_KEY environment variable in Vercel) instead of being shipped to every browser.

// Lets the Homedash panel inside Home Assistant (kitchen iPad, home network) call this API.
// Add more allowed sites with the ALLOWED_ORIGINS environment variable (comma-separated).
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

type Ingredient = { amount: string; unit: string; item: string };
type Instruction = { text: string; isHeader: boolean };

const UNITS = [
  'cups', 'cup', 'c', 'tablespoons', 'tablespoon', 'tbsp', 'tbs', 'tbsps', 'teaspoons', 'teaspoon', 'tsp', 'tsps',
  'grams', 'gram', 'g', 'kilograms', 'kilogram', 'kg', 'millilitres', 'milliliters', 'millilitre', 'milliliter', 'ml',
  'litres', 'liters', 'litre', 'liter', 'l', 'ounces', 'ounce', 'oz', 'pounds', 'pound', 'lb', 'lbs',
  'pinch', 'pinches', 'dash', 'cloves', 'clove', 'cans', 'can', 'tins', 'tin', 'pieces', 'piece', 'slices', 'slice',
  'handful', 'handfuls', 'bunch', 'bunches', 'sprigs', 'sprig', 'stalks', 'stalk', 'packets', 'packet', 'sticks', 'stick',
];
const FRACTIONS: Record<string, string> = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8' };

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function parseIngredient(raw: string): Ingredient {
  let s = decode(raw);
  for (const [k, v] of Object.entries(FRACTIONS)) s = s.replace(new RegExp(`(\\d)?\\s*${k}`, 'g'), (_, d) => (d ? `${d} ${v}` : v));
  const m = s.match(/^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?))\s*(.*)$/);
  if (!m) return { amount: '', unit: '', item: s };
  let amount = m[1].replace(',', '.').replace(/\s*[-–]\s*/, '-');
  // "1 1/2" → "1.5" so Homedash's scaling understands it
  const mixed = amount.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) amount = String(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]));
  let rest = m[2].trim();
  const glued = rest.match(/^([a-zA-Z]+)\b\.?\s*(.*)$/);
  let unit = '';
  if (glued && UNITS.includes(glued[1].toLowerCase())) { unit = glued[1]; rest = glued[2]; }
  return { amount, unit, item: rest.replace(/^of\s+/i, '') || s };
}

const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
const isRecipe = (node: any) => asArray(node?.['@type']).some((t: string) => String(t).toLowerCase() === 'recipe');

function findRecipe(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (isRecipe(node)) return node;
  for (const child of [...asArray(node['@graph']), ...(Array.isArray(node) ? node : [])]) {
    const found = findRecipe(child);
    if (found) return found;
  }
  if (node.mainEntity) return findRecipe(node.mainEntity);
  return null;
}

function instructionsFrom(x: any): Instruction[] {
  const out: Instruction[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n === 'string') {
      decode(n).split(/\n+|(?<=\.)\s{2,}/).map(t => t.trim()).filter(Boolean).forEach(text => out.push({ text, isHeader: false }));
    } else if (Array.isArray(n)) n.forEach(walk);
    else if (asArray(n['@type']).includes('HowToSection')) {
      if (n.name) out.push({ text: decode(n.name), isHeader: true });
      walk(n.itemListElement);
    } else if (n.text || n.name) out.push({ text: decode(n.text || n.name), isHeader: false });
    else if (n.itemListElement) walk(n.itemListElement);
  };
  walk(x);
  return out;
}

function imageFrom(x: any): string {
  const first = asArray(x)[0];
  if (!first) return '';
  return typeof first === 'string' ? first : first.url || first.contentUrl || '';
}

function fromJsonLd(html: string) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data: any;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const r = findRecipe(data);
    if (!r) continue;
    const tags = [...asArray(r.recipeCategory), ...asArray(r.recipeCuisine)]
      .concat(typeof r.keywords === 'string' ? r.keywords.split(',').slice(0, 3) : [])
      .map((t: string) => decode(String(t))).filter(Boolean);
    return {
      name: decode(r.name || ''),
      ingredients: asArray(r.recipeIngredient || r.ingredients).map((i: string) => parseIngredient(String(i))),
      instructions: instructionsFrom(r.recipeInstructions),
      tags: [...new Set(tags)].slice(0, 4).join(', '),
      imageUrl: imageFrom(r.image),
    };
  }
  return null;
}

async function fromGemini(url: string, html: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in Vercel');
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 30000);
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || '';
  const prompt = `Extract the recipe from this web page (${url}). Reply with JSON only, in this shape:
{ "name": "string", "ingredients": [ { "amount": "string", "unit": "string", "item": "string" } ], "instructions": [ { "text": "string", "isHeader": boolean } ], "tags": "comma separated string", "imageUrl": "string" }
Page text:
${text}`;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  if (!parsed.imageUrl) parsed.imageUrl = ogImage;
  return parsed;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, pin } = req.body || {};
  if (pin !== process.env.FAMILY_PIN) return res.status(401).json({ error: 'Incorrect PIN' });
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Please paste a full web address' });

  try {
    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    const html = await page.text();
    const recipe = fromJsonLd(html) || (await fromGemini(url, html));
    res.status(200).json(recipe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
