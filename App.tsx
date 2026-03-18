// App.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote, Ingredient, Instruction } from './types';
import { ICONS, ROOT_FOLDER_ID } from './constants';
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

// --- CONFIGURATION ---
const HARDCODED_SHEET_ID = '1IwqSELEbCQPAzM9-o5d1g4lXuuGzcev7F1kJeFjpihQ';

const App: React.FC = () => {
  // --- PIN & AUTH STATE ---
  const [needsPin, setNeedsPin] = useState(!localStorage.getItem('family_pin'));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  const [auth, setAuth] = useState<AuthState>({
    token: null,
    user: { name: 'Family Member', email: 'Shared Access', picture: 'https://cdn-icons-png.flaticon.com/512/3237/3237472.png' },
    isAuthenticated: false
  });

  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  const [spreadsheetId] = useState<string>(HARDCODED_SHEET_ID);
  
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
  const [initStatus, setInitStatus] = useState<string>('');
  const [isTokenExpired, setIsTokenExpired] = useState(false);

  const isInitialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  // SILENT LOGIN: Now sends the PIN to the backend to get the token!
  const loginSilently = useCallback(async (pinToTry?: string) => {
    const pin = pinToTry || localStorage.getItem('family_pin');
    
    // If no PIN provided and none in localStorage, we definitely need them to type it
    if (!pin) {
      setNeedsPin(true);
      return null;
    }

    setInitStatus('Connecting securely to Family Database...');
    try {
      const res = await fetch('/api/getToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }) // Send PIN to backend for verification
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem('family_pin', pin); // Save valid PIN
          setNeedsPin(false);
          setPinError(false);
          setAuth({ 
            token: data.access_token, 
            user: { name: 'Family Member', email: 'Shared Access', picture: 'https://cdn-icons-png.flaticon.com/512/3237/3237472.png' }, 
            isAuthenticated: true 
          });
          setIsTokenExpired(false);
          setInitStatus('');
          return data.access_token;
        }
      } else if (res.status === 401) {
        // The backend rejected the PIN
        localStorage.removeItem('family_pin');
        setNeedsPin(true);
        if (pinToTry) setPinError(true); // Only show error if they just typed it
        setInitStatus('');
        return null;
      }

      setInitStatus('Failed to connect. Please refresh.');
    } catch (e) {
      setInitStatus('Server error. Please refresh.');
      console.error("Harmony: Silent auth failed", e);
    }
    return null;
  }, []);

  // --- PIN SUBMIT HANDLER ---
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setIsVerifyingPin(true);
    await loginSilently(pinInput);
    setIsVerifyingPin(false);
    setPinInput(''); // clear input on fail
  };

  // AUTO-LOGIN ON LOAD & REFRESH TOKEN EVERY 45 MINS
  useEffect(() => {
    if (!auth.isAuthenticated && !needsPin) {
      loginSilently();
    }
    const interval = setInterval(() => {
      if (!needsPin) loginSilently();
    }, 45 * 60 * 1000);
    return () => clearInterval(interval);
  }, [auth.isAuthenticated, needsPin, loginSilently]);


  const fetchData = useCallback(async (overrideToken?: string) => {
    const activeToken = overrideToken || auth.token;
    if (!activeToken || !spreadsheetId) return;
    
    setIsLoading(true);
    try {
      const sheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:H`, { headers: { Authorization: `Bearer ${activeToken}` } });
      if (sheetRes.status === 401) { setIsTokenExpired(true); setIsLoading(false); return; }

      const sheetData = await sheetRes.json();
      if (sheetData.values) {
        const parsedRecipes: Recipe[] = sheetData.values.map((row: any, idx: number) => {
          let ingredients: Ingredient[] = [];
          try { ingredients = JSON.parse(row[1]); } catch { ingredients = []; }
          let instructions: Instruction[] = [];
          try { instructions = JSON.parse(row[4]); } catch { instructions = []; }

          return {
            id: row[5] || idx.toString(), 
            name: row[0], 
            ingredients, 
            instructions,
            imageUrl: row[2] || `https://picsum.photos/seed/${idx}/400/300`,
            tags: row[3]?.split(',').map((s: string) => s.trim()) || [],
            isFavorite: row[6] === 'TRUE',
            isNew: row[7] === 'TRUE'
          };
        });
        setRecipes(parsedRecipes);
      }

      const syncRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${activeToken}` } });
      const syncData = await syncRes.json();
      if (syncData.values && syncData.values[0] && syncData.values[0][0]) {
        try {
          const appState = JSON.parse(syncData.values[0][0]);
          if (appState.weeklyPlan) setWeeklyPlan(appState.weeklyPlan);
          if (appState.notes) setNotes(appState.notes);
          if (appState.manualItems) setManualItems(appState.manualItems);
          if (appState.hiddenIngredients) setHiddenIngredients(appState.hiddenIngredients);
          if (appState.clearedIngredients) setClearedIngredients(appState.clearedIngredients);
          if (appState.checkedIngredients) setCheckedIngredients(appState.checkedIngredients);
        } catch (e) { console.error("Failed to parse SyncData", e); }
      }
      
      setCalendarEvents([]);

    } catch (err) { console.error(err); } finally { setIsLoading(false); setTimeout(() => { isInitialLoad.current = false; }, 1000); }
  }, [auth.token, spreadsheetId]);

  // ONCE AUTHENTICATED, FETCH DATA
  useEffect(() => {
    if (auth.isAuthenticated && spreadsheetId && !isTokenExpired) {
      fetchData();
    }
  }, [auth.isAuthenticated, spreadsheetId, fetchData, isTokenExpired]);

  // AUTO SAVE CHANGES TO SHEET
  useEffect(() => {
    if (!auth.token || isInitialLoad.current || !spreadsheetId || isTokenExpired) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const payload = JSON.stringify({ 
          weeklyPlan, 
          notes, 
          manualItems, 
          hiddenIngredients, 
          clearedIngredients, 
          checkedIngredients 
        });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[payload]] })
        });
      } catch (err) { console.error("Failed to sync state", err); } finally { setIsSyncing(false); }
    }, 2000);
    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, auth.token, spreadsheetId, isTokenExpired]);

  // UPLOAD IMAGES
  const uploadToDrive = async (file: File): Promise<string | null> => {
    if (!auth.token) return null;
    try {
      const metadata = { name: `recipe_${Date.now()}_${file.name}`, mimeType: file.type, parents: [ROOT_FOLDER_ID] };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
      return `https://drive.google.com/thumbnail?id=${data.id}&sz=w800`;
    } catch (err) { console.error("Drive upload failed", err); return null; }
  };

  const saveAllRecipesToSheet = async (newRecipes: Recipe[]) => {
    setRecipes(newRecipes);
    if (!spreadsheetId || !auth.token) return;
    try {
      const values = newRecipes.map(r => [
        r.name, 
        JSON.stringify(r.ingredients), 
        r.imageUrl, 
        r.tags.join(', '), 
        JSON.stringify(r.instructions), 
        r.id,
        r.isFavorite ? 'TRUE' : 'FALSE',
        r.isNew ? 'TRUE' : 'FALSE'
      ]);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:H:clear`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } });
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:H?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
    } catch (err) { console.error("Failed to save recipes", err); }
  };

  const addRecipe = async (recipe: Omit<Recipe, 'id'>, imageFile?: File) => {
    let finalImageUrl = recipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const newRecipe = { ...recipe, imageUrl: finalImageUrl, id: Date.now().toString() };
    await saveAllRecipesToSheet([...recipes, newRecipe]);
    return true;
  };

  const updateRecipe = async (updatedRecipe: Recipe, imageFile?: File) => {
    let finalImageUrl = updatedRecipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const newRecipes = recipes.map(r => r.id === updatedRecipe.id ? { ...updatedRecipe, imageUrl: finalImageUrl } : r);
    await saveAllRecipesToSheet(newRecipes);
    return true;
  };

  const deleteRecipe = async (id: string) => {
    if (confirm("Are you sure you want to delete this recipe?")) {
      await saveAllRecipesToSheet(recipes.filter(r => r.id !== id));
      return true;
    }
    return false;
  };

  const handleResetWeek = () => {
    if (confirm("Clear the entire meal plan and reset the shopping list for a new week?")) {
      setWeeklyPlan(INITIAL_PLAN);
      setClearedIngredients([]);
      setCheckedIngredients([]);
      setManualItems([]);
    }
  };

  const addManualItemFromRecipe = (name: string) => {
    const clean = name.toLowerCase().split('(')[0].trim();
    setClearedIngredients(prev => prev.filter(i => i !== clean));
    setManualItems(prev => [...prev, { id: Date.now().toString(), name: name, checked: false }]);
  };

  const handleOpenRecipeFromDashboard = (recipe: Recipe) => {
    setExternallySelectedRecipeId(recipe.id);
    setCurrentView(View.Recipes);
  };

  // --- RENDERING ---

  // 1. PIN Screen
  if (needsPin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-12 max-w-sm w-full text-center space-y-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg">
            <ICONS.Dashboard />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Family Dashboard</h1>
            <p className="text-slate-500 mt-2">Enter the family PIN to access.</p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input 
              type="password" 
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              disabled={isVerifyingPin}
              className={`w-full text-center text-2xl tracking-[0.5em] font-bold bg-slate-50 border ${pinError ? 'border-red-500' : 'border-slate-200'} rounded-2xl px-4 py-4 outline-none focus:ring-2 focus:ring-indigo-100 transition-all`}
              autoFocus
            />
            {pinError && <p className="text-red-500 text-xs font-bold">Incorrect PIN. Try again.</p>}
            <button type="submit" disabled={isVerifyingPin || !pinInput} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg">
              {isVerifyingPin ? 'Unlocking...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Loading Screen (Connecting to Database)
  if (!auth.isAuthenticated) {
    return (
       <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-slate-600 font-bold animate-pulse">{initStatus || 'Opening Dashboard...'}</p>
       </div>
    );
  }

  // 3. Main App UI
  return (
    <div className="flex flex-col md:flex-row min-h-screen relative">
      {isTokenExpired && (
        <div className="absolute inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] shadow-2xl p-10 max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Session Expired</h2>
              <p className="text-slate-500 mt-2">The background connection was lost. Please reload.</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">Reload Dashboard</button>
          </div>
        </div>
      )}

      <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-indigo-600 p-2 rounded-lg text-white"><ICONS.Dashboard /></div><span className="text-xl font-bold tracking-tight">Harmony</span></div>
          {(isSyncing || isLoading) && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
        </div>
        <div className="space-y-1 flex-1">
          {[{ id: View.Dashboard, label: 'Dashboard', icon: <ICONS.Dashboard /> }, { id: View.Recipes, label: 'Recipe Book', icon: <ICONS.Recipes /> }, { id: View.ShoppingList, label: 'Shopping List', icon: <ICONS.Shopping /> }].map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{item.icon}{item.label}</button>
          ))}
        </div>
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3 px-2"><img src={auth.user?.picture} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" /><div className="flex-1 overflow-hidden"><p className="text-sm font-semibold text-slate-900 truncate">{auth.user?.name}</p><p className="text-xs text-slate-500 truncate">{auth.user?.email}</p></div></div>
        </div>
      </nav>

      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {currentView === View.Dashboard && (
          <Dashboard 
            events={calendarEvents} 
            weeklyPlan={weeklyPlan} 
            recipes={recipes} 
            notes={notes} 
            onAddMeal={(d, r) => setWeeklyPlan(p => ({...p, [d]: [...(p[d]||[]), r]}))} 
            onRemoveMeal={(d, id) => setWeeklyPlan(p => ({...p, [d]: p[d].filter(r => r.id !== id)}))} 
            onMoveMeal={(s, t, id) => setWeeklyPlan(p => { const next = {...p}; const move = next[s].find(r => r.id === id); if(move){ next[s] = next[s].filter(r => r.id !== id); next[t] = [...next[t], move]; } return next; })} 
            onAddNote={(text) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev])} 
            onRemoveNote={(id) => setNotes(prev => prev.filter(n => n.id !== id))} 
            onViewRecipe={handleOpenRecipeFromDashboard} 
            onResetWeek={handleResetWeek}
          />
        )}
        {currentView === View.Recipes && <RecipeBook recipes={recipes} onRefresh={() => fetchData()} onAddRecipe={addRecipe} onUpdateRecipe={updateRecipe} onDeleteRecipe={deleteRecipe} hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients} onAddManualShoppingItem={addManualItemFromRecipe} externalIdToOpen={externallySelectedRecipeId} onClearExternalId={() => setExternallySelectedRecipeId(null)} />}
        {currentView === View.ShoppingList && (
          <ShoppingList 
            weeklyPlan={weeklyPlan} 
            authToken={auth.token} 
            spreadsheetId={spreadsheetId} 
            manualItems={manualItems} 
            onUpdateItems={setManualItems} 
            hiddenIngredients={hiddenIngredients} 
            onUpdateHidden={setHiddenIngredients} 
            clearedIngredients={clearedIngredients}
            onUpdateCleared={setClearedIngredients}
            checkedIngredients={checkedIngredients} 
            onUpdateChecked={setCheckedIngredients} 
          />
        )}
      </main>
    </div>
  );
};

export default App;
