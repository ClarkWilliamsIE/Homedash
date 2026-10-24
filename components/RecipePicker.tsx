// components/RecipePicker.tsx
import React, { useState, useMemo } from 'react';
import { Recipe } from '../types';
import { CustomMealForm, Icon, Sheet, makeCustomMeal } from './ui';

interface RecipePickerProps {
  recipes: Recipe[];
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
  title?: string;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'new', label: 'Not tried yet' },
] as const;

const RecipePicker: React.FC<RecipePickerProps> = ({ recipes, onSelect, onClose, title = 'Choose a recipe' }) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'new'>('all');
  const [custom, setCustom] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter(r => {
      const matches = r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q));
      if (filterMode === 'favorites') return matches && r.isFavorite;
      if (filterMode === 'new') return matches && r.isNew;
      return matches;
    }).sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite) || a.name.localeCompare(b.name));
  }, [recipes, search, filterMode]);

  if (custom) {
    return (
      <Sheet open onClose={onClose} title="Something else">
        <button onClick={() => setCustom(false)} className="flex items-center gap-1 text-sm font-semibold text-indigo-700 mb-4"><Icon.Back className="w-4 h-4" /> Back to recipes</button>
        <CustomMealForm submitLabel="Add to the plan" onSubmit={(name, items) => onSelect(makeCustomMeal(name, items) as Recipe)} />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="sticky -top-4 -mt-4 pt-4 pb-3 bg-white z-10 space-y-3">
        <div className="relative">
          <Icon.Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search recipes"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              className={`h-9 px-3.5 rounded-full text-sm font-semibold ${filterMode === tab.id ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => setCustom(true)} className="w-full flex items-center gap-4 p-2 mb-1 rounded-2xl hover:bg-orange-50 text-left">
        <span className="w-16 h-16 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0"><Icon.Plus className="w-6 h-6" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-900">Something else</span>
          <span className="block text-sm text-slate-500">Going out, a BBQ, takeaways: add a title and a few items</span>
        </span>
      </button>

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-10">No recipes match.</p>
      ) : (
        <ul className="space-y-1 pb-2">
          {filtered.map(recipe => (
            <li key={recipe.id}>
              <button
                onClick={() => onSelect(recipe)}
                className="w-full flex items-center gap-4 p-2 rounded-2xl hover:bg-indigo-50 active:bg-indigo-50 text-left"
              >
                <img src={recipe.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <span className="truncate">{recipe.name}</span>
                    {recipe.isFavorite && <Icon.Heart filled className="w-4 h-4 text-orange-500 shrink-0" />}
                  </span>
                  <span className="block text-sm text-slate-500 truncate">{recipe.tags.join(', ') || `${recipe.ingredients.length} ingredients`}</span>
                </span>
                <Icon.Next className="w-5 h-5 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
};

export default RecipePicker;
