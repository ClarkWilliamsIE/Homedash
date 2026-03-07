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
  onAddManualShoppingItem: (name: string) => void; // New Shortcut
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
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'new'>('all'); // New filter state
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [scale, setScale] = useState(1); 
  
  // Form State
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formIngredients, setFormIngredients] = useState<Ingredient[]>([]);
  const [formInstructions, setFormInstructions] = useState<Instruction[]>([]);
  const [formIsFavorite, setFormIsFavorite] = useState(false); // New form field
  const [formIsNew, setFormIsNew] = useState(true); // New form field

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
    setFormId('');
    setFormName('');
    setFormImageUrl('');
    setFormTags('');
    setFormIngredients([{ amount: '', unit: '', item: '' }]);
    setFormInstructions([{ text: '', isHeader: false }]);
    setFormIsFavorite(false);
    setFormIsNew(true);
    setSelectedFile(null);
    setPreviewUrl(null);
    setScale(1);
  };

  const startEditing = (recipe: Recipe) => {
    setFormId(recipe.id);
    setFormName(recipe.name);
    setFormImageUrl(recipe.imageUrl);
    setFormTags(recipe.tags.join(', '));
    setFormIngredients(recipe.ingredients.length ? [...recipe.ingredients] : [{ amount: '', unit: '', item: '' }]);
    setFormInstructions(recipe.instructions.length ? [...recipe.instructions] : [{ text: '', isHeader: false }]);
    setFormIsFavorite(!!recipe.isFavorite);
    setFormIsNew(!!recipe.isNew);
    setPreviewUrl(recipe.imageUrl);
    setIsEditing(true);
    setViewingRecipe(null);
    setIsAdding(true);
  };

  const closeModal = () => {
    setIsAdding(false);
    setIsEditing(false);
    resetForm();
  };

  const handleScrape = async () => {
    if (!importUrl.trim()) return;
    setIsScraping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `Extract recipe data from: ${importUrl}. Output valid JSON only: { "name": "string", "ingredients": [ { "amount": "string", "unit": "string", "item": "string" } ], "instructions": [ { "text": "string", "isHeader": boolean } ], "tags": "string", "imageUrl": "string" }`,
      });
      let rawText = (response as any).text();
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      setFormName(data.name || '');
      setFormIngredients(data.ingredients || []);
      setFormInstructions(data.instructions || []);
      setFormTags(data.tags || '');
      setFormImageUrl(data.imageUrl || '');
      setPreviewUrl(data.imageUrl || null);
      setImportUrl('');
    } catch (err) { console.error(err); alert("AI Import failed."); } finally { setIsScraping(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;
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
    if (success) closeModal();
    setIsSubmitting(false);
  };

  const toggleFavoriteShortcut = async (e: React.MouseEvent, recipe: Recipe) => {
    e.stopPropagation();
    await onUpdateRecipe({ ...recipe, isFavorite: !recipe.isFavorite });
  };

  // DYNAMIC INPUT UTILS
  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngs = [...formIngredients];
    newIngs[index] = { ...newIngs[index], [field]: value };
    setFormIngredients(newIngs);
  };
  const addIngredientLine = () => setFormIngredients([...formIngredients, { amount: '', unit: '', item: '' }]);
  const removeIngredientLine = (index: number) => setFormIngredients(formIngredients.filter((_, i) => i !== index));
  const updateInstruction = (index: number, field: keyof Instruction, value: any) => {
    const newInst = [...formInstructions];
    newInst[index] = { ...newInst[index], [field]: value };
    setFormInstructions(newInst);
  };
  const addInstructionLine = () => setFormInstructions([...formInstructions, { text: '', isHeader: false }]);
  const removeInstructionLine = (index: number) => setFormInstructions(formInstructions.filter((_, i) => i !== index));

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
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all ${filterMode === btn.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white'}`}
          >
            {btn.label}
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${filterMode === btn.id ? 'bg-white/20' : 'bg-slate-100'}`}>{btn.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-8">
        <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
          <div className="relative w-full max-w-lg">
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all" />
            <svg className="absolute left-4 top-4.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            <button onClick={() => { resetForm(); setIsAdding(true); }} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all">+ New Recipe</button>
            <button onClick={onRefresh} className="flex-1 lg:flex-none px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all">Sync</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
          {filtered.map(recipe => (
            <div key={recipe.id} onClick={() => { setScale(1); setViewingRecipe(recipe); }} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-100 transition-all hover:shadow-xl group cursor-pointer relative">
              {/* Floating Favorite Toggle */}
              <button 
                onClick={(e) => toggleFavoriteShortcut(e, recipe)}
                className={`absolute top-4 right-4 z-10 w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all ${recipe.isFavorite ? 'bg-red-500 text-white shadow-lg' : 'bg-black/20 text-white hover:bg-black/40'}`}
              >
                <svg className="w-5 h-5" fill={recipe.isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              </button>

              <div className="relative h-56">
                <img src={recipe.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={recipe.name} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h4 className="text-xl font-bold text-white mb-1 drop-shadow-md">{recipe.name}</h4>
                  <div className="flex flex-wrap gap-2">
                    {recipe.isNew && <span className="text-[8px] font-black text-white bg-emerald-500 px-2 py-0.5 rounded-full uppercase tracking-tighter">New</span>}
                    {recipe.tags.slice(0, 1).map(tag => (
                      <span key={tag} className="text-[8px] font-bold text-white/90 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full uppercase tracking-tighter">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-500 font-medium line-clamp-2 leading-relaxed">
                  {recipe.ingredients.map(i => i.item).join(' • ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* VIEW MODAL */}
      {viewingRecipe && (
        <div className="fixed inset-0 z-[100] bg-white md:bg-black/60 md:backdrop-blur-md flex items-center justify-center md:p-6">
          <div className="bg-white w-full h-full md:max-w-7xl md:h-[90vh] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative">
            <div className="absolute top-6 right-6 z-20 flex gap-3">
               <button onClick={() => startEditing(viewingRecipe)} className="px-4 py-2 bg-white/90 backdrop-blur text-indigo-600 font-bold rounded-full shadow-sm hover:bg-indigo-50 transition-all">Edit</button>
               <button onClick={() => setViewingRecipe(null)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] h-full">
                <div className="relative h-64 lg:h-full bg-slate-100">
                  <img src={viewingRecipe.imageUrl} className="w-full h-full object-cover" alt="" />
                </div>
                <div className="p-8 lg:p-12 space-y-10">
                  <div>
                    <div className="flex gap-2 mb-4">
                      {viewingRecipe.isNew && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">New/Untried</span>}
                      {viewingRecipe.tags.map(t => <span key={t} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">{t}</span>)}
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight leading-tight">{viewingRecipe.name}</h2>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-12">
                    <div>
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Ingredients</h3>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                          {[0.5, 1, 2].map(s => (
                             <button key={s} onClick={() => setScale(s)} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${scale === s ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                               {s === 0.5 ? '1/2' : s}x
                             </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {viewingRecipe.ingredients.map((ing, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl group/ing">
                            <span className="text-sm font-bold text-slate-700 leading-tight">
                              <span className="text-indigo-600 mr-2">{scaleIngredient(ing.amount, scale)} {ing.unit}</span>
                              {ing.item}
                            </span>
                            {/* Ingredient-to-Shopping Shortcut */}
                            <button 
                              onClick={() => onAddManualShoppingItem(`${ing.item} (${scaleIngredient(ing.amount, scale)} ${ing.unit})`)}
                              className="opacity-0 group-hover/ing:opacity-100 p-2 bg-white text-indigo-600 rounded-xl shadow-sm hover:bg-indigo-600 hover:text-white transition-all"
                              title="Restock this item"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="xl:border-l xl:border-slate-100 xl:pl-12">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Method</h3>
                      <div className="space-y-6">
                        {viewingRecipe.instructions?.map((step, idx) => (
                          step.isHeader ? (
                            <h4 key={idx} className="text-xl font-bold text-slate-800 mt-10 mb-2 pb-2 border-b border-slate-100">{step.text}</h4>
                          ) : (
                            <div key={idx} className="flex gap-4 group">
                              <div className="w-1 bg-indigo-100 rounded-full self-stretch group-hover:bg-indigo-300 transition-colors"></div>
                              <p className="text-lg text-slate-600 leading-relaxed font-medium">{step.text}</p>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT/ADD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 my-10 relative">
            <button onClick={closeModal} className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 transition-colors">✕</button>
            <h3 className="text-3xl font-black text-slate-900 mb-2">{isEditing ? 'Edit Recipe' : 'New Recipe'}</h3>
            
            {!isEditing && (
              <div className="mb-8 p-4 bg-indigo-50 rounded-3xl flex gap-2">
                <input type="text" placeholder="Paste URL to import..." className="flex-1 bg-white border-none rounded-2xl px-4 py-2 text-sm outline-none" value={importUrl} onChange={e => setImportUrl(e.target.value)} />
                <button onClick={handleScrape} disabled={isScraping || !importUrl} className="px-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 disabled:opacity-50 text-xs">
                  {isScraping ? 'Thinking...' : 'AI Import'}
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="block text-xs font-black uppercase text-slate-400">Name</label>
                  <input required type="text" className="w-full bg-slate-50 rounded-xl px-4 py-2 outline-none border border-transparent focus:border-indigo-200" value={formName} onChange={e => setFormName(e.target.value)} />
                  <div className="flex gap-4">
                    <label className="flex-1 flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                      <input type="checkbox" checked={formIsFavorite} onChange={e => setFormIsFavorite(e.target.checked)} className="accent-red-500 w-4 h-4" />
                      <span className="text-xs font-bold text-slate-600">Favorite</span>
                    </label>
                    <label className="flex-1 flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                      <input type="checkbox" checked={formIsNew} onChange={e => setFormIsNew(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                      <span className="text-xs font-bold text-slate-600">Untried</span>
                    </label>
                  </div>
                </div>
                <div>
                   <label className="block text-xs font-black uppercase text-slate-400 mb-2">Photo</label>
                   {previewUrl ? (
                    <div className="relative h-32 w-full rounded-2xl overflow-hidden border-2 border-indigo-100">
                      <img src={previewUrl} className="w-full h-full object-cover" alt="" />
                      <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg">✕</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all group">
                      <svg className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="text-[10px] font-black uppercase text-slate-400">Upload</p>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Ingredients</label>
                <div className="space-y-2">
                  {formIngredients.map((ing, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" placeholder="1/2" className="w-16 bg-slate-50 rounded-lg px-2 py-2 text-sm text-center border border-transparent focus:border-indigo-200 outline-none" value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)} />
                      <input type="text" placeholder="cup" className="w-16 bg-slate-50 rounded-lg px-2 py-2 text-sm text-center border border-transparent focus:border-indigo-200 outline-none" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} />
                      <input type="text" placeholder="Flour" className="flex-1 bg-slate-50 rounded-lg px-3 py-2 text-sm font-medium border border-transparent focus:border-indigo-200 outline-none" value={ing.item} onChange={e => updateIngredient(i, 'item', e.target.value)} />
                      <button type="button" onClick={() => removeIngredientLine(i)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addIngredientLine} className="text-xs font-bold text-indigo-500 py-2">+ Add Item</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Instructions</label>
                <div className="space-y-2">
                  {formInstructions.map((inst, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" placeholder={inst.isHeader ? "Section Header" : "Step description..."} className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-transparent focus:border-indigo-200 ${inst.isHeader ? 'bg-indigo-50 font-bold text-indigo-700' : 'bg-slate-50'}`} value={inst.text} onChange={e => updateInstruction(i, 'text', e.target.value)} />
                      <label className="flex items-center gap-1 cursor-pointer bg-slate-50 px-2 py-2 rounded-lg">
                        <input type="checkbox" checked={inst.isHeader} onChange={e => updateInstruction(i, 'isHeader', e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase text-slate-400">Hdr</span>
                      </label>
                      <button type="button" onClick={() => removeInstructionLine(i)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addInstructionLine} className="text-xs font-bold text-indigo-500 py-2">+ Add Step</button>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 py-3 font-bold text-slate-400 hover:bg-slate-50 rounded-xl">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {isSubmitting ? 'Saving...' : 'Save Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeBook;
