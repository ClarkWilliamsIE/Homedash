
import React, { useState } from 'react';
import { Recipe } from '../types';

interface RecipePickerProps {
  recipes: Recipe[];
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
}

const RecipePicker: React.FC<RecipePickerProps> = ({ recipes, onSelect, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-900">Choose a Meal</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">✕</button>
        </div>
        
        <div className="p-4 bg-slate-50 border-b border-slate-100">
          <input 
            type="text" 
            placeholder="Search your recipes..." 
            className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-10">No recipes found matching "{search}"</p>
          ) : (
            filtered.map(recipe => (
              <button 
                key={recipe.id}
                onClick={() => onSelect(recipe)}
                className="w-full flex items-center gap-4 p-3 hover:bg-indigo-50 rounded-2xl transition-all group border border-transparent hover:border-indigo-100"
              >
                <img src={recipe.imageUrl} className="w-16 h-16 rounded-xl object-cover shadow-sm" alt={recipe.name} />
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
