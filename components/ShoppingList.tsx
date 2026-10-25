// components/ShoppingList.tsx
// The shopping list, laid out for using in the supermarket: big rows grouped by aisle,
// tap to put something in the trolley, and "Finish shop" when you're done.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { WeeklyPlan } from '../types';
import type { ManualItem } from '../lib/merge';
import { AddItemBar, Btn, Icon, PageTitle } from './ui';

interface ShoppingListProps {
  weeklyPlan: WeeklyPlan;
  authToken: string | null;
  spreadsheetId: string | null;
  manualItems: ManualItem[];
  onUpdateItems: (items: ManualItem[]) => void;
  hiddenIngredients: string[];
  onUpdateHidden: (items: string[]) => void;
  clearedIngredients: string[];
  onUpdateCleared: (items: string[]) => void;
  checkedIngredients: string[];
  onUpdateChecked: (items: string[]) => void;
  pantryHidden: string[];
  onUpdatePantryHidden: (items: string[]) => void;
}

// --- Aisles ---
// Rough supermarket order. The longest matching keyword wins, so "coconut milk" isn't dairy.
const AISLES: { name: string; words: string[] }[] = [
  { name: 'Fruit & veg', words: ['apple', 'banana', 'orange', 'lemon', 'lime', 'mandarin', 'kiwifruit', 'feijoa', 'berries', 'berry', 'strawberr', 'blueberr', 'grape', 'pear', 'peach', 'plum', 'mango', 'pineapple', 'melon', 'avocado', 'tomato', 'potato', 'kumara', 'pumpkin', 'carrot', 'onion', 'shallot', 'spring onion', 'leek', 'garlic', 'ginger', 'chilli', 'capsicum', 'courgette', 'zucchini', 'eggplant', 'aubergine', 'cucumber', 'lettuce', 'salad', 'spinach', 'silverbeet', 'kale', 'rocket', 'cabbage', 'broccoli', 'broccolini', 'cauliflower', 'celery', 'mushroom', 'corn', 'peas', 'beans', 'bok choy', 'pak choy', 'beetroot', 'parsnip', 'asparagus', 'herb', 'basil', 'parsley', 'coriander', 'cilantro', 'mint', 'thyme', 'rosemary', 'dill', 'chives', 'sprouts'] },
  { name: 'Bakery', words: ['bread', 'loaf', 'bun', 'roll', 'bagel', 'croissant', 'pita', 'naan', 'sourdough', 'muffin', 'crumpet'] },
  { name: 'Meat & fish', words: ['chicken', 'beef', 'mince', 'steak', 'lamb', 'pork', 'bacon', 'ham', 'sausage', 'chorizo', 'salami', 'prosciutto', 'turkey', 'fish', 'salmon', 'snapper', 'tarakihi', 'prawn', 'shrimp', 'mussel', 'tofu', 'tempeh'] },
  { name: 'Dairy & eggs', words: ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'halloumi', 'ricotta', 'yoghurt', 'yogurt', 'egg', 'sour cream', 'creme fraiche', 'custard', 'hummus', 'dip'] },
  { name: 'Tins, pasta & dry goods', words: ['rolled oats', 'coconut milk', 'coconut cream', 'peanut butter', 'stock', 'broth', 'tinned', 'canned', 'tin of', 'can of', 'passata', 'tomato paste', 'chopped tomatoes', 'crushed tomatoes', 'baked beans', 'chickpea', 'lentil', 'kidney bean', 'black bean', 'cannellini', 'rice', 'pasta', 'spaghetti', 'penne', 'fettuccine', 'lasagne sheet', 'noodle', 'couscous', 'quinoa', 'flour', 'sugar', 'oats', 'cereal', 'muesli', 'honey', 'jam', 'vegemite', 'marmite', 'oil', 'vinegar', 'soy sauce', 'fish sauce', 'oyster sauce', 'sauce', 'mustard', 'mayo', 'ketchup', 'curry paste', 'spice', 'paprika', 'cumin', 'coriander seed', 'turmeric', 'cinnamon', 'oregano', 'chilli flakes', 'stock cube', 'baking', 'yeast', 'cocoa', 'chocolate', 'nuts', 'almond', 'cashew', 'peanut', 'raisin', 'sultana', 'crackers', 'chips', 'biscuit', 'salt', 'pepper', 'tuna', 'salmon tin', 'taco', 'tortilla', 'wrap', 'breadcrumb', 'panko', 'sesame', 'cornflour', 'gravy', 'tahini', 'syrup'] },
  { name: 'Frozen', words: ['frozen', 'ice cream', 'ice block', 'fish fingers', 'puff pastry', 'pastry', 'hash brown'] },
  { name: 'Drinks', words: ['juice', 'coffee', 'tea', 'water', 'soda', 'lemonade', 'beer', 'wine', 'cordial', 'kombucha'] },
  { name: 'Household', words: ['toilet', 'paper towel', 'tissue', 'detergent', 'dishwash', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'nappies', 'wipes', 'bin bag', 'rubbish bag', 'glad wrap', 'foil', 'baking paper', 'sponge', 'cleaner', 'laundry', 'battery', 'batteries'] },
];
const OTHER = 'Everything else';
const AISLE_ORDER = [...AISLES.map(a => a.name), OTHER];

const aisleCache = new Map<string, string>();
export const aisleFor = (name: string): string => {
  const key = name.toLowerCase();
  const hit = aisleCache.get(key);
  if (hit) return hit;
  // Look for the most specific (longest) keyword across all aisles, so "coconut milk" beats "milk".
  let best = OTHER, bestLen = 0;
  for (const aisle of AISLES) {
    for (const w of aisle.words) {
      if (w.length > bestLen && new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(key)) {
        best = aisle.name; bestLen = w.length;
      }
    }
  }
  aisleCache.set(key, best);
  return best;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Recipe ingredients for the week that still need buying: name → the meals that use it. */
const recipeNeeds = (weeklyPlan: WeeklyPlan, hidden: string[], cleared: string[]) => {
  const list = new Map<string, string[]>();
  Object.values(weeklyPlan).flat().forEach(recipe => {
    recipe.ingredients.forEach(ing => {
      const clean = ing.item.toLowerCase().trim();
      if (!clean || hidden.includes(clean) || cleared.includes(clean)) return;
      const uses = list.get(clean) || [];
      uses.push(recipe.name);
      list.set(clean, uses);
    });
  });
  return list;
};

/** How many things are still to get (shown as the badge on the Shopping tab). */
export const openItemCount = (s: {
  weeklyPlan: WeeklyPlan; manualItems: ManualItem[]; hiddenIngredients: string[]; clearedIngredients: string[]; checkedIngredients: string[];
}) => {
  const needs = recipeNeeds(s.weeklyPlan, s.hiddenIngredients, s.clearedIngredients);
  let n = s.manualItems.filter(i => !i.checked).length;
  needs.forEach((_, name) => { if (!s.checkedIngredients.includes(name)) n++; });
  return n;
};

interface Row {
  key: string;
  name: string;
  detail?: string;
  checked: boolean;
  aisle: string;
  toggle: () => void;
}

const ItemRow: React.FC<{ row: Row }> = ({ row }) => (
  <li>
    <button
      onClick={row.toggle}
      aria-pressed={row.checked}
      className={`w-full min-h-[3.5rem] flex items-center gap-4 px-4 py-2.5 text-left transition-colors ${row.checked ? 'bg-transparent' : 'hover:bg-slate-50 active:bg-indigo-50'}`}
    >
      <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 transition-colors ${row.checked ? 'bg-indigo-700 border-indigo-700 text-white' : 'border-slate-300 bg-white'}`}>
        {row.checked && <Icon.Check className="w-4 h-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[17px] leading-snug ${row.checked ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900 font-medium'}`}>{row.name}</span>
        {row.detail && !row.checked && <span className="block text-sm text-slate-500 truncate">{row.detail}</span>}
      </span>
    </button>
  </li>
);

const ShoppingList: React.FC<ShoppingListProps> = ({
  weeklyPlan,
  authToken,
  spreadsheetId,
  manualItems,
  onUpdateItems,
  hiddenIngredients,
  onUpdateHidden,
  clearedIngredients,
  onUpdateCleared,
  checkedIngredients,
  onUpdateChecked,
  pantryHidden,
  onUpdatePantryHidden,
}) => {
  const [showTrolley, setShowTrolley] = useState(false);
  const [showPantry, setShowPantry] = useState(false);
  const [undo, setUndo] = useState<null | { items: ManualItem[]; cleared: string[]; checked: string[]; count: number }>(null);
  const undoTimer = useRef<any>(null);
  const syncTimeout = useRef<any>(null);

  const needs = useMemo(() => recipeNeeds(weeklyPlan, hiddenIngredients, clearedIngredients), [weeklyPlan, hiddenIngredients, clearedIngredients]);

  // Keep the "ShoppingList" tab of the Google Sheet up to date (handy for printing).
  useEffect(() => {
    if (!authToken || !spreadsheetId || !navigator.onLine) return;
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(async () => {
      try {
        const values = [
          ['Date', new Date().toLocaleDateString('en-NZ')],
          ['Category', 'Item'],
          ...[...needs.entries()].sort().map(([item, uses]) => ['Recipe', `${item} ${uses.length > 1 ? `(x${uses.length})` : ''}`]),
          ...manualItems.map(item => ['Manual', item.name])
        ];
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ShoppingList!A:C:clear`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ShoppingList!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values })
        });
      } catch (err) { console.error("Sheet sync failed", err); }
    }, 5000);
    return () => clearTimeout(syncTimeout.current);
  }, [needs, manualItems, authToken, spreadsheetId]);

  const addItem = (name: string) => {
    onUpdateCleared(clearedIngredients.filter(i => i !== name.toLowerCase()));
    onUpdateItems([...manualItems, { id: Date.now().toString(), name: cap(name), checked: false }]);
  };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = manualItems.map(item => ({
      key: `m-${item.id}`,
      name: item.name,
      checked: item.checked,
      aisle: aisleFor(item.name),
      toggle: () => onUpdateItems(manualItems.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i)),
    }));
    [...needs.entries()].forEach(([name, uses]) => {
      const checked = checkedIngredients.includes(name);
      const meals = [...new Set(uses)];
      out.push({
        key: `r-${name}`,
        name: cap(name),
        detail: `For ${meals.join(', ')}${uses.length > meals.length ? ` (×${uses.length})` : ''}`,
        checked,
        aisle: aisleFor(name),
        toggle: () => onUpdateChecked(checked ? checkedIngredients.filter(i => i !== name) : [...checkedIngredients, name]),
      });
    });
    return out;
  }, [manualItems, needs, checkedIngredients, onUpdateItems, onUpdateChecked]);

  const toGet = rows.filter(r => !r.checked);
  const inTrolley = rows.filter(r => r.checked);
  const groups = AISLE_ORDER
    .map(aisle => ({ aisle, rows: toGet.filter(r => r.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter(g => g.rows.length);

  const finishShop = () => {
    const snapshot = { items: manualItems, cleared: clearedIngredients, checked: checkedIngredients, count: inTrolley.length };
    onUpdateItems(manualItems.filter(i => !i.checked));
    onUpdateCleared([...clearedIngredients, ...checkedIngredients]);
    onUpdateChecked([]);
    setUndo(snapshot);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  };
  const undoFinish = () => {
    if (!undo) return;
    onUpdateItems(undo.items);
    onUpdateCleared(undo.cleared);
    onUpdateChecked(undo.checked);
    setUndo(null);
  };

  const restoreWeeklyItems = () => {
    if (confirm("Put back everything you've already bought for this week's meals?")) onUpdateCleared([]);
  };

  // Pantry items: ingredients you usually have, so recipes don't add them.
  // Pantry items: ingredients you usually have, so recipes don't add them. Items tidied out of this
  // list (duplicates, odd spellings) stay off the shopping list and keep their Pantry label on recipes.
  const pantry = useMemo(() => hiddenIngredients.filter(i => !pantryHidden.includes(i)).sort(), [hiddenIngredients, pantryHidden]);
  const tidied = useMemo(() => hiddenIngredients.filter(i => pantryHidden.includes(i)).sort(), [hiddenIngredients, pantryHidden]);
  const [showTidied, setShowTidied] = useState(false);
  const tidyAway = (name: string) => onUpdatePantryHidden([...pantryHidden.filter(i => i !== name), name]);
  const putBack = (name: string) => onUpdatePantryHidden(pantryHidden.filter(i => i !== name));
  const addPantryOnce = (name: string) => {
    if (manualItems.some(i => i.name.toLowerCase() === name.toLowerCase() && !i.checked)) return;
    onUpdateItems([...manualItems, { id: Date.now().toString(), name: cap(name), checked: false }]);
  };
  const addPantry = (name: string) => {
    const clean = name.toLowerCase().trim();
    if (clean && !hiddenIngredients.includes(clean)) onUpdateHidden([...hiddenIngredients, clean]);
    if (pantryHidden.includes(clean)) putBack(clean);
  };
  const [editPantry, setEditPantry] = useState(false);

  const subtitle = toGet.length === 0 && inTrolley.length === 0
    ? 'Nothing on the list yet'
    : `${toGet.length} to get${inTrolley.length ? `, ${inTrolley.length} in the trolley` : ''}`;

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <PageTitle
        title="Shopping"
        subtitle={subtitle}
        actions={inTrolley.length > 0 ? <Btn onClick={finishShop} icon={<Icon.Check className="w-4 h-4" />}>Finish shop</Btn> : undefined}
      />

      {/* Add bar stays at the top while you scroll the list */}
      <div className="sticky top-0 z-20 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-slate-50">
        <AddItemBar
          onAdd={addItem}
          exclude={toGet.map(r => r.name)}
          placeholder="Add milk, bread, nappies…"
          label="Add to the list"
        />
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-14">
          <p className="font-display text-2xl text-slate-800">{inTrolley.length ? 'Everything is in the trolley' : 'All done'}</p>
          <p className="text-slate-500 mt-1">{inTrolley.length ? 'Tap Finish shop to clear the ticked items.' : 'Plan some meals and their ingredients appear here.'}</p>
        </div>
      ) : (
        <div className="mt-3 md:columns-2 md:gap-5">
          {groups.map(g => (
            <section key={g.aisle} className="break-inside-avoid mb-4 bg-white rounded-3xl border border-slate-200/70 overflow-hidden">
              <h2 className="px-4 pt-3.5 pb-1 text-sm font-semibold text-indigo-700">{g.aisle}</h2>
              <ul className="divide-y divide-slate-100">{g.rows.map(r => <ItemRow key={r.key} row={r} />)}</ul>
            </section>
          ))}
        </div>
      )}

      {inTrolley.length > 0 && (
        <section className="mt-2 rounded-3xl border border-slate-200/70 bg-slate-100/60">
          <button onClick={() => setShowTrolley(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
            <span className="font-semibold text-slate-700">In the trolley ({inTrolley.length})</span>
            <span className="text-sm font-semibold text-indigo-700">{showTrolley ? 'Hide' : 'Show'}</span>
          </button>
          {showTrolley && <ul className="divide-y divide-slate-200/60 pb-1">{inTrolley.map(r => <ItemRow key={r.key} row={r} />)}</ul>}
        </section>
      )}

      <section className="mt-4 rounded-3xl border border-amber-200/70 bg-amber-50/60">
        <button onClick={() => setShowPantry(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
          <span>
            <span className="block font-semibold text-slate-800">Pantry items ({pantry.length})</span>
            <span className="block text-sm text-slate-500">Things you usually have in, so recipes leave them off the list. Running low? Add one.</span>
          </span>
          <span className="text-sm font-semibold text-indigo-700 shrink-0">{showPantry ? 'Hide' : 'Show'}</span>
        </button>
        {showPantry && (
          <div className="px-2 pb-3">
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-2">
              {pantry.map(name => {
                const added = manualItems.some(i => i.name.toLowerCase() === name && !i.checked);
                return (
                  <li key={name} className="flex items-center gap-2 pl-3 pr-1 py-1.5">
                    <span className="flex-1 text-[15px] text-slate-800 truncate">{cap(name)}</span>
                    {editPantry ? (
                      <button onClick={() => tidyAway(name)} className="h-9 px-3 rounded-xl text-sm font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
                    ) : (
                      <button onClick={() => addPantryOnce(name)} disabled={added}
                        className="h-9 px-3 rounded-xl text-sm font-semibold bg-white text-indigo-700 border border-slate-200 disabled:text-slate-500 disabled:bg-transparent disabled:border-transparent">
                        {added ? 'On the list' : 'Add'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="px-2 pt-3">
              <AddItemBar onAdd={addPantry} exclude={pantry} remember={false} tinted placeholder="Add a pantry item, e.g. rice" label="Add a pantry item" />
              <div className="flex justify-end mt-2">
                <button onClick={() => setEditPantry(v => !v)} className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
                  {editPantry ? 'Done' : 'Remove items…'}
                </button>
              </div>
              {editPantry && <p className="text-sm text-slate-500 px-2">Removing only tidies this list: the item still stays off the shopping list, and recipes still show it as Pantry.</p>}
              {tidied.length > 0 && (
                <div className="mt-3 border-t border-amber-200/70 pt-2">
                  <button onClick={() => setShowTidied(v => !v)} className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-slate-500">
                    <span>Removed from this list ({tidied.length})</span>
                    <span className="text-indigo-700">{showTidied ? 'Hide' : 'Show'}</span>
                  </button>
                  {showTidied && (
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-2">
                      {tidied.map(name => (
                        <li key={name} className="flex items-center gap-2 pl-3 pr-1 py-1">
                          <span className="flex-1 text-[15px] text-slate-500 truncate">{cap(name)}</span>
                          <button onClick={() => putBack(name)} className="h-9 px-3 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-white">Put back</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {clearedIngredients.length > 0 && (
        <p className="text-center mt-6">
          <button onClick={restoreWeeklyItems} className="text-sm font-semibold text-slate-500 hover:text-indigo-700 underline underline-offset-4">
            Put back {clearedIngredients.length} item{clearedIngredients.length === 1 ? '' : 's'} already bought this week
          </button>
        </p>
      )}

      {undo && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-[150] flex items-center gap-4 pl-5 pr-2 py-2 rounded-2xl bg-slate-900 text-white shadow-xl" role="status">
          <span className="text-sm font-semibold">Cleared {undo.count} item{undo.count === 1 ? '' : 's'}</span>
          <button onClick={undoFinish} className="h-9 px-3 rounded-xl text-sm font-bold text-amber-300 hover:bg-white/10">Undo</button>
        </div>
      )}
    </div>
  );
};

export default ShoppingList;
