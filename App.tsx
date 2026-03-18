// App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote, Ingredient, Instruction } from './types';
import { API_KEY, ICONS, ROOT_FOLDER_ID } from './constants';
import Dashboard from './components/Dashboard';
import RecipeBook from './components/RecipeBook';
import ShoppingList from './components/ShoppingList';
import CalendarView from './components/CalendarView';

const INITIAL_PLAN: WeeklyPlan = {
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

export interface ManualItem {
  id: string;
  name: string;
  checked: boolean;
}

const App: React.FC = () => {
  // --- PERSISTENT SESSION STATE ---
  // Replaces the Google OAuth 'auth' state with a permanent Sheet ID
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem('family_sheet_id'));
  const [isAuth, setIsAuth] = useState(!!localStorage.getItem('family_sheet_id'));

  // --- APPLICATION STATE (Preserved from original) ---
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>([]);
  const [clearedIngredients, setClearedIngredients] = useState<string[]>([]);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [externallySelectedRecipeId, setExternallySelectedRecipeId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isInitialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  // --- NEW LOGIN LOGIC ---
  const handleLogin = (id: string) => {
    localStorage.setItem('family_sheet_id', id);
    setSpreadsheetId(id);
    setIsAuth(true);
  };

  const logout = () => {
    if (confirm("Sign out? You will need your Spreadsheet ID to log back in.")) {
      localStorage.removeItem('family_sheet_id');
      setSpreadsheetId(null);
      setIsAuth(false);
      setRecipes([]);
    }
  };

  // --- DATA FETCHING (Using API Key for permanent access) ---
  const fetchData = useCallback(async () => {
    if (!spreadsheetId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Recipes
      const recRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:H?key=${API_KEY}`);
      const recData = await recRes.json();
      if (recData.values) {
        setRecipes(recData.values.map((row: any, idx: number) => ({
          id: row[5] || idx.toString(), 
          name: row[0], 
          ingredients: JSON.parse(row[1] || '[]'), 
          instructions: JSON.parse(row[4] || '[]'),
          imageUrl: row[2] || `https://picsum.photos/seed/${idx}/400/300`,
          tags: row[3]?.split(',').map((s: string) => s.trim()) || [],
          isFavorite: row[6] === 'TRUE',
          isNew: row[7] === 'TRUE'
        })));
      }

      // 2. Fetch SyncData (Weekly Plan, Notes, etc.)
      const syncRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?key=${API_KEY}`);
      const syncData = await syncRes.json();
      if (syncData.values?.[0]?.[0]) {
        const appState = JSON.parse(syncData.values[0][0]);
        if (appState.weeklyPlan) setWeeklyPlan(appState.weeklyPlan);
        if (appState.notes) setNotes(appState.notes);
        if (appState.manualItems) setManualItems(appState.manualItems);
        if (appState.hiddenIngredients) setHiddenIngredients(appState.hiddenIngredients);
        if (appState.clearedIngredients) setClearedIngredients(appState.clearedIngredients);
        if (appState.checkedIngredients) setCheckedIngredients(appState.checkedIngredients);
      }
      
      // 3. Fetch Calendar from Sheet
      const calRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Calendar!A2:C?key=${API_KEY}`);
      const calData = await calRes.json();
      if (calData.values) {
        setCalendarEvents(calData.values.map((row: any) => ({
          id: row[2], summary: row[0], start: { date: row[1] }, end: { date: row[1] }
        })));
      }
    } catch (err) { console.error("Data fetch failed", err); }
    finally { setIsLoading(false); setTimeout(() => { isInitialLoad.current = false; }, 1000); }
  }, [spreadsheetId]);

  useEffect(() => { if (isAuth) fetchData(); }, [isAuth, fetchData]);

  // --- BACKGROUND SYNCING (Using /api/data proxy) ---
  useEffect(() => {
    if (!isAuth || isInitialLoad.current || !spreadsheetId) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const payload = JSON.stringify({ 
          weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients 
        });
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId, range: 'SyncData!A1', values: [[payload]] })
        });
      } catch (err) { console.error("Sync failed", err); }
      finally { setIsSyncing(false); }
    }, 2000);
    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, isAuth, spreadsheetId]);

  // --- RECIPE MANAGEMENT (Preserved logic) ---
  const saveAllRecipesToSheet = async (newRecipes: Recipe[]) => {
    setRecipes(newRecipes);
    if (!spreadsheetId) return;
    try {
      const values = newRecipes.map(r => [
        r.name, JSON.stringify(r.ingredients), r.imageUrl, 
        r.tags.join(', '), JSON.stringify(r.instructions), r.id,
        r.isFavorite ? 'TRUE' : 'FALSE', r.isNew ? 'TRUE' : 'FALSE'
      ]);
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, range: 'Recipes!A2:H', values, clear: true })
      });
    } catch (err) { console.error("Save recipes failed", err); }
  };

  const addRecipe = async (recipe: Omit<Recipe, 'id'>) => {
    const newRecipe = { ...recipe, id: Date.now().toString() };
    await saveAllRecipesToSheet([...recipes, newRecipe]);
    return true;
  };

  const updateRecipe = async (updatedRecipe: Recipe) => {
    const newRecipes = recipes.map(r => r.id === updatedRecipe.id ? updatedRecipe : r);
    await saveAllRecipesToSheet(newRecipes);
    return true;
  };

  const deleteRecipe = async (id: string) => {
    if (confirm("Delete this recipe?")) {
      await saveAllRecipesToSheet(recipes.filter(r => r.id !== id));
      return true;
    }
    return false;
  };

  // --- UTILITY HANDLERS (Preserved logic) ---
  const handleResetWeek = () => {
    if (confirm("Reset the week and shopping list?")) {
      setWeeklyPlan(INITIAL_PLAN);
      setClearedIngredients([]);
      setCheckedIngredients([]);
      setManualItems([]);
    }
  };

  const addManualItemFromRecipe = (name: string) => {
    const clean = name.toLowerCase().split('(')[0].trim();
    setClearedIngredients(prev => prev.filter(i => i !== clean));
    setManualItems(prev => [...prev, { id: Date.now().toString(), name, checked: false }]);
  };

  const handleOpenRecipeFromDashboard = (recipe: Recipe) => {
    setExternallySelectedRecipeId(recipe.id);
    setCurrentView(View.Recipes);
  };

  // --- RENDER LOGIN SCREEN ---
  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-12 max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg"><ICONS.Dashboard /></div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Family Harmony</h1>
            <p className="text-slate-500 mt-2">Enter your Family ID to access your dashboard.</p>
          </div>
          <input 
            type="text" 
            placeholder="Paste Spreadsheet ID here..." 
            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 transition-all text-center font-mono text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
          />
          <p className="text-[10px] text-slate-400 leading-relaxed uppercase tracking-widest">Found in your Google Sheet URL</p>
        </div>
      </div>
    );
  }

  // --- RENDER DASHBOARD ---
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white"><ICONS.Dashboard /></div>
            <span className="text-xl font-bold tracking-tight">Harmony</span>
          </div>
          {(isSyncing || isLoading) && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
        </div>
        <div className="space-y-1 flex-1">
          {[
            { id: View.Dashboard, label: 'Dashboard', icon: <ICONS.Dashboard /> },
            { id: View.Calendar, label: 'Full Calendar', icon: <ICONS.Calendar /> },
            { id: View.Recipes, label: 'Recipe Book', icon: <ICONS.Recipes /> },
            { id: View.ShoppingList, label: 'Shopping List', icon: <ICONS.Shopping /> }
          ].map((item) => (
            <button 
              key={item.id} 
              onClick={() => setCurrentView(item.id)} 
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
        <div className="pt-6 border-t border-slate-100">
          <button onClick={logout} className="w-full py-3 text-xs font-bold text-slate-400 hover:text-red-600 transition-colors uppercase tracking-widest">Switch Account</button>
        </div>
      </nav>

      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {currentView === View.Dashboard && (
          <Dashboard 
            events={calendarEvents} weeklyPlan={weeklyPlan} recipes={recipes} notes={notes}
            onAddMeal={(d, r) => setWeeklyPlan(p => ({...p, [d]: [...(p[d]||[]), r]}))}
            onRemoveMeal={(d, id) => setWeeklyPlan(p => ({...p, [d]: p[d].filter(r => r.id !== id)}))}
            onMoveMeal={(s, t, id) => setWeeklyPlan(p => { 
              const next = {...p}; 
              const move = next[s].find(r => r.id === id); 
              if(move){ next[s] = next[s].filter(r => r.id !== id); next[t] = [...next[t], move]; } 
              return next; 
            })}
            onAddNote={(text) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev])}
            onRemoveNote={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
            onViewRecipe={handleOpenRecipeFromDashboard}
            onResetWeek={handleResetWeek}
          />
        )}
        {currentView === View.Recipes && (
          <RecipeBook 
            recipes={recipes} onRefresh={fetchData} onAddRecipe={addRecipe} onUpdateRecipe={updateRecipe} onDeleteRecipe={deleteRecipe}
            hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients} onAddManualShoppingItem={addManualItemFromRecipe}
            externalIdToOpen={externallySelectedRecipeId} onClearExternalId={() => setExternallySelectedRecipeId(null)}
          />
        )}
        {currentView === View.ShoppingList && (
          <ShoppingList 
            weeklyPlan={weeklyPlan} spreadsheetId={spreadsheetId} manualItems={manualItems} onUpdateItems={setManualItems}
            hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients} clearedIngredients={clearedIngredients}
            onUpdateCleared={setClearedIngredients} checkedIngredients={checkedIngredients} onUpdateChecked={setCheckedIngredients}
            authToken={null}
          />
        )}
        {currentView === View.Calendar && (
          <CalendarView 
            events={calendarEvents} 
            onAddEvent={async (e) => {
              const res = await fetch('/api/data', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ spreadsheetId, range: 'Calendar!A:C', values: [[e.summary, e.start, Date.now().toString()]], append: true }) 
              });
              if (res.ok) { fetchData(); return true; } 
              return false;
            }} 
          />
        )}
      </main>
    </div>
  );
};

export default App;
