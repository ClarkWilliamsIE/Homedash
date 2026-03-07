// components/RecipePicker.tsx
import React, { useState, useMemo } from 'react';
import { Recipe } from '../types';

interface RecipePickerProps {
  recipes: Recipe[];
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
}

const RecipePicker: React.FC<RecipePickerProps> = ({ recipes, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'new'>('all');

  const filtered = useMemo(() => {
    return recipes.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
      if (filterMode === 'favorites') return matchesSearch && r.isFavorite;
      if (filterMode === 'new') return matchesSearch && r.isNew;
      return matchesSearch;
    });
  }, [recipes, search, filterMode]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-900">Choose a Meal</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">✕</button>
        </div>
        
        <div className="p-4 bg-slate-50 border-b border-slate-100 space-y-3">
          <input 
            type="text" 
            placeholder="Search your recipes..." 
            className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'favorites', label: 'Favorites' },
              { id: 'new', label: 'Untried' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id as any)}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  filterMode === tab.id 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-10">No recipes found.</p>
          ) : (
            filtered.map(recipe => (
              <button 
                key={recipe.id}
                onClick={() => onSelect(recipe)}
                className="w-full flex items-center gap-4 p-3 hover:bg-indigo-50 rounded-2xl transition-all group border border-transparent hover:border-indigo-100"
              >
                <div className="relative">
                  <img src={recipe.imageUrl} className="w-16 h-16 rounded-xl object-cover shadow-sm" alt={recipe.name} />
                  {recipe.isFavorite && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{recipe.name}</h4>
                  <p className="text-xs text-slate-500 truncate">{recipe.tags.join(' • ')}</p>
                </div>
                <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipePicker;
