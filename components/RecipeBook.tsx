// components/RecipeBook.tsx

import React, { useState, useMemo } from 'react';
import { Recipe, Ingredient, Instruction } from '../types';
import { GoogleGenAI } from "@google/genai";
import { API_KEY } from '../constants';

// --- UTILS FOR SCALING ---

const parseAmount = (amount: string): number => {
  if (!amount) return 0;
  const trimmed = amount.trim();
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/');
    return parseFloat(num) / parseFloat(den);
  }
  return parseFloat(trimmed);
};

const formatAmount = (val: number): string => {
  if (val === 0) return '';
  const tolerance = 0.05;
  if (Math.abs(val - 0.25) < tolerance) return '1/4';
  if (Math.abs(val - 0.33) < tolerance) return '1/3';
  if (Math.abs(val - 0.5) < tolerance) return '1/2';
  if (Math.abs(val - 0.66) < tolerance) return '2/3';
  if (Math.abs(val - 0.75) < tolerance) return '3/4';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1).replace('.0', '');
};

const scaleIngredient = (amountStr: string, factor: number): string => {
  if (!amountStr) return '';
  const match = amountStr.match(/^([\d./]+)/);
  if (!match) return amountStr; 
  const num = parseAmount(match[1]);
  if (isNaN(num)) return amountStr;
  const scaled = num * factor;
  return formatAmount(scaled);
};

// --- COMPONENT ---

interface RecipeBookProps {
  recipes: Recipe[];
  onRefresh: () => void;
  onAddRecipe: (recipe: Omit<Recipe, 'id'>, imageFile?: File) => Promise<boolean>;
  onUpdateRecipe: (recipe: Recipe, imageFile?: File) => Promise<boolean>;
  onDeleteRecipe: (id: string) => Promise<boolean>;
  hiddenIngredients: string[];
  onUpdateHidden: (hidden: string[]) => void;
  onAddManualShoppingItem: (name: string) => void;
}

const RecipeBook: React.FC<RecipeBookProps> = ({ 
  recipes, 
  onRefresh, 
  onAddRecipe, 
  onUpdateRecipe, 
  onDeleteRecipe,
  hiddenIngredients,
  onUpdateHidden,
  onAddManualShoppingItem
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'new'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [scale, setScale] = useState(1); 
  
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formIngredients, setFormIngredients] = useState<Ingredient[]>([]);
  const [formInstructions, setFormInstructions] = useState<Instruction[]>([]);
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [formIsNew, setFormIsNew] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return recipes.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
      if (filterMode === 'favorites') return matchesSearch && r.isFavorite;
      if (filterMode === 'new') return matchesSearch && r.isNew;
      return matchesSearch;
    });
  }, [recipes, search, filterMode]);

  const resetForm = () => {
    setFormId(''); setFormName(''); setFormImageUrl(''); setFormTags('');
    setFormIngredients([{ amount: '', unit: '', item: '' }]);
    setFormInstructions([{ text: '', isHeader: false }]);
    setFormIsFavorite(false); setFormIsNew(true);
    setSelectedFile(null); setPreviewUrl(null); setScale(1);
  };

  const startEditing = (recipe: Recipe) => {
    setFormId(recipe.id); setFormName(recipe.name); setFormImageUrl(recipe.imageUrl);
    setFormTags(recipe.tags.join(', '));
    setFormIngredients([...recipe.ingredients]);
    setFormInstructions([...recipe.instructions]);
    setFormIsFavorite(!!recipe.isFavorite);
    setFormIsNew(!!recipe.isNew);
    setPreviewUrl(recipe.imageUrl);
    setIsEditing(true); setViewingRecipe(null); setIsAdding(true);
  };

  const handleScrape = async () => {
    if (!importUrl.trim()) return;
    setIsScraping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `Scrape recipe: ${importUrl}. Output valid JSON: { "name": "string", "ingredients": [ { "amount": "string", "unit": "string", "item": "string" } ], "instructions": [ { "text": "string", "isHeader": boolean } ], "tags": "string", "imageUrl": "string" }`,
      });
      const rawText = (response as any).text();
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      setFormName(data.name || ''); setFormIngredients(data.ingredients || []); setFormInstructions(data.instructions || []); setFormTags(data.tags || ''); setFormImageUrl(data.imageUrl || ''); setPreviewUrl(data.imageUrl || null);
    } catch (err) { alert("AI Import failed."); } finally { setIsScraping(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const recipeData = {
      name: formName,
      ingredients: formIngredients.filter(i => i.item.trim() !== ''),
      instructions: formInstructions.filter(i => i.text.trim() !== ''),
      tags: formTags.split(',').map(s => s.trim()).filter(s => s),
      imageUrl: formImageUrl || `https://picsum.photos/seed/${formName}/400/300`,
      isFavorite: formIsFavorite,
      isNew: formIsNew
    };
    let success = false;
    if (isEditing) success = await onUpdateRecipe({ ...recipeData, id: formId }, selectedFile || undefined);
    else success = await onAddRecipe(recipeData, selectedFile || undefined);
    if (success) { setIsAdding(false); setIsEditing(false); resetForm(); }
    setIsSubmitting(false);
  };

  const toggleFavoriteShortcut = async (e: React.MouseEvent, recipe: Recipe) => {
    e.stopPropagation();
    await onUpdateRecipe({ ...recipe, isFavorite: !recipe.isFavorite });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* SIDEBAR INDEX */}
      <div className="w-full lg:w-48 space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 mb-4">Library</h3>
        {[
          { id: 'all', label: 'All Recipes', count: recipes.length },
          { id: 'favorites', label: 'Favorites', count: recipes.filter(r => r.isFavorite).length },
          { id: 'new', label: 'New/Untried', count: recipes.filter(r => r.isNew).length }
        ].map(btn => (
          <button 
            key={btn.id}
            onClick={() => setFilterMode(btn.id as any)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all ${filterMode === btn.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white'}`}
          >
            {btn.label}
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${filterMode === btn.id ? 'bg-white/20' : 'bg-slate-100'}`}>{btn.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-8">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-lg">
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50" />
            <svg className="absolute left-4 top-4.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { resetForm(); setIsAdding(true); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg">+ New</button>
            <button onClick={onRefresh} className="px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold hover:bg-slate-50">Sync</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map(recipe => (
            <div key={recipe.id} onClick={() => { setScale(1); setViewingRecipe(recipe); }} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-100 transition-all hover:shadow-xl group cursor-pointer relative">
              <button 
                onClick={(e) => toggleFavoriteShortcut(e, recipe)}
                className={`absolute top-4 right-4 z-10 w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${recipe.isFavorite ? 'bg-red-500 text-white' : 'bg-black/20 text-white hover:bg-black/40'}`}
              >
                <svg className="w-5 h-5" fill={recipe.isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              </button>
              <div className="h-48 overflow-hidden">
                <img src={recipe.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
              </div>
              <div className="p-6">
                <div className="flex gap-2 mb-2">
                  {recipe.isNew && <span className="text-[8px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase">New</span>}
                  {recipe.tags.slice(0,1).map(t => <span key={t} className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{t}</span>)}
                </div>
                <h4 className="text-lg font-bold text-slate-900 truncate">{recipe.name}</h4>
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewingRecipe && (
        <div className="fixed inset-0 z-[100] bg-white md:bg-black/60 md:backdrop-blur-md flex items-center justify-center md:p-6">
          <div className="bg-white w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative">
            <div className="absolute top-6 right-6 z-20 flex gap-2">
               <button onClick={() => startEditing(viewingRecipe)} className="px-4 py-2 bg-white/90 font-bold rounded-full text-indigo-600">Edit</button>
               <button onClick={() => setViewingRecipe(null)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 lg:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div>
                  <img src={viewingRecipe.imageUrl} className="w-full h-80 object-cover rounded-[2rem] mb-8" alt="" />
                  <h2 className="text-4xl font-black text-slate-900 mb-4">{viewingRecipe.name}</h2>
                  <div className="flex gap-2 mb-8">
                    {[0.5, 1, 2].map(s => <button key={s} onClick={() => setScale(s)} className={`px-3 py-1 text-xs font-bold rounded-lg ${scale === s ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{s}x</button>)}
                  </div>
                </div>
                <div className="space-y-8">
                  <section>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Ingredients</h3>
                    <div className="grid grid-cols-1 gap-2">
                      {viewingRecipe.ingredients.map((ing, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl group/ing">
                          <span className="text-sm font-bold text-slate-700">
                            <span className="text-indigo-600 mr-2">{scaleIngredient(ing.amount, scale)} {ing.unit}</span>
                            {ing.item}
                          </span>
                          <button 
                            onClick={() => onAddManualShoppingItem(`${ing.item} (${scaleIngredient(ing.amount, scale)} ${ing.unit})`)}
                            className="opacity-0 group-hover/ing:opacity-100 p-2 bg-white text-indigo-600 rounded-xl shadow-sm hover:bg-indigo-600 hover:text-white"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 my-10 relative">
             <h3 className="text-2xl font-black mb-6">{isEditing ? 'Edit' : 'New'} Recipe</h3>
             <form onSubmit={handleSubmit} className="space-y-6">
                <input required placeholder="Recipe Name" className="w-full p-4 bg-slate-50 rounded-2xl outline-none" value={formName} onChange={e => setFormName(e.target.value)} />
                <div className="flex gap-4">
                  <label className="flex-1 flex items-center gap-2 p-4 bg-slate-50 rounded-2xl cursor-pointer">
                    <input type="checkbox" checked={formIsFavorite} onChange={e => setFormIsFavorite(e.target.checked)} className="w-5 h-5 accent-red-500" />
                    <span className="text-sm font-bold">Favorite</span>
                  </label>
                  <label className="flex-1 flex items-center gap-2 p-4 bg-slate-50 rounded-2xl cursor-pointer">
                    <input type="checkbox" checked={formIsNew} onChange={e => setFormIsNew(e.target.checked)} className="w-5 h-5 accent-emerald-500" />
                    <span className="text-sm font-bold">New/Untried</span>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-4 font-bold text-slate-400">Cancel</button>
                  <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold">Save</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeBook;
