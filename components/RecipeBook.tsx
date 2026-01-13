import React, { useState, useMemo } from 'react';
import { Recipe } from '../types';
import { GoogleGenAI } from "@google/genai";
import { API_KEY } from '../constants';

interface RecipeBookProps {
  recipes: Recipe[];
  onRefresh: () => void;
  onAddRecipe: (recipe: Omit<Recipe, 'id'>, imageFile?: File) => Promise<boolean>;
}

const RecipeBook: React.FC<RecipeBookProps> = ({ recipes, onRefresh, onAddRecipe }) => {
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [newRecipe, setNewRecipe] = useState({ name: '', ingredients: '', instructions: '', tags: '', imageUrl: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    return recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [recipes, search]);

  const handleScrape = async () => {
    if (!importUrl.trim()) return;
    setIsScraping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY! });
      
      // We use 1.5-flash because it is very stable with Tools+JSON on the free tier
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite', 
        contents: `You are a recipe scraping assistant.
        
        TASK:
        1. Use the 'googleSearch' tool to read the content of this URL: ${importUrl}
        2. From the search results, extract the recipe Name, Ingredients, Instructions, and Image URL.
        3. COMPILE your findings into the exact JSON format below.
        
        IMPORTANT: 
        - You MUST return text. Do not just perform the search and stop.
        - Return ONLY raw JSON. No markdown backticks.
        
        REQUIRED JSON STRUCTURE:
        {
          "name": "Recipe Title",
          "ingredients": "item 1, item 2, item 3 (comma separated string)",
          "instructions": "Step 1... || Step 2... || Step 3... (use double-pipe '||' to separate steps)",
          "tags": "Dinner, Healthy, etc (comma separated)",
          "imageUrl": "URL of the main food image found"
        }`,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      
      // --- ROBUST TEXT EXTRACTION ---
      let rawText = '';
      
      // 1. Try standard text() method
      if (typeof response.text === 'function') {
        try { rawText = response.text(); } catch (e) { /* ignore */ }
      } 
      
      // 2. Try text property
      if (!rawText && typeof response.text === 'string') {
        rawText = response.text;
      }

      // 3. Fallback: Parse candidates manually
      if (!rawText && response.candidates && response.candidates[0]) {
         const candidate = response.candidates[0];
         if (candidate.content && candidate.content.parts) {
            // Join all text parts, ignoring function calls
            rawText = candidate.content.parts
              .filter((p: any) => p.text)
              .map((p: any) => p.text)
              .join('');
         }
      }

      if (!rawText) {
        console.error("Full AI Response:", response);
        throw new Error("AI performed the search but returned no summary. The site might be blocking the bot.");
      }
      // ------------------------------

      // Clean the response
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Attempt to find JSON object if there is extra text
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      const finalJsonString = jsonMatch ? jsonMatch[0] : cleanJson;

      const data = JSON.parse(finalJsonString);

      setNewRecipe({
        name: data.name || '',
        ingredients: data.ingredients || '',
        instructions: data.instructions?.split('||').map((s: string) => s.trim()).join('\n') || '',
        tags: data.tags || '',
        imageUrl: data.imageUrl || ''
      });
      setPreviewUrl(data.imageUrl || null);
      setImportUrl('');
    } catch (err) {
      console.error("Scraping failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`AI Import failed: ${msg}. You may need to enter this one manually.`);
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
    if (!newRecipe.name || !newRecipe.ingredients) return;
    
    setIsSubmitting(true);
    const success = await onAddRecipe({
      name: newRecipe.name,
      ingredients: newRecipe.ingredients.split(',').map(s => s.trim()),
      instructions: newRecipe.instructions.split('\n').map(s => s.trim()).filter(s => s),
      tags: newRecipe.tags.split(',').map(s => s.trim()),
      imageUrl: newRecipe.imageUrl || `https://picsum.photos/seed/${newRecipe.name}/400/300`
    }, selectedFile || undefined);

    if (success) {
      setIsAdding(false);
      setNewRecipe({ name: '', ingredients: '', instructions: '', tags: '', imageUrl: '' });
      setSelectedFile(null);
      setPreviewUrl(null);
    }
    setIsSubmitting(false);
  };

  const openRecipe = (recipe: Recipe) => {
    setViewingRecipe(recipe);
    setCheckedIngredients({});
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
        <div className="relative w-full max-w-lg">
          <input
            type="text"
            placeholder="Search your favorites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
          />
          <svg className="absolute left-4 top-4.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        
        <div className="flex gap-3 w-full lg:w-auto">
          <button onClick={() => setIsAdding(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all">+ New Recipe</button>
          <button onClick={onRefresh} className="flex-1 lg:flex-none px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all">Sync</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {filtered.map(recipe => (
          <div key={recipe.id} onClick={() => openRecipe(recipe)} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-100 transition-all hover:shadow-xl group cursor-pointer">
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
               <p className="text-sm text-slate-500 font-medium line-clamp-3 leading-relaxed">{recipe.ingredients.join(' • ')}</p>
               <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">View Recipe</span>
                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </div>
               </div>
            </div>
          </div>
        ))}
      </div>

      {viewingRecipe && (
        <div className="fixed inset-0 z-[100] bg-white md:bg-black/60 md:backdrop-blur-md flex items-center justify-center md:p-10">
          <div className="bg-white w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative">
            <button onClick={() => setViewingRecipe(null)} className="absolute top-6 right-6 z-20 w-12 h-12 bg-white/10 backdrop-blur-md text-white md:text-slate-400 md:hover:text-slate-900 md:bg-slate-100 rounded-full flex items-center justify-center transition-all">✕</button>
            
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                <div className="relative h-80 lg:h-full bg-slate-100">
                  <img src={viewingRecipe.imageUrl} className="w-full h-full object-cover" alt={viewingRecipe.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent lg:hidden"></div>
                  <div className="absolute bottom-8 left-8 right-8 lg:hidden">
                    <h2 className="text-4xl font-black text-white">{viewingRecipe.name}</h2>
                  </div>
                </div>

                <div className="p-8 lg:p-16 space-y-12">
                  <div className="hidden lg:block">
                    <div className="flex gap-2 mb-4">
                      {viewingRecipe.tags.map(t => <span key={t} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">{t}</span>)}
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight leading-tight">{viewingRecipe.name}</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        Ingredients
                      </h3>
                      <ul className="space-y-4">
                        {viewingRecipe.ingredients.map((ing, idx) => (
                          <li key={idx} className="flex items-start gap-3 cursor-pointer group" onClick={() => setCheckedIngredients(prev => ({ ...prev, [idx]: !prev[idx] }))}>
                            <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${checkedIngredients[idx] ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200 group-hover:border-indigo-300'}`}>
                              {checkedIngredients[idx] && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className={`text-lg font-medium transition-all ${checkedIngredients[idx] ? 'text-slate-300 line-through' : 'text-slate-700'}`}>{ing}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="md:border-l md:border-slate-100 md:pl-12">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        Instructions
                      </h3>
                      <ol className="space-y-8">
                        {viewingRecipe.instructions?.map((step, idx) => (
                          <li key={idx} className="flex gap-4">
                            <span className="text-2xl font-black text-indigo-100 leading-none">{idx + 1}</span>
                            <p className="text-lg text-slate-700 leading-relaxed font-medium">{step}</p>
                          </li>
                        ))}
                        {(!viewingRecipe.instructions || viewingRecipe.instructions.length === 0) && (
                          <p className="text-slate-400 italic">No instructions provided for this recipe.</p>
                        )}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 my-8 relative">
            <button onClick={() => setIsAdding(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 transition-colors">✕</button>
            <h3 className="text-3xl font-black text-slate-900 mb-2">New Recipe</h3>
            <p className="text-slate-500 mb-8 font-medium">Import from the web or enter manually.</p>
            
            <div className="mb-8 p-6 bg-indigo-50 rounded-3xl space-y-4">
              <label className="block text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Import from URL</label>
              <div className="flex gap-2">
                <input type="text" placeholder="https://www.bbcgoodfood.com/..." className="flex-1 bg-white border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" value={importUrl} onChange={e => setImportUrl(e.target.value)} />
                <button onClick={handleScrape} disabled={isScraping || !importUrl} className="px-6 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2">
                  {isScraping ? <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : 'AI Import'}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Recipe Name</label>
                    <input required type="text" placeholder="e.g. Nana's Cookies" className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-medium text-slate-800 focus:ring-4 focus:ring-indigo-50 outline-none" value={newRecipe.name} onChange={e => setNewRecipe({...newRecipe, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Recipe Photo</label>
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
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Ingredients</label>
                    <textarea required placeholder="Separate with commas..." className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-medium text-slate-800 h-32 focus:ring-4 focus:ring-indigo-50 outline-none" value={newRecipe.ingredients} onChange={e => setNewRecipe({...newRecipe, ingredients: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Instructions</label>
                    <textarea required placeholder="One step per line..." className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-medium text-slate-800 h-32 focus:ring-4 focus:ring-indigo-50 outline-none" value={newRecipe.instructions} onChange={e => setNewRecipe({...newRecipe, instructions: e.target.value})} />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-4 font-black text-slate-400 hover:text-slate-600 rounded-2xl transition-all">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isSubmitting ? 'Saving...' : 'Save to Family Book'}
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
