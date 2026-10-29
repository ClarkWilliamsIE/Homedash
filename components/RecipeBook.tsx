// components/RecipeBook.tsx
// The family recipe book: browse, read a recipe, cook it step by step, add it to the week,
// and add new ones (paste a link to import, or type/paste them in).

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Recipe, Ingredient, Instruction, WeeklyPlan } from '../types';
import { apiUrl } from '../lib/runtime';
import { useIsHome } from '../lib/hass';
import { startCooking } from '../lib/cooking';
import { startTimer, TIME_PATTERN, toSeconds } from '../lib/timers';
import { Btn, Icon, PageTitle, Pill, Sheet, useIsPhone } from './ui';
import { HomeIcons } from './home/icons';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A method step where times like "simmer 20 minutes" become tap-to-start timers. */
const StepText: React.FC<{ text: string; label: string; big?: boolean }> = ({ text, label, big }) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(TIME_PATTERN))) {
    const index = m.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const seconds = toSeconds(parseFloat(m[1]), m[3]);
    parts.push(
      <button
        key={index}
        type="button"
        onClick={() => startTimer(`${label}: ${m[0]}`, seconds)}
        title="Start a timer"
        className={`inline-flex items-center gap-1 mx-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 align-baseline font-sans ${big ? 'px-2.5 py-0.5 text-[0.8em]' : 'px-2 py-0.5'}`}
      >
        <HomeIcons.Timer className={big ? 'w-[0.9em] h-[0.9em]' : 'w-4 h-4'} />
        {m[0]}
      </button>
    );
    last = index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

// --- Scaling ---
const parseAmount = (amount: string): number => {
  const trimmed = (amount || '').trim();
  if (!trimmed) return 0;
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/');
    return parseFloat(num) / parseFloat(den);
  }
  return parseFloat(trimmed);
};
const formatAmount = (val: number): string => {
  if (val === 0) return '';
  const whole = Math.floor(val);
  const frac = val - whole;
  const fracs: [number, string][] = [[0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.66, '⅔'], [0.75, '¾']];
  const f = fracs.find(([v]) => Math.abs(frac - v) < 0.05);
  if (f) return `${whole || ''}${f[1]}`;
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1).replace('.0', '');
};
const scaleIngredient = (amountStr: string, factor: number): string => {
  if (!amountStr) return '';
  const match = amountStr.match(/^([\d./]+)(.*)$/);
  if (!match) return amountStr;
  const num = parseAmount(match[1]);
  if (isNaN(num)) return amountStr;
  return formatAmount(num * factor) + match[2];
};

// --- Pasting a block of ingredients or method ---
const UNICODE_FRACTIONS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' };
const UNITS = 'cups?|c|tbsp|tbs|tablespoons?|tsp|teaspoons?|g|grams?|kg|ml|l|litres?|liters?|oz|lb|pinch|handful|cloves?|cans?|tins?|packets?|bunch(?:es)?|slices?|sprigs?';
export const parseIngredientLine = (line: string): Ingredient | null => {
  let s = line.replace(/^[\s•*\-–]+/, '').trim();
  if (!s) return null;
  s = s.replace(/[½¼¾⅓⅔]/g, c => ` ${UNICODE_FRACTIONS[c]}`).replace(/\s+/g, ' ').trim();
  const m = s.match(new RegExp(`^((?:\\d+\\s)?\\d+(?:[./]\\d+)?(?:\\s?-\\s?\\d+(?:[./]\\d+)?)?)\\s*(${UNITS})?\\.?\\s+(?:of\\s+)?(.+)$`, 'i'));
  if (!m) return { amount: '', unit: '', item: s };
  return { amount: m[1].replace(/\s+/g, ' '), unit: (m[2] || '').toLowerCase(), item: m[3].trim() };
};
const parseMethod = (block: string): Instruction[] =>
  block.split(/\n+/).map(l => l.replace(/^\s*(?:step\s*)?\d+[.):]?\s*/i, '').trim()).filter(Boolean)
    .map(text => ({ text: text.replace(/:$/, ''), isHeader: /:$/.test(text) && text.length < 40 }));

// --- Cook mode: one step at a time, big text, screen stays on ---
const CookMode: React.FC<{ recipe: Recipe; scale: number; onClose: () => void }> = ({ recipe, scale, onClose }) => {
  const isHome = useIsHome();
  const steps = recipe.instructions.filter(s => !s.isHeader);
  const sectionFor = (i: number) => {
    let header = '';
    let n = -1;
    for (const s of recipe.instructions) {
      if (s.isHeader) header = s.text; else n++;
      if (n === i) return header;
    }
    return '';
  };
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [cooking, setCooking] = useState(false);
  const touchX = useRef<number | null>(null);
  const last = steps.length - 1;
  const next = useCallback(() => setI(v => Math.min(last, v + 1)), [last]);
  const prev = useCallback(() => setI(v => Math.max(0, v - 1)), []);

  // Keep the screen awake while cooking.
  useEffect(() => {
    let lock: any = null;
    const grab = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* not supported */ } };
    grab();
    const onVisible = () => { if (!document.hidden) grab(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); try { lock?.release(); } catch { /* already released */ } };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  const section = sectionFor(i);
  return (
    <div
      className="fixed inset-0 z-[130] bg-slate-50 flex flex-col pt-safe"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 70) (dx < 0 ? next : prev)();
        touchX.current = null;
      }}
      role="dialog"
      aria-label={`Cooking ${recipe.name}`}
    >
      <header className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-slate-200">
        <Btn variant="secondary" size="sm" onClick={onClose} icon={<Icon.Back className="w-4 h-4" />}>Done</Btn>
        <p className="flex-1 min-w-0 font-semibold text-slate-700 truncate text-center">{recipe.name}</p>
        <Btn variant="secondary" size="sm" onClick={() => setShowIngredients(true)}>Ingredients</Btn>
      </header>

      <div className="h-1.5 bg-slate-200"><div className="h-full bg-indigo-600 transition-[width] duration-300" style={{ width: `${steps.length ? ((i + 1) / steps.length) * 100 : 0}%` }} /></div>

      <div className="flex-1 overflow-y-auto px-6 md:px-16 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-slate-500 font-semibold">Step {i + 1} of {steps.length}{section ? ` · ${section}` : ''}</p>
          <p className="font-display text-[1.85rem] md:text-[2.6rem] leading-[1.3] text-slate-900 mt-4">
            {steps[i] ? <StepText big text={steps[i].text} label={`${recipe.name} (step ${i + 1})`} /> : 'This recipe has no method yet.'}
          </p>
          {steps[i + 1] && <p className="mt-10 text-slate-500 text-lg leading-relaxed"><span className="font-semibold text-slate-600">Next:</span> {steps[i + 1].text}</p>}
          {isHome && i === 0 && (
            <button
              onClick={() => { startCooking(); setCooking(true); }}
              className={`mt-10 inline-flex items-center gap-2 h-12 px-5 rounded-2xl font-semibold ${cooking ? 'bg-indigo-50 text-indigo-700' : 'bg-white border border-slate-200 text-slate-700'}`}
            >
              <HomeIcons.Music className="w-5 h-5" /> {cooking ? 'Cooking music and lights are on' : 'Put on cooking music and lights'}
            </button>
          )}
        </div>
      </div>

      <footer className="grid grid-cols-[1fr_2fr] gap-3 px-4 md:px-8 pt-3 pb-safe-4 border-t border-slate-200 bg-white">
        <Btn size="lg" variant="secondary" disabled={i === 0} onClick={prev} icon={<Icon.Back className="w-5 h-5" />}>Back</Btn>
        {i < last
          ? <Btn size="lg" onClick={next}>Next step <Icon.Next className="w-5 h-5" /></Btn>
          : <Btn size="lg" variant="clay" onClick={onClose}>Finished</Btn>}
      </footer>

      <Sheet open={showIngredients} onClose={() => setShowIngredients(false)} title="Ingredients">
        <ul className="divide-y divide-slate-100 pb-2">
          {recipe.ingredients.map((ing, idx) => (
            <li key={idx} className="py-3 text-lg text-slate-800">
              <span className="font-semibold text-indigo-700 mr-2">{scaleIngredient(ing.amount, scale)} {ing.unit}</span>{ing.item}
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
};

// --- The recipe itself ---
const RecipeView: React.FC<{
  recipe: Recipe;
  hiddenIngredients: string[];
  onTogglePantry: (item: string) => void;
  onAddOnce: (text: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavourite: () => void;
  onAddMeal: (day: string) => void;
  plannedOn: string[];
  startInCookMode?: boolean;
}> = ({ recipe, hiddenIngredients, onTogglePantry, onAddOnce, onClose, onEdit, onDelete, onFavourite, onAddMeal, plannedOn, startInCookMode }) => {
  const [scale, setScale] = useState(1);
  const [cook, setCook] = useState(!!startInCookMode);
  const [choosingDay, setChoosingDay] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const todayIdx = new Date().getDay();
  const dayOrder = Array.from({ length: 7 }, (_, i) => DAYS[(todayIdx + i) % 7]);
  let stepNo = 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !cook && !choosingDay) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cook, choosingDay, onClose]);

  const ingredients = (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-2xl text-slate-900">Ingredients</h2>
        <div className="flex bg-slate-100 rounded-xl p-1" role="group" aria-label="Quantity">
          {[0.5, 1, 2].map(s => (
            <button key={s} onClick={() => setScale(s)} aria-pressed={scale === s} className={`h-8 px-3 text-sm font-semibold rounded-lg ${scale === s ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>
              {s === 0.5 ? 'Half' : s === 1 ? 'Normal' : 'Double'}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {recipe.ingredients.map((ing, idx) => {
          const isPantry = hiddenIngredients.includes(ing.item.toLowerCase().trim());
          const amount = `${scaleIngredient(ing.amount, scale)} ${ing.unit}`.trim();
          return (
            <li key={idx} className="flex items-center gap-2 py-2.5">
              <span className="flex-1 min-w-0 text-[16px] leading-snug text-slate-800">
                {amount && <span className="font-semibold text-indigo-700 mr-1.5">{amount}</span>}
                {ing.item}
              </span>
              <button
                onClick={() => onTogglePantry(ing.item)}
                title={isPantry ? 'Usually in the pantry, so it stays off the shopping list. Tap to put it on the list.' : 'Goes on the shopping list. Tap if you usually have it.'}
                className={`shrink-0 h-8 px-2.5 rounded-full text-xs font-semibold border ${isPantry ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                {isPantry ? 'Pantry' : 'On list'}
              </button>
              <button
                onClick={() => onAddOnce(`${ing.item}${amount ? ` (${amount})` : ''}`)}
                aria-label={`Add ${ing.item} to this week's list`}
                title="Add to this week's list once"
                className="shrink-0 w-8 h-8 rounded-full text-indigo-700 hover:bg-indigo-50 flex items-center justify-center"
              >
                <Icon.Plus className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-slate-500 mt-2.5">Pantry items stay off the shopping list. Tap a label to change it, or + to add one this week.</p>
    </section>
  );

  const method = (
    <section>
      <h2 className="font-display text-2xl text-slate-900 mb-4">Method</h2>
      <ol className="space-y-5">
        {recipe.instructions.map((step, idx) => {
          if (step.isHeader) return <li key={idx} className="font-semibold text-indigo-700 pt-3">{step.text}</li>;
          stepNo++;
          const n = stepNo;
          return (
            <li key={idx} className="flex gap-4">
              <span className="font-display text-xl text-indigo-600 w-6 shrink-0 text-right leading-[1.6]">{n}</span>
              <p className="text-[17px] text-slate-700 leading-relaxed"><StepText text={step.text} label={`${recipe.name} (step ${n})`} /></p>
            </li>
          );
        })}
      </ol>
    </section>
  );

  return (
    <div className="fixed inset-0 z-[110] flex md:items-center justify-center md:p-6" role="dialog" aria-label={recipe.name}>
      <div className="absolute inset-0 bg-slate-900/50 hidden md:block" onClick={onClose} />
      <div className="relative bg-white w-full h-full md:max-w-6xl md:h-[92dvh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:min-h-full">
            <div className="md:border-r md:border-slate-100">
              <div className="relative">
                <img src={recipe.imageUrl} alt="" className="w-full aspect-[4/3] object-cover bg-slate-100" />
                <button onClick={onClose} aria-label="Back to recipes" className="absolute left-3 top-3 mt-safe w-11 h-11 rounded-full bg-white/90 text-slate-800 shadow flex items-center justify-center">
                  <Icon.Back className="w-5 h-5" />
                </button>
                <button onClick={onFavourite} aria-label={recipe.isFavorite ? 'Remove from favourites' : 'Add to favourites'} className={`absolute right-3 top-3 mt-safe w-11 h-11 rounded-full shadow flex items-center justify-center ${recipe.isFavorite ? 'bg-orange-500 text-white' : 'bg-white/90 text-slate-700'}`}>
                  <Icon.Heart filled={recipe.isFavorite} className="w-5 h-5" />
                </button>
              </div>
              <div className="hidden md:block p-6 lg:p-8">{ingredients}</div>
            </div>

            <div className="p-5 md:p-8 lg:p-10 space-y-8">
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {recipe.isNew && <Pill tone="clay">Not tried yet</Pill>}
                  {recipe.tags.map(t => <Pill key={t} tone="green">{t}</Pill>)}
                </div>
                <h1 className="font-display text-[2.1rem] md:text-5xl leading-[1.1] text-slate-900">{recipe.name}</h1>
                {plannedOn.length > 0 && <p className="text-slate-500 mt-2">On the plan for {plannedOn.join(' and ')}</p>}
                {recipe.sourceUrl && (
                  <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-indigo-700 underline underline-offset-4 decoration-indigo-200 hover:decoration-indigo-700">
                    Original recipe on {siteName(recipe.sourceUrl)}
                    <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                  </a>
                )}
                <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 mt-5">
                  <Btn size="lg" onClick={() => setCook(true)} disabled={!recipe.instructions.length} icon={<HomeIcons.Chef className="w-5 h-5" />}>Start cooking</Btn>
                  <Btn size="lg" variant="secondary" onClick={() => setChoosingDay(true)} icon={<Icon.Week className="w-5 h-5" />}>{added ? `On for ${added}` : 'Add to week'}</Btn>
                </div>
                <div className="flex gap-1 mt-3 -ml-2">
                  <Btn size="sm" variant="ghost" onClick={onEdit} icon={<HomeIcons.Edit className="w-4 h-4" />}>Edit</Btn>
                  <Btn size="sm" variant="danger" onClick={onDelete} icon={<HomeIcons.Trash className="w-4 h-4" />}>Delete</Btn>
                </div>
              </div>
              <div className="md:hidden">{ingredients}</div>
              {method}
            </div>
          </div>
        </div>
      </div>

      <Sheet open={choosingDay} onClose={() => setChoosingDay(false)} title="Add to which day?">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {dayOrder.map((d, i) => (
            <Btn key={d} size="lg" variant="secondary" onClick={() => { onAddMeal(d); setAdded(i === 0 ? 'tonight' : d); setChoosingDay(false); }}>
              {i === 0 ? `Tonight (${d.slice(0, 3)})` : i === 1 ? `Tomorrow (${d.slice(0, 3)})` : d}
            </Btn>
          ))}
        </div>
      </Sheet>

      {cook && <CookMode recipe={recipe} scale={scale} onClose={() => setCook(false)} />}
    </div>
  );
};

/** "bbc.co.uk" from a recipe link, for the "Original recipe on…" line. */
const siteName = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'the web'; }
};

// --- Add / edit form ---
interface FormState {
  id: string; name: string; imageUrl: string; tags: string;
  ingredients: Ingredient[]; instructions: Instruction[];
  isFavorite: boolean; isNew: boolean;
  sourceUrl: string;
}
const emptyForm = (): FormState => ({ id: '', name: '', imageUrl: '', tags: '', sourceUrl: '', ingredients: [{ amount: '', unit: '', item: '' }], instructions: [{ text: '', isHeader: false }], isFavorite: false, isNew: true });

const field = 'w-full h-12 bg-slate-100 rounded-2xl px-4 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200';
const label = 'block text-sm font-semibold text-slate-700 mb-1.5';

const RecipeForm: React.FC<{
  initial: FormState;
  editing: boolean;
  autoImport?: string | null;
  onCancel: () => void;
  onSave: (f: FormState, file?: File) => Promise<boolean>;
}> = ({ initial, editing, autoImport, onCancel, onSave }) => {
  const [f, setF] = useState<FormState>(initial);
  const [importUrl, setImportUrl] = useState(autoImport || '');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial.imageUrl || null);
  const [paste, setPaste] = useState<null | 'ingredients' | 'method'>(null);
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const set = (patch: Partial<FormState>) => setF(prev => ({ ...prev, ...patch }));

  const runImport = async (url = importUrl) => {
    if (!url.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      // The AI step runs on the server (api/importRecipe), so the Gemini key stays private.
      const res = await fetch(apiUrl('/api/importRecipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), pin: localStorage.getItem('family_pin') })
      });
      if (!res.ok) throw new Error(`Import failed (${res.status})`);
      const data = await res.json();
      if (data.imageUrl) setFile(null);
      set({
        name: data.name || f.name || '',
        ingredients: data.ingredients?.length ? data.ingredients : [{ amount: '', unit: '', item: '' }],
        instructions: data.instructions?.length ? data.instructions : [{ text: '', isHeader: false }],
        tags: data.tags || f.tags || '',
        imageUrl: data.imageUrl || f.imageUrl || '',
        sourceUrl: url.trim(),
      });
      if (data.imageUrl) setPreview(data.imageUrl);
      setShowImport(false);
      setImportUrl('');
    } catch {
      setImportError(navigator.onLine ? "Couldn't read a recipe from that link. Check it opens in a browser, or type the recipe in below." : 'Importing needs a connection.');
    } finally { setImporting(false); }
  };

  // Opened from a shared link (?import=…): import straight away.
  useEffect(() => { if (autoImport) runImport(autoImport); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(picked);
  };

  const applyPaste = () => {
    if (paste === 'ingredients') {
      const parsed = pasteText.split(/\n+/).map(parseIngredientLine).filter(Boolean) as Ingredient[];
      set({ ingredients: [...f.ingredients.filter(i => i.item.trim()), ...parsed] });
    } else if (paste === 'method') {
      set({ instructions: [...f.instructions.filter(i => i.text.trim()), ...parseMethod(pasteText)] });
    }
    setPaste(null);
    setPasteText('');
  };

  const updateIng = (i: number, key: keyof Ingredient, value: string) => set({ ingredients: f.ingredients.map((x, j) => j === i ? { ...x, [key]: value } : x) });
  const updateStep = (i: number, patch: Partial<Instruction>) => set({ instructions: f.instructions.map((x, j) => j === i ? { ...x, ...patch } : x) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    const ok = await onSave(f, file || undefined);
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <Sheet
      open
      wide
      onClose={onCancel}
      title={editing ? 'Edit recipe' : 'Add a recipe'}
      footer={
        <div className="flex gap-2">
          <Btn type="button" variant="ghost" size="lg" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" form="recipe-form" size="lg" className="flex-1" disabled={saving || !f.name.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}</Btn>
        </div>
      }
    >
      {editing && !showImport ? (
        <button type="button" onClick={() => setShowImport(true)} className="mb-5 text-sm font-semibold text-indigo-700">
          Re-import this recipe from a website…
        </button>
      ) : (
        <div className="rounded-3xl bg-indigo-50 p-4 mb-6">
          <p className="font-semibold text-slate-800">{editing ? 'Re-import from a website' : 'Import from a website'}</p>
          <p className="text-sm text-slate-600 mb-3">
            {editing
              ? 'Paste a link to replace the name, ingredients, method, tags and photo. Favourite and "not tried yet" stay as they are. Nothing is saved until you tap Save changes.'
              : 'Paste a link and Homedash fills in the recipe for you to check.'}
          </p>
          <div className="flex gap-2">
            <input type="url" inputMode="url" placeholder="https://…" className={`${field} !bg-white`} value={importUrl} onChange={e => setImportUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runImport(); } }} />
            <Btn type="button" size="lg" className="!h-12" onClick={() => runImport()} disabled={importing || !importUrl.trim()}>{importing ? 'Importing…' : 'Import'}</Btn>
          </div>
          {importError && <p className="text-sm text-rose-700 font-medium mt-2">{importError}</p>}
        </div>
      )}

      <form id="recipe-form" onSubmit={submit} className="space-y-6 pb-2">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_14rem] gap-5">
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="rf-name">Name</label>
              <input id="rf-name" required className={field} value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Nana's lasagne" />
            </div>
            <div>
              <label className={label} htmlFor="rf-tags">Tags</label>
              <input id="rf-tags" className={field} value={f.tags} onChange={e => set({ tags: e.target.value })} placeholder="Pasta, quick, freezer" />
            </div>
            <div>
              <label className={label} htmlFor="rf-source">Original recipe link</label>
              <input id="rf-source" type="url" inputMode="url" className={field} value={f.sourceUrl} onChange={e => set({ sourceUrl: e.target.value })} placeholder="https://… (added for you when you import)" />
            </div>
            <div className="flex gap-2">
              <button type="button" aria-pressed={f.isFavorite} onClick={() => set({ isFavorite: !f.isFavorite })} className={`h-10 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 border ${f.isFavorite ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                <Icon.Heart filled={f.isFavorite} className="w-4 h-4" /> Favourite
              </button>
              <button type="button" aria-pressed={f.isNew} onClick={() => set({ isNew: !f.isNew })} className={`h-10 px-4 rounded-full text-sm font-semibold border ${f.isNew ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                Not tried yet
              </button>
            </div>
          </div>
          <div>
            <span className={label}>Photo</span>
            {preview ? (
              <div className="relative h-40 rounded-2xl overflow-hidden">
                <img src={preview} className="w-full h-full object-cover" alt="" />
                <button type="button" onClick={() => { setFile(null); setPreview(null); set({ imageUrl: '' }); }} className="absolute top-2 right-2 h-8 px-3 rounded-full bg-white/90 text-sm font-semibold text-slate-700 shadow">Change</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed border-slate-300 cursor-pointer hover:bg-slate-50 text-slate-500">
                <Icon.Plus className="w-6 h-6 mb-1" />
                <span className="text-sm font-semibold">Take or choose a photo</span>
                <input type="file" className="hidden" accept="image/*" onChange={onFile} />
              </label>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xl text-slate-900">Ingredients</span>
            <button type="button" onClick={() => { setPaste('ingredients'); setPasteText(''); }} className="text-sm font-semibold text-indigo-700">Paste a list</button>
          </div>
          <div className="space-y-2">
            {f.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label="Amount" placeholder="2" className={`${field} !w-16 !px-2 text-center`} value={ing.amount} onChange={e => updateIng(i, 'amount', e.target.value)} />
                <input aria-label="Unit" placeholder="cups" className={`${field} !w-20 !px-2 text-center`} value={ing.unit} onChange={e => updateIng(i, 'unit', e.target.value)} />
                <input aria-label="Ingredient" placeholder="Flour" className={`${field} flex-1 min-w-0`} value={ing.item} onChange={e => updateIng(i, 'item', e.target.value)} />
                <button type="button" aria-label="Remove ingredient" onClick={() => set({ ingredients: f.ingredients.filter((_, j) => j !== i) })} className="w-10 shrink-0 text-slate-400 hover:text-rose-600 text-lg">✕</button>
              </div>
            ))}
            <Btn type="button" variant="ghost" size="sm" onClick={() => set({ ingredients: [...f.ingredients, { amount: '', unit: '', item: '' }] })} icon={<Icon.Plus className="w-4 h-4" />}>Add ingredient</Btn>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xl text-slate-900">Method</span>
            <button type="button" onClick={() => { setPaste('method'); setPasteText(''); }} className="text-sm font-semibold text-indigo-700">Paste the method</button>
          </div>
          <div className="space-y-2">
            {f.instructions.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-6 pt-3 text-right text-slate-400 font-semibold shrink-0">{step.isHeader ? '' : f.instructions.slice(0, i + 1).filter(s => !s.isHeader).length}</span>
                <textarea
                  rows={step.isHeader ? 1 : 2}
                  aria-label={step.isHeader ? 'Section heading' : 'Step'}
                  placeholder={step.isHeader ? 'Section heading, e.g. For the sauce' : 'What to do…'}
                  className={`flex-1 min-w-0 rounded-2xl px-4 py-3 text-[16px] outline-none resize-y focus:ring-2 focus:ring-indigo-200 ${step.isHeader ? 'bg-indigo-50 font-semibold text-indigo-800' : 'bg-slate-100 focus:bg-white'}`}
                  value={step.text}
                  onChange={e => updateStep(i, { text: e.target.value })}
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => updateStep(i, { isHeader: !step.isHeader })} title="Make this a section heading" className={`h-9 px-2 rounded-xl text-xs font-semibold ${step.isHeader ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'}`}>Heading</button>
                  <button type="button" aria-label="Remove step" onClick={() => set({ instructions: f.instructions.filter((_, j) => j !== i) })} className="h-9 text-slate-400 hover:text-rose-600">✕</button>
                </div>
              </div>
            ))}
            <Btn type="button" variant="ghost" size="sm" onClick={() => set({ instructions: [...f.instructions, { text: '', isHeader: false }] })} icon={<Icon.Plus className="w-4 h-4" />}>Add step</Btn>
          </div>
        </div>
      </form>

      <Sheet
        open={!!paste}
        onClose={() => setPaste(null)}
        title={paste === 'ingredients' ? 'Paste ingredients' : 'Paste the method'}
        footer={<Btn size="lg" className="w-full" onClick={applyPaste} disabled={!pasteText.trim()}>Add {paste === 'ingredients' ? 'ingredients' : 'steps'}</Btn>}
      >
        <p className="text-sm text-slate-500 mb-3">{paste === 'ingredients' ? 'One ingredient per line, like "2 cups flour". Amounts and units are split out for you.' : 'One step per line. Lines ending in a colon become section headings.'}</p>
        <textarea autoFocus rows={10} className="w-full rounded-2xl bg-slate-100 p-4 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" value={pasteText} onChange={e => setPasteText(e.target.value)} />
      </Sheet>
    </Sheet>
  );
};

// --- Library ---
interface RecipeBookProps {
  recipes: Recipe[];
  weeklyPlan: WeeklyPlan;
  onRefresh: () => void;
  onAddRecipe: (recipe: Omit<Recipe, 'id'>, imageFile?: File) => Promise<boolean>;
  onUpdateRecipe: (recipe: Recipe, imageFile?: File) => Promise<boolean>;
  onDeleteRecipe: (id: string) => Promise<boolean>;
  onAddMeal: (day: string, recipe: Recipe) => void;
  hiddenIngredients: string[];
  onUpdateHidden: (hidden: string[]) => void;
  onAddManualShoppingItem: (name: string) => void;
  /** A recipe opened from elsewhere (Home, the week). "cook:<id>" opens it in cook mode. */
  externalIdToOpen?: string | null;
  onClearExternalId?: () => void;
  /** A link shared into Homedash to import. */
  importUrl?: string | null;
  onImportHandled?: () => void;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'new', label: 'Not tried yet' },
] as const;

const RecipeBook: React.FC<RecipeBookProps> = ({
  recipes, weeklyPlan, onAddRecipe, onUpdateRecipe, onDeleteRecipe, onAddMeal,
  hiddenIngredients, onUpdateHidden, onAddManualShoppingItem, externalIdToOpen, onClearExternalId, importUrl, onImportHandled,
}) => {
  const isPhone = useIsPhone();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'new'>('all');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cookOnOpen, setCookOnOpen] = useState(false);
  const [form, setForm] = useState<null | { initial: FormState; editing: boolean; autoImport?: string | null }>(null);

  useEffect(() => {
    if (!externalIdToOpen) return;
    const cook = externalIdToOpen.startsWith('cook:');
    const id = externalIdToOpen.replace(/^cook:/, '');
    if (recipes.some(r => r.id === id)) { setViewingId(id); setCookOnOpen(cook); }
    onClearExternalId?.();
  }, [externalIdToOpen, recipes, onClearExternalId]);

  useEffect(() => {
    if (!importUrl) return;
    setForm({ initial: emptyForm(), editing: false, autoImport: importUrl });
    onImportHandled?.();
  }, [importUrl, onImportHandled]);

  const viewing = recipes.find(r => r.id === viewingId) || null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter(r => {
      const matches = !q || r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q)) || r.ingredients.some(i => i.item.toLowerCase().includes(q));
      if (filterMode === 'favorites') return matches && r.isFavorite;
      if (filterMode === 'new') return matches && r.isNew;
      return matches;
    });
  }, [recipes, search, filterMode]);

  const plannedOn = (id: string) => DAYS.filter(d => (weeklyPlan[d] || []).some(r => r.id === id));

  const togglePantry = (item: string) => {
    const clean = item.toLowerCase().trim();
    onUpdateHidden(hiddenIngredients.includes(clean) ? hiddenIngredients.filter(i => i !== clean) : [...hiddenIngredients, clean]);
  };

  const saveForm = async (f: FormState, file?: File) => {
    const data = {
      name: f.name.trim(),
      ingredients: f.ingredients.filter(i => i.item.trim() !== ''),
      instructions: f.instructions.filter(i => i.text.trim() !== ''),
      tags: f.tags.split(',').map(s => s.trim()).filter(Boolean),
      imageUrl: f.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(f.name)}/800/600`,
      isFavorite: f.isFavorite,
      isNew: f.isNew,
      sourceUrl: f.sourceUrl.trim() || undefined,
    };
    return f.id ? onUpdateRecipe({ ...data, id: f.id }, file) : onAddRecipe(data, file);
  };

  const editRecipe = (r: Recipe) => setForm({
    editing: true,
    initial: {
      id: r.id, name: r.name, imageUrl: r.imageUrl, tags: r.tags.join(', '),
      ingredients: r.ingredients.length ? [...r.ingredients] : [{ amount: '', unit: '', item: '' }],
      instructions: r.instructions.length ? [...r.instructions] : [{ text: '', isHeader: false }],
      isFavorite: !!r.isFavorite, isNew: !!r.isNew,
      sourceUrl: r.sourceUrl || '',
    },
  });

  return (
    <div className="pb-16">
      <PageTitle
        title="Recipes"
        subtitle={`${recipes.length} in the book`}
        actions={<Btn onClick={() => setForm({ initial: emptyForm(), editing: false })} icon={<Icon.Plus className="w-4 h-4" />}>Add recipe</Btn>}
      />

      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-6">
        <div className="relative flex-1 md:max-w-md">
          <Icon.Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input type="search" placeholder="Search by name, tag or ingredient" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-2xl text-[16px] outline-none focus:border-indigo-500" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map(btn => (
            <button key={btn.id} onClick={() => setFilterMode(btn.id)} aria-pressed={filterMode === btn.id}
              className={`h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${filterMode === btn.id ? 'bg-indigo-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-16">{recipes.length ? 'No recipes match that search.' : 'No recipes yet. Add your first one.'}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8">
          {filtered.map(recipe => (
            <button key={recipe.id} onClick={() => { setCookOnOpen(false); setViewingId(recipe.id); }} className="group text-left min-w-0">
              <div className="relative aspect-[4/3] rounded-2xl md:rounded-3xl overflow-hidden bg-slate-200">
                <img src={recipe.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                {recipe.isFavorite && (
                  <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 text-orange-500 flex items-center justify-center shadow-sm">
                    <Icon.Heart filled className="w-4 h-4" />
                  </span>
                )}
                {plannedOn(recipe.id).length > 0 && (
                  <span className="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-indigo-700 text-white text-xs font-semibold">{plannedOn(recipe.id)[0].slice(0, 3)}</span>
                )}
              </div>
              <h3 className={`mt-2.5 font-semibold text-slate-900 leading-snug line-clamp-2 ${isPhone ? 'text-[15px]' : 'text-lg'}`}>{recipe.name}</h3>
              <p className="text-sm text-slate-500 truncate">{recipe.isNew ? 'Not tried yet' : recipe.tags.slice(0, 2).join(', ') || `${recipe.ingredients.length} ingredients`}</p>
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <RecipeView
          key={viewing.id}
          recipe={viewing}
          startInCookMode={cookOnOpen}
          hiddenIngredients={hiddenIngredients}
          onTogglePantry={togglePantry}
          onAddOnce={onAddManualShoppingItem}
          onClose={() => setViewingId(null)}
          onEdit={() => editRecipe(viewing)}
          onDelete={async () => { if (await onDeleteRecipe(viewing.id)) setViewingId(null); }}
          onFavourite={() => onUpdateRecipe({ ...viewing, isFavorite: !viewing.isFavorite })}
          onAddMeal={day => onAddMeal(day, viewing)}
          plannedOn={plannedOn(viewing.id)}
        />
      )}

      {form && (
        <RecipeForm
          initial={form.initial}
          editing={form.editing}
          autoImport={form.autoImport}
          onCancel={() => setForm(null)}
          onSave={saveForm}
        />
      )}
    </div>
  );
};

export default RecipeBook;
