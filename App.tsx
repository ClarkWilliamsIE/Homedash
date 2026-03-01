// App.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote, Ingredient, Instruction } from './types';
import { CLIENT_ID, SCOPES, ICONS, ROOT_FOLDER_ID } from './constants';
import Dashboard from './components/Dashboard';
import RecipeBook from './components/RecipeBook';
import ShoppingList from './components/ShoppingList';
import CalendarView from './components/CalendarView';

const MOCK_RECIPES: Recipe[] = [
  { 
    id: 'm1', 
    name: 'Summer Avocado Toast', 
    ingredients: [
      { amount: '2', unit: 'slices', item: 'Sourdough Bread' },
      { amount: '1', unit: '', item: 'Avocado' },
      { amount: '1', unit: 'pinch', item: 'Chili Flakes' }
    ], 
    instructions: [
      { text: 'Preparation', isHeader: true },
      { text: 'Toast the bread until golden.', isHeader: false },
      { text: 'Mash avocado with lemon and salt.', isHeader: false },
      { text: 'Assembly', isHeader: true },
      { text: 'Spread on toast and top with a poached egg.', isHeader: false }
    ], 
    imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500&q=80', 
    tags: ['Breakfast', 'Healthy'] 
  },
];

const INITIAL_PLAN: WeeklyPlan = {
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

export interface ManualItem {
  id: string;
  name: string;
  checked: boolean;
}

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({
    token: localStorage.getItem('g_access_token'),
    user: JSON.parse(localStorage.getItem('g_user') || 'null'),
    isAuthenticated: !!localStorage.getItem('g_access_token') || sessionStorage.getItem('preview_mode') === 'true'
  });

  const [isPreview, setIsPreview] = useState(sessionStorage.getItem('preview_mode') === 'true');
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  
  const getStoredId = () => {
    const stored = localStorage.getItem('g_sheet_id');
    return stored && stored !== 'undefined' ? stored : null;
  };

  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(getStoredId());
  const [recipes, setRecipes] = useState<Recipe[]>(isPreview ? MOCK_RECIPES : []);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>([]);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initStatus, setInitStatus] = useState<string>('');
  
  // --- NEW: Token Expiry State ---
  const [isTokenExpired, setIsTokenExpired] = useState(false);

  const isInitialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  // --- BACKGROUND TOKEN REFRESH LOGIC ---
  useEffect(() => {
    if (!auth.token || isPreview || !auth.user?.email) return;

    // Refresh token every 50 minutes to stay safely ahead of the 1-hour expiry
    const refreshInterval = setInterval(() => {
      console.log("Harmony: Refreshing access token in background...");
      const google = (window as any).google;
      if (google) {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          hint: auth.user?.email, // Skips account picker if already logged in
          prompt: 'none',         // Silent refresh
          callback: (response: any) => {
            if (response.access_token) {
              localStorage.setItem('g_access_token', response.access_token);
              setAuth(prev => ({ ...prev, token: response.access_token }));
              setIsTokenExpired(false);
              console.log("Harmony: Token refreshed successfully.");
            } else if (response.error) {
              // Silent refresh failed (browser blocked, or session truly dead).
              // Trigger manual reconnect UI.
              console.error("Harmony: Silent token refresh failed", response.error);
              setIsTokenExpired(true);
            }
          },
        });
        client.requestAccessToken();
      }
    }, 50 * 60 * 1000); 

    return () => clearInterval(refreshInterval);
  }, [auth.token, auth.user?.email, isPreview]);

  // --- AUTH & INIT LOGIC ---
  const login = () => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      // If we already have a user email, hint it to skip the picker
      hint: auth.user?.email || undefined,
      callback: (response: any) => {
        if (response.access_token) {
          localStorage.setItem('g_access_token', response.access_token);
          sessionStorage.removeItem('preview_mode');
          setIsPreview(false);
          setIsTokenExpired(false); // Reset expiry block
          
          fetchUserInfo(response.access_token);
          
          // Re-trigger fetch if we just recovered from an expired token
          if (spreadsheetId && isTokenExpired) {
            setTimeout(() => fetchData(response.access_token), 500);
          }
        }
      },
    });
    client.requestAccessToken();
  };

  const logout = () => {
    localStorage.removeItem('g_access_token');
    localStorage.removeItem('g_user');
    localStorage.removeItem('g_sheet_id');
    sessionStorage.clear();
    
    setAuth({ token: null, user: null, isAuthenticated: false });
    setSpreadsheetId(null);
    setIsPreview(false);
    setRecipes([]);
    setCurrentView(View.Dashboard);
  };

  const fetchUserInfo = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Token invalid");
      const user = await res.json();
      const userData = { name: user.name, email: user.email, picture: user.picture };
      
      localStorage.setItem('g_user', JSON.stringify(userData));
      setAuth({ token, user: userData, isAuthenticated: true });
    } catch (err) { 
      console.error(err); 
    }
  };

  const initializeSystem = useCallback(async () => {
    if (!auth.token || isPreview || spreadsheetId) return;
    setInitStatus('Connecting to Family Database...');
    try {
      const q = `name = 'FamilyHarmonyDB' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      
      // Safety check: if API returns 401, stop and ask for token refresh
      if (!searchRes.ok) {
        console.warn("Harmony: API Error during init. Token might be expired.");
        setIsTokenExpired(true);
        setInitStatus('');
        return;
      }
      
      const searchData = await searchRes.json();
      let finalSheetId = '';

      if (searchData.files && searchData.files.length > 0) {
        finalSheetId = searchData.files[0].id;
        setInitStatus('Database found. Loading...');
      } else {
        setInitStatus('Creating new Database...');
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'FamilyHarmonyDB', mimeType: 'application/vnd.google-apps.spreadsheet', parents: [ROOT_FOLDER_ID] })
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.id) {
            setInitStatus('Error: Could not create database.');
            return;
        }
        finalSheetId = createData.id;
        await initializeSheetHeaders(finalSheetId, auth.token);
      }
      if (finalSheetId) {
          localStorage.setItem('g_sheet_id', finalSheetId);
          setSpreadsheetId(finalSheetId);
      }
    } catch (err) {
      console.error("Init failed", err);
    } finally {
      if (spreadsheetId) setInitStatus('');
    }
  }, [auth.token, isPreview, spreadsheetId]);

  const initializeSheetHeaders = async (id: string, token: string) => {
    const requests = [
      { addSheet: { properties: { title: "Recipes" } } },
      { addSheet: { properties: { title: "ShoppingList" } } },
      { addSheet: { properties: { title: "SyncData" } } },
    ];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Recipes!A1:F1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Name', 'Ingredients', 'ImageURL', 'Tags', 'Instructions', 'ID']] })
    });
  };

  const fetchData = useCallback(async (overrideToken?: string) => {
    const activeToken = overrideToken || auth.token;
    if (isPreview || !activeToken || !spreadsheetId) return;
    
    setIsLoading(true);
    try {
      const sheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:F`, { headers: { Authorization: `Bearer ${activeToken}` } });
      
      // Stop the auto-login loop. Set state to show reconnect button.
      if (sheetRes.status === 401) {
        console.warn("Harmony: Token expired. Triggering manual refresh UI...");
        setIsTokenExpired(true); 
        setIsLoading(false);
        return;
      }

      const sheetData = await sheetRes.json();
      
      if (sheetData.values) {
        const parsedRecipes: Recipe[] = sheetData.values.map((row: any, idx: number) => {
          let ingredients: Ingredient[] = [];
          const rawIng = row[1];
          try {
             ingredients = JSON.parse(rawIng);
             if (!Array.isArray(ingredients)) throw new Error("Not array");
          } catch {
             const parts = rawIng?.split(',') || [];
             ingredients = parts.map((s: string) => ({ amount: '', unit: '', item: s.trim() }));
          }

          let instructions: Instruction[] = [];
          const rawInst = row[4];
          try {
             instructions = JSON.parse(rawInst);
             if (!Array.isArray(instructions)) throw new Error("Not array");
          } catch {
             const parts = rawInst?.split('||') || [];
             instructions = parts.map((s: string) => ({ text: s.trim(), isHeader: false }));
          }

          return {
            id: row[5] || idx.toString(),
            name: row[0],
            ingredients,
            imageUrl: row[2] || `https://picsum.photos/seed/${idx}/400/300`,
            tags: row[3]?.split(',').map((s: string) => s.trim()) || [],
            instructions
          };
        });
        setRecipes(parsedRecipes);
      }

      const syncRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${activeToken}` } });
      const syncData = await syncRes.json();
      if (syncData.values && syncData.values[0] && syncData.values[0][0]) {
        try {
          const appState = JSON.parse(syncData.values[0][0]);
          if (appState.weeklyPlan) {
            const cleanPlan = { ...INITIAL_PLAN };
            Object.keys(appState.weeklyPlan).forEach(day => {
                const val = appState.weeklyPlan[day];
                if (Array.isArray(val)) cleanPlan[day as keyof WeeklyPlan] = val;
                else if (val) cleanPlan[day as keyof WeeklyPlan] = [val];
            });
            setWeeklyPlan(cleanPlan);
          }
          if (appState.notes) setNotes(appState.notes);
          if (appState.manualItems) setManualItems(appState.manualItems);
          if (appState.hiddenIngredients) setHiddenIngredients(appState.hiddenIngredients);
          if (appState.checkedIngredients) setCheckedIngredients(appState.checkedIngredients);
        } catch (e) { console.error("Failed to parse SyncData", e); }
      }
      
      const now = new Date();
      now.setHours(0,0,0,0);
      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&maxResults=50&orderBy=startTime&singleEvents=true`, { headers: { Authorization: `Bearer ${activeToken}` } });
      const calendarData = await calendarRes.json();
      setCalendarEvents(calendarData.items || []);

    } catch (err) { console.error(err); } finally { 
      setIsLoading(false); 
      setTimeout(() => { isInitialLoad.current = false; }, 1000);
    }
  }, [auth.token, spreadsheetId, isPreview]);

  useEffect(() => {
    if (auth.isAuthenticated && !isPreview && !spreadsheetId) {
      initializeSystem();
    } else if (auth.isAuthenticated && !isPreview && spreadsheetId && !isTokenExpired) {
      fetchData();
    }
  }, [auth.isAuthenticated, spreadsheetId, initializeSystem, fetchData, isPreview, isTokenExpired]);

  useEffect(() => {
    if (isPreview || !auth.token || isInitialLoad.current || !spreadsheetId || isTokenExpired) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const payload = JSON.stringify({ weeklyPlan, notes, manualItems, hiddenIngredients, checkedIngredients });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[payload]] })
        });
      } catch (err) { console.error("Failed to sync state", err); } finally { setIsSyncing(false); }
    }, 2000);
    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, checkedIngredients, auth.token, spreadsheetId, isPreview, isTokenExpired]);

  const uploadToDrive = async (file: File): Promise<string | null> => {
    const freshToken = auth.token || localStorage.getItem('g_access_token');
    if (!freshToken) return null;
    try {
      const metadata = { name: `recipe_${Date.now()}_${file.name}`, mimeType: file.type, parents: [ROOT_FOLDER_ID] };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}` },
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });
      return `https://drive.google.com/thumbnail?id=${data.id}&sz=w800`;
    } catch (err) { console.error(err); return null; }
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
        r.id
      ]);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:F:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:F?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });
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
      const newRecipes = recipes.filter(r => r.id !== id);
      await saveAllRecipesToSheet(newRecipes);
      return true;
    }
    return false;
  };
  
  const addEvent = async (event: { summary: string; start: string; allDay: boolean }) => {
    try {
      // Correctly format for Google Calendar "All Day" entries (date only, no time)
      const body = {
        summary: event.summary,
        start: { date: event.start }, // Just the YYYY-MM-DD
        end: { date: event.start }     // End date is the same for a single all-day event
      };
      
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (res.ok) { 
        fetchData(); 
        return true; 
      } else {
        const errData = await res.json();
        console.error("Calendar API Error:", errData);
        alert("Failed to add event. Check browser console.");
      }
    } catch (err) { 
      console.error(err); 
    }
    return false;
  };

  const handleAddMeal = (day: string, recipe: Recipe) => {
    setWeeklyPlan(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), recipe]
    }));
  };

  const handleRemoveMeal = (day: string, recipeId: string) => {
    setWeeklyPlan(prev => ({
      ...prev,
      [day]: prev[day].filter(r => r.id !== recipeId)
    }));
  };

  const handleMoveMeal = (sourceDay: string, targetDay: string, recipeId: string) => {
    setWeeklyPlan(prev => {
      const next = { ...prev };
      const recipeToMove = next[sourceDay].find(r => r.id === recipeId);
      if (recipeToMove) {
        next[sourceDay] = next[sourceDay].filter(r => r.id !== recipeId);
        next[targetDay] = [...next[targetDay], recipeToMove];
      }
      return next;
    });
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-12 max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg"><ICONS.Dashboard /></div>
          <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">Family Harmony</h1><p className="text-slate-500 mt-2">Sign in to sync your family's life.</p></div>
          <button onClick={login} className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg">Sign in with Google</button>
        </div>
      </div>
    );
  }

  if (initStatus) {
    return (
       <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-slate-600 font-bold animate-pulse">{initStatus}</p>
       </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen relative">
      
      {/* EXPIRED SESSION BLOCKER OVERLAY */}
      {isTokenExpired && (
        <div className="absolute inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] shadow-2xl p-10 max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Session Expired</h2>
              <p className="text-slate-500 mt-2">For security, your Google connection expires every hour. Please click below to safely reconnect without losing your place.</p>
            </div>
            <button onClick={login} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">
               Reconnect Now
            </button>
          </div>
        </div>
      )}

      <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-indigo-600 p-2 rounded-lg text-white"><ICONS.Dashboard /></div><span className="text-xl font-bold tracking-tight">Harmony</span></div>
          {(isSyncing || isLoading) && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
        </div>
        <div className="space-y-1 flex-1">
          {[{ id: View.Dashboard, label: 'Dashboard', icon: <ICONS.Dashboard /> }, { id: View.Calendar, label: 'Full Calendar', icon: <ICONS.Calendar /> }, { id: View.Recipes, label: 'Recipe Book', icon: <ICONS.Recipes /> }, { id: View.ShoppingList, label: 'Shopping List', icon: <ICONS.Shopping /> }].map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{item.icon}{item.label}</button>
          ))}
        </div>
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3 px-2"><img src={auth.user?.picture} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" /><div className="flex-1 overflow-hidden"><p className="text-sm font-semibold text-slate-900 truncate">{auth.user?.name}</p><p className="text-xs text-slate-500 truncate">{auth.user?.email}</p></div></div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-400 hover:text-red-600 transition-colors">Sign Out</button>
        </div>
      </nav>

      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {currentView === View.Dashboard && (
          <Dashboard 
            events={calendarEvents} weeklyPlan={weeklyPlan} recipes={recipes} notes={notes}
            onAddMeal={handleAddMeal}
            onRemoveMeal={handleRemoveMeal}
            onMoveMeal={handleMoveMeal}
            onAddNote={(text) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev])}
            onRemoveNote={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
          />
        )}
        {currentView === View.Recipes && (
          <RecipeBook 
            recipes={recipes} 
            onRefresh={() => fetchData()} 
            onAddRecipe={addRecipe}
            onUpdateRecipe={updateRecipe}
            onDeleteRecipe={deleteRecipe}
            hiddenIngredients={hiddenIngredients}
            onUpdateHidden={setHiddenIngredients}
          />
        )}
        {currentView === View.ShoppingList && (
          <ShoppingList 
            weeklyPlan={weeklyPlan} authToken={isPreview ? null : auth.token} spreadsheetId={spreadsheetId}
            manualItems={manualItems} onUpdateItems={setManualItems}
            hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients}
            checkedIngredients={checkedIngredients} onUpdateChecked={setCheckedIngredients}
          />
        )}
        {currentView === View.Calendar && <CalendarView events={calendarEvents} onAddEvent={addEvent} />}
      </main>
    </div>
  );
};

export default App;
