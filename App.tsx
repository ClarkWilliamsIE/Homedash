import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote } from './types';
import { CLIENT_ID, SCOPES, ICONS, ROOT_FOLDER_ID } from './constants';
import Dashboard from './components/Dashboard';
import RecipeBook from './components/RecipeBook';
import ShoppingList from './components/ShoppingList';
import CalendarView from './components/CalendarView';

const MOCK_RECIPES: Recipe[] = [
  { id: 'm1', name: 'Summer Avocado Toast', ingredients: ['Bread', 'Avocado', 'Lemon', 'Chili Flakes', 'Egg'], instructions: ['Toast the bread until golden.', 'Mash avocado with lemon and salt.', 'Spread on toast and top with a poached egg.'], imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500&q=80', tags: ['Breakfast', 'Healthy'] },
  // ... keep other mocks if you want
];

const INITIAL_PLAN: WeeklyPlan = {
  Sunday: null, Monday: null, Tuesday: null, Wednesday: null, Thursday: null, Friday: null, Saturday: null
};

export interface ManualItem {
  id: string;
  name: string;
  checked: boolean;
}

// ... imports

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({
    token: sessionStorage.getItem('g_access_token'),
    user: JSON.parse(sessionStorage.getItem('g_user') || 'null'),
    isAuthenticated: !!sessionStorage.getItem('g_access_token') || sessionStorage.getItem('preview_mode') === 'true'
  });

  const [isPreview, setIsPreview] = useState(sessionStorage.getItem('preview_mode') === 'true');
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  
  // --- FIX STARTS HERE ---
  // Safely retrieve the ID. If it is "undefined" (string), ignore it.
  const getStoredId = () => {
    const stored = sessionStorage.getItem('g_sheet_id');
    return stored && stored !== 'undefined' ? stored : null;
  };

  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(getStoredId());
  // --- FIX ENDS HERE ---

  // ... rest of your state (recipes, weeklyPlan, etc.)

  const [recipes, setRecipes] = useState<Recipe[]>(isPreview ? MOCK_RECIPES : []);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>([]);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initStatus, setInitStatus] = useState<string>(''); // For loading feedback

  const isInitialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  // 1. LOGIN LOGIC
  const login = () => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.access_token) {
          sessionStorage.setItem('g_access_token', response.access_token);
          sessionStorage.setItem('preview_mode', 'false');
          setIsPreview(false);
          fetchUserInfo(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  };

  const logout = () => {
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
      const user = await res.json();
      const userData = { name: user.name, email: user.email, picture: user.picture };
      sessionStorage.setItem('g_user', JSON.stringify(userData));
      setAuth({ token, user: userData, isAuthenticated: true });
    } catch (err) { console.error(err); }
  };

  // 2. SYSTEM INITIALIZATION (Find/Create Sheet)
  const initializeSystem = useCallback(async () => {
    if (!auth.token || isPreview || spreadsheetId) return;
    
    setInitStatus('Searching for Family Database...');
    
    try {
      // Step A: Search for existing file in the folder
      // We added "trashed = false" to ensure we don't pick up deleted files
      const q = `name = 'FamilyHarmonyDB' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const searchData = await searchRes.json();

      let finalSheetId = '';

      if (searchData.files && searchData.files.length > 0) {
        // Found it!
        finalSheetId = searchData.files[0].id;
        setInitStatus('Database found. Loading...');
      } else {
        // Not found, create it!
        setInitStatus('Creating new Database...');
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'FamilyHarmonyDB',
            mimeType: 'application/vnd.google-apps.spreadsheet',
            parents: [ROOT_FOLDER_ID]
          })
        });
        
        const createData = await createRes.json();
        
        // --- ERROR CHECKING START ---
        if (!createRes.ok || !createData.id) {
            console.error("Creation Failed:", createData);
            alert(`Error creating database: ${createData.error?.message || "Check permissions"}`);
            setInitStatus('Error: Could not create database.');
            return; // STOP HERE
        }
        // --- ERROR CHECKING END ---

        finalSheetId = createData.id;

        // Initialize Tabs/Headers
        await initializeSheetHeaders(finalSheetId, auth.token);
      }

      // Only save if we actually have a valid ID
      if (finalSheetId) {
          sessionStorage.setItem('g_sheet_id', finalSheetId);
          setSpreadsheetId(finalSheetId);
      }

    } catch (err) {
      console.error("Init failed", err);
      alert("Failed to connect to Drive Folder. Check permissions.");
    } finally {
      if (spreadsheetId) setInitStatus(''); // Clear status only if successful
    }
  }, [auth.token, isPreview, spreadsheetId]);

  const initializeSheetHeaders = async (id: string, token: string) => {
    // We need to create the specific tabs: Recipes, ShoppingList, SyncData
    // This is complex in raw REST, sending a batchUpdate
    const requests = [
      { addSheet: { properties: { title: "Recipes" } } },
      { addSheet: { properties: { title: "ShoppingList" } } },
      { addSheet: { properties: { title: "SyncData" } } },
      // Delete the default "Sheet1" if you want, but optional
    ];
    
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });

    // Add Headers to Recipes
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Recipes!A1:F1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Name', 'Ingredients', 'ImageURL', 'Tags', 'Instructions', 'ID']] })
    });
  };

  // 3. DATA FETCHING
  const fetchData = useCallback(async () => {
    if (isPreview || !auth.token || !spreadsheetId) return;
    setIsLoading(true);
    try {
      // Load Recipes
      const sheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:F`, { headers: { Authorization: `Bearer ${auth.token}` } });
      const sheetData = await sheetRes.json();
      if (sheetData.values) {
        setRecipes(sheetData.values.map((row: any, idx: number) => ({
          id: row[5] || idx.toString(), // Use stored ID if available
          name: row[0],
          ingredients: row[1]?.split(',').map((s: string) => s.trim()) || [],
          imageUrl: row[2] || `https://picsum.photos/seed/${idx}/400/300`,
          tags: row[3]?.split(',').map((s: string) => s.trim()) || [],
          instructions: row[4]?.split('||').map((s: string) => s.trim()) || []
        })));
      }

      // Load Synced App State
      const syncRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SyncData!A1?valueRenderOption=UNFORMATTED_VALUE`, { 
        headers: { Authorization: `Bearer ${auth.token}` } 
      });
      const syncData = await syncRes.json();
      
      if (syncData.values && syncData.values[0] && syncData.values[0][0]) {
        try {
          const appState = JSON.parse(syncData.values[0][0]);
          if (appState.weeklyPlan) setWeeklyPlan(appState.weeklyPlan);
          if (appState.notes) setNotes(appState.notes);
          if (appState.manualItems) setManualItems(appState.manualItems);
          if (appState.hiddenIngredients) setHiddenIngredients(appState.hiddenIngredients);
          if (appState.checkedIngredients) setCheckedIngredients(appState.checkedIngredients);
        } catch (e) { console.error("Failed to parse SyncData", e); }
      }

       // Load Calendar
       const now = new Date();
       now.setHours(0,0,0,0);
       const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&maxResults=50&orderBy=startTime&singleEvents=true`, { headers: { Authorization: `Bearer ${auth.token}` } });
       const calendarData = await calendarRes.json();
       setCalendarEvents(calendarData.items || []);

    } catch (err) { console.error(err); } finally { 
      setIsLoading(false); 
      setTimeout(() => { isInitialLoad.current = false; }, 1000);
    }
  }, [auth.token, spreadsheetId, isPreview]);

  // Trigger Init then Fetch
  useEffect(() => {
    if (auth.isAuthenticated && !isPreview && !spreadsheetId) {
      initializeSystem();
    } else if (auth.isAuthenticated && !isPreview && spreadsheetId) {
      fetchData();
    }
  }, [auth.isAuthenticated, spreadsheetId, initializeSystem, fetchData, isPreview]);

  // 4. AUTO-SAVE STATE
  useEffect(() => {
    if (isPreview || !auth.token || isInitialLoad.current || !spreadsheetId) return;
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
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, checkedIngredients, auth.token, spreadsheetId, isPreview]);

  // 5. UPLOAD TO FOLDER
  const uploadToDrive = async (file: File): Promise<string | null> => {
    const freshToken = sessionStorage.getItem('g_access_token');
    if (!freshToken) return null;
    
    try {
      const metadata = {
        name: `recipe_${Date.now()}_${file.name}`,
        mimeType: file.type,
        parents: [ROOT_FOLDER_ID] // <--- THIS IS THE MAGIC LINE
      };
      
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
      const fileId = data.id;

      // Make Public for the app to see it easily (optional if using thumbnail link)
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });

      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    } catch (err) {
      console.error("Drive upload failed", err);
      return null;
    }
  };

  const addRecipe = async (recipe: Omit<Recipe, 'id'>, imageFile?: File) => {
    const freshToken = sessionStorage.getItem('g_access_token');
    if (!spreadsheetId || !freshToken) return false;

    let finalImageUrl = recipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }

    const newId = Date.now().toString();

    try {
      const instructionsString = (recipe.instructions || []).join(' || ');
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Recipes!A2:F:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            values: [[
                recipe.name, 
                recipe.ingredients.join(', '), 
                finalImageUrl, 
                recipe.tags.join(', '), 
                instructionsString,
                newId
            ]] 
        })
      });

      if (res.ok) {
        fetchData();
        return true;
      }
    } catch (err) { console.error(err); }
    return false;
  };
  
  // Calendar Add (unchanged)
  const addEvent = async (event: { summary: string; start: string; allDay: boolean }) => {
     try {
      const body = {
        summary: event.summary,
        start: event.allDay ? { date: event.start } : { dateTime: event.start },
        end: event.allDay ? { date: event.start } : { dateTime: new Date(new Date(event.start).getTime() + 3600000).toISOString() }
      };
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) { fetchData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-12 max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg">
             <ICONS.Dashboard />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Family Harmony</h1>
            <p className="text-slate-500 mt-2">Sign in to sync your family's life.</p>
          </div>
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
            { id: View.ShoppingList, label: 'Shopping List', icon: <ICONS.Shopping /> },
          ].map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <img src={auth.user?.picture} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">{auth.user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{auth.user?.email}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-400 hover:text-red-600 transition-colors">Sign Out</button>
        </div>
      </nav>

      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {currentView === View.Dashboard && (
          <Dashboard 
            events={calendarEvents} 
            weeklyPlan={weeklyPlan}
            recipes={recipes}
            onUpdateMeal={(day, recipe) => setWeeklyPlan(prev => ({ ...prev, [day]: recipe }))}
            onDragDrop={(src, tgt) => setWeeklyPlan(prev => {
              const next = {...prev};
              const tmp = next[src];
              next[src] = next[tgt];
              next[tgt] = tmp;
              return next;
            })}
            notes={notes}
            onAddNote={(text) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev])}
            onRemoveNote={(id) => setNotes(prev => prev.filter(n => n.id !== id))}
          />
        )}
        {currentView === View.Recipes && (
          <RecipeBook 
            recipes={recipes} 
            onRefresh={fetchData} 
            onAddRecipe={addRecipe}
          />
        )}
        {currentView === View.ShoppingList && (
          <ShoppingList 
            weeklyPlan={weeklyPlan} 
            authToken={isPreview ? null : auth.token}
            spreadsheetId={spreadsheetId} // <--- ADD THIS LINE HERE
            manualItems={manualItems}
            onUpdateItems={setManualItems}
            hiddenIngredients={hiddenIngredients}
            onUpdateHidden={setHiddenIngredients}
            checkedIngredients={checkedIngredients}
            onUpdateChecked={setCheckedIngredients}
          />
        )}
        {currentView === View.Calendar && (
          <CalendarView 
            events={calendarEvents} 
            onAddEvent={addEvent}
          />
        )}
      </main>
    </div>
  );
};

export default App;
