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
}

const RecipeBook: React.FC<RecipeBookProps> = ({ 
  recipes, 
  onRefresh, 
  onAddRecipe, 
  onUpdateRecipe, 
  onDeleteRecipe,
  hiddenIngredients,
  onUpdateHidden
}) => {
  const [search, setSearch] = useState('');
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [recipes, search]);

  // -- FORM HELPERS --
  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormImageUrl('');
    setFormTags('');
    setFormIngredients([{ amount: '', unit: '', item: '' }]);
    setFormInstructions([{ text: '', isHeader: false }]);
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

  // -- HANDLERS --
  const handleScrape = async () => {
    if (!importUrl.trim()) return;
    setIsScraping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite', // Reverted to 2.5-flash-lite
        contents: `You are a recipe scraping assistant.
        TASK: Extract recipe data from: ${importUrl}
        Output: valid JSON only.
        Structure:
        {
          "name": "string",
          "ingredients": [ { "amount": "string (number or fraction)", "unit": "string", "item": "string" } ],
          "instructions": [ { "text": "string", "isHeader": boolean } ],
          "tags": "string (comma separated)",
          "imageUrl": "string"
        }
        For instruction headers (like "For the Sauce"), set isHeader: true.
        For ingredient amounts, use fractions like "1/2" where possible.
        `,
        config: { tools: [{ googleSearch: {} }] }
      });
      
      let rawText = '';
      if (typeof response.text === 'function') rawText = response.text();
      else if (response.candidates?.[0]?.content?.parts) rawText = response.candidates[0].content.parts.map((p: any) => p.text || '').join('');

      if (!rawText) throw new Error("AI returned no text.");

      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);

      setFormName(data.name || '');
      setFormIngredients(data.ingredients || []);
      setFormInstructions(data.instructions || []);
      setFormTags(data.tags || '');
      setFormImageUrl(data.imageUrl || '');
      setPreviewUrl(data.imageUrl || null);
      setImportUrl('');
    } catch (err) {
      console.error("Scraping failed", err);
      alert("AI Import failed. Try manually.");
    } finally {
      setIsScraping(false);
    }
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
      imageUrl: formImageUrl || `https://picsum.photos/seed/${formName}/400/300`
    };
    let success = false;
    if (isEditing) success = await onUpdateRecipe({ ...recipeData, id: formId }, selectedFile || undefined);
    else success = await onAddRecipe(recipeData, selectedFile || undefined);
    if (success) closeModal();
    setIsSubmitting(false);
  };

  // -- DYNAMIC FORM INPUTS --
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

  const toggleIngredientShopping = (ingredientItem: string) => {
    const clean = ingredientItem.toLowerCase().trim();
    if (hiddenIngredients.includes(clean)) onUpdateHidden(hiddenIngredients.filter(i => i !== clean));
    else onUpdateHidden([...hiddenIngredients, clean]);
  };

  const handleDelete = async (id: string) => {
    if (await onDeleteRecipe(id)) setViewingRecipe(null);
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
        <div className="relative w-full max-w-lg">
          <input type="text" placeholder="Search recipes..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all" />
          <svg className="absolute left-4 top-4.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <div className="flex gap-3 w-full lg:w-auto">
          <button onClick={() => { resetForm(); setIsAdding(true); }} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all">+ New Recipe</button>
          <button onClick={onRefresh} className="flex-1 lg:flex-none px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all">Sync</button>
        </div>
      </div>

      {/* RECIPE GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {filtered.map(recipe => (
          <div key={recipe.id} onClick={() => { setScale(1); setViewingRecipe(recipe); }} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-100 transition-all hover:shadow-xl group cursor-pointer">
            <div className="relative h-64">
               <img src={recipe.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={recipe.name} />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
               <div className="absolute bottom-4 left-4 right-4">
                  <h4 className="text-xl font-bold text-white mb-1 drop-shadow-md">{recipe.name}</h4>
                  <div className="flex flex-wrap gap-2">
                    {recipe.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] font-bold text-white/90 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full uppercase tracking-tighter">{tag}</span>
                    ))}
                  </div>
               </div>
            </div>
            <div className="p-6">
               <p className="text-sm text-slate-500 font-medium line-clamp-3 leading-relaxed">
                  {recipe.ingredients.map(i => i.item).join(' • ')}
               </p>
            </div>
          </div>
        ))}
      </div>

      {/* VIEW MODAL */}
      {viewingRecipe && (
        <div className="fixed inset-0 z-[100] bg-white md:bg-black/60 md:backdrop-blur-md flex items-center justify-center md:p-6">
          <div className="bg-white w-full h-full md:max-w-7xl md:h-[90vh] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative">
            
            {/* Action Bar */}
            <div className="absolute top-6 right-6 z-20 flex gap-3">
               <button onClick={() => startEditing(viewingRecipe)} className="px-4 py-2 bg-white/90 backdrop-blur text-indigo-600 font-bold rounded-full shadow-sm hover:bg-indigo-50 transition-all">Edit</button>
               <button onClick={() => handleDelete(viewingRecipe.id)} className="px-4 py-2 bg-white/90 backdrop-blur text-red-500 font-bold rounded-full shadow-sm hover:bg-red-50 transition-all">Delete</button>
               <button onClick={() => setViewingRecipe(null)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] h-full">
                {/* Left: Image Sidebar */}
                <div className="relative h-64 lg:h-full bg-slate-100">
                  <img src={viewingRecipe.imageUrl} className="w-full h-full object-cover" alt={viewingRecipe.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent lg:hidden"></div>
                  <div className="absolute bottom-8 left-8 right-8 lg:hidden">
                    <h2 className="text-3xl font-black text-white">{viewingRecipe.name}</h2>
                  </div>
                </div>

                {/* Right: Content */}
                <div className="p-8 lg:p-12 space-y-10">
                  <div className="hidden lg:block">
                    <div className="flex gap-2 mb-4">
                      {viewingRecipe.tags.map(t => <span key={t} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">{t}</span>)}
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight leading-tight">{viewingRecipe.name}</h2>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-12">
                    {/* Ingredients Section */}
                    <div>
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Ingredients</h3>
                        <div className="flex bg-slate-100 rounded-lg p-1">
                          {[0.5, 1, 2].map(s => (
                             <button 
                                key={s} 
                                onClick={() => setScale(s)} 
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${scale === s ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                               {s === 0.5 ? '1/2' : s}x
                             </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-3">
                        {viewingRecipe.ingredients.map((ing, idx) => {
                          const cleanName = ing.item.toLowerCase().trim();
                          const isNeeded = !hiddenIngredients.includes(cleanName);
                          const displayAmount = scaleIngredient(ing.amount, scale);

                          return (
                            <div 
                              key={idx} 
                              onClick={() => toggleIngredientShopping(ing.item)}
                              className={`flex flex-col p-3 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md select-none ${
                                isNeeded 
                                  ? 'bg-white border-slate-100' 
                                  : 'bg-slate-50 border-transparent opacity-60 grayscale'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                 <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isNeeded ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300'}`}>
                                    {isNeeded && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                 </div>
                                 <div className="text-right">
                                   <span className="text-lg font-black text-indigo-600 leading-none block">{displayAmount}</span>
                                   <span className="text-[10px] font-bold text-indigo-300 uppercase leading-none block">{ing.unit}</span>
                                 </div>
                              </div>
                              <span className={`text-sm font-bold leading-tight ${!isNeeded ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                {ing.item}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Instructions Section */}
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

      {/* EDIT/ADD MODAL (Fix: items-start for scrolling) */}
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
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="block text-xs font-black uppercase text-slate-400">Name</label>
                  <input required type="text" className="w-full bg-slate-50 rounded-xl px-4 py-2 outline-none border border-transparent focus:border-indigo-200" value={formName} onChange={e => setFormName(e.target.value)} />
                  
                  <label className="block text-xs font-black uppercase text-slate-400">Photo</label>
                  {/* Restored Large Photo Upload UI */}
                  {previewUrl ? (
                    <div className="relative h-40 w-full rounded-3xl overflow-hidden border-2 border-indigo-100">
                      <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />
                      <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg">✕</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-40 w-full border-2 border-dashed border-slate-200 rounded-3xl cursor-pointer hover:bg-slate-50 transition-all group">
                      <svg className="w-10 h-10 text-slate-300 group-hover:text-indigo-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="text-[10px] font-black uppercase text-slate-400">Upload Photo</p>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
                <div>
                   <label className="block text-xs font-black uppercase text-slate-400 mb-2">Tags</label>
                   <input type="text" placeholder="Dinner, Quick..." className="w-full bg-slate-50 rounded-xl px-4 py-2 outline-none border border-transparent focus:border-indigo-200" value={formTags} onChange={e => setFormTags(e.target.value)} />
                </div>
              </div>

              {/* Ingredients Editor */}
              <div>
                <div className="flex justify-between items-end mb-2">
                   <label className="block text-xs font-black uppercase text-slate-400">Ingredients</label>
                   <span className="text-[10px] text-slate-300">Amount | Unit | Item</span>
                </div>
                <div className="space-y-2">
                  {formIngredients.map((ing, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" placeholder="1/2" className="w-16 bg-slate-50 rounded-lg px-2 py-2 text-sm text-center outline-none border border-transparent focus:border-indigo-200" value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)} />
                      <input type="text" placeholder="cup" className="w-16 bg-slate-50 rounded-lg px-2 py-2 text-sm text-center outline-none border border-transparent focus:border-indigo-200" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} />
                      <input type="text" placeholder="Flour" className="flex-1 bg-slate-50 rounded-lg px-3 py-2 text-sm outline-none font-medium border border-transparent focus:border-indigo-200" value={ing.item} onChange={e => updateIngredient(i, 'item', e.target.value)} />
                      <button type="button" onClick={() => removeIngredientLine(i)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addIngredientLine} className="text-xs font-bold text-indigo-500 hover:text-indigo-700 py-2">+ Add Ingredient</button>
                </div>
              </div>

              {/* Instructions Editor */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Instructions</label>
                <div className="space-y-2">
                  {formInstructions.map((inst, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <input 
                           type="text" 
                           placeholder={inst.isHeader ? "Section Header (e.g. For the Sauce)" : "Step description..."}
                           className={`w-full rounded-lg px-3 py-2 text-sm outline-none border border-transparent focus:border-indigo-200 ${inst.isHeader ? 'bg-indigo-50 font-bold text-indigo-700' : 'bg-slate-50'}`} 
                           value={inst.text} 
                           onChange={e => updateInstruction(i, 'text', e.target.value)} 
                        />
                      </div>
                      <label className="flex items-center gap-1 cursor-pointer bg-slate-50 px-2 py-2 rounded-lg" title="Toggle Header">
                        <input type="checkbox" checked={inst.isHeader} onChange={e => updateInstruction(i, 'isHeader', e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase text-slate-400">Header</span>
                      </label>
                      <button type="button" onClick={() => removeInstructionLine(i)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addInstructionLine} className="text-xs font-bold text-indigo-500 hover:text-indigo-700 py-2">+ Add Step</button>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 py-3 font-bold text-slate-400 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
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
