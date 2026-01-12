import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote } from './types';
import { CLIENT_ID, SPREADSHEET_ID, SCOPES, ICONS } from './constants';
import Dashboard from './components/Dashboard';
import RecipeBook from './components/RecipeBook';
import ShoppingList from './components/ShoppingList';
import CalendarView from './components/CalendarView';

// MOCK DATA for Preview Mode
const MOCK_RECIPES: Recipe[] = [
  { id: 'm1', name: 'Summer Avocado Toast', ingredients: ['Bread', 'Avocado', 'Lemon', 'Chili Flakes', 'Egg'], instructions: ['Toast bread.', 'Mash avocado.', 'Top with egg.'], imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500&q=80', tags: ['Breakfast'] },
];

const INITIAL_PLAN: WeeklyPlan = { Sunday: null, Monday: null, Tuesday: null, Wednesday: null, Thursday: null, Friday: null, Saturday: null };

export interface ManualItem { id: string; name: string; checked: boolean; }

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({
    token: sessionStorage.getItem('g_access_token'),
    user: JSON.parse(sessionStorage.getItem('g_user') || 'null'),
    isAuthenticated: !!sessionStorage.getItem('g_access_token') || sessionStorage.getItem('preview_mode') === 'true'
  });

  const [isPreview, setIsPreview] = useState(sessionStorage.getItem('preview_mode') === 'true');
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  const [recipes, setRecipes] = useState<Recipe[]>(isPreview ? MOCK_RECIPES : []);
  
  // -- SYNCED STATE --
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>([{ id: '1', text: 'Welcome!', color: 'bg-yellow-100' }]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>([]);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const isInitialLoad = useRef(true);
  const saveTimeout = useRef<any>(null);

  // --- LOGIN ---
  const login = () => {
    const google = (window as any).google;
    if (!google) return;
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
    setIsPreview(false);
    setRecipes([]);
    setCurrentView(View.Dashboard);
  };

  const fetchUserInfo = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
      const user = await res.json();
      const userData = { name: user.name, email: user.email, picture: user.picture };
      sessionStorage.setItem('g_user', JSON.stringify(userData));
      setAuth({ token, user: userData, isAuthenticated: true });
    } catch (err) { console.error(err); }
  };

  // --- DATA FETCHING ---
  const fetchData = useCallback(async () => {
    if (isPreview || !auth.token) return;
    setIsLoading(true);
    try {
      // 1. Recipes
      const sheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Recipes!A2:F`, { headers: { Authorization: `Bearer ${auth.token}` } });
      const sheetData = await sheetRes.json();
      if (sheetData.values) {
        setRecipes(sheetData.values.map((row: any, idx: number) => ({
          id: idx.toString(),
          name: row[0],
          ingredients: row[1]?.split(',').map((s: string) => s.trim()) || [],
          imageUrl: row[2] || `https://picsum.photos/seed/${idx}/400/300`,
          tags: row[3]?.split(',').map((s: string) => s.trim()) || [],
          instructions: row[4]?.split('||').map((s: string) => s.trim()) || []
        })));
      }

      // 2. Calendar
      const now = new Date();
      now.setHours(0,0,0,0);
      const calendarRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&maxResults=50&orderBy=startTime&singleEvents=true`, { headers: { Authorization: `Bearer ${auth.token}` } });
      const calendarData = await calendarRes.json();
      setCalendarEvents(calendarData.items || []);

      // 3. App State (Plan, Notes, Shopping)
      const syncRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/SyncData!A1?valueRenderOption=UNFORMATTED_VALUE`, { headers: { Authorization: `Bearer ${auth.token}` } });
      const syncData = await syncRes.json();
      
      if (syncData.values && syncData.values[0] && syncData.values[0][0]) {
        try {
          const appState = JSON.parse(syncData.values[0][0]);
          if (appState.weeklyPlan) setWeeklyPlan(appState.weeklyPlan);
          if (appState.notes) setNotes(appState.notes);
          if (appState.manualItems) setManualItems(appState.manualItems);
          if (appState.hiddenIngredients) setHiddenIngredients(appState.hiddenIngredients);
          if (appState.checkedIngredients) setCheckedIngredients(appState.checkedIngredients);
        } catch (e) { console.error("Sync Parse Error", e); }
      }
    } catch (err) { console.error(err); } finally { 
      setIsLoading(false); 
      setTimeout(() => { isInitialLoad.current = false; }, 1000);
    }
  }, [auth.token, isPreview]);

  useEffect(() => {
    if (auth.isAuthenticated && !isPreview) fetchData();
  }, [auth.isAuthenticated, fetchData, isPreview]);

  // --- AUTO-SAVE (SyncData) ---
  useEffect(() => {
    if (isPreview || !auth.token || isInitialLoad.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const payload = JSON.stringify({ weeklyPlan, notes, manualItems, hiddenIngredients, checkedIngredients });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/SyncData!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[payload]] })
        });
      } catch (err) { console.error("Sync Failed", err); } finally { setIsSyncing(false); }
    }, 2000);

    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, checkedIngredients, auth.token, isPreview]);

  // --- HELPERS ---

  // *** CRITICAL FIX: Upload Publicly ***
  const uploadToDrive = async (file: File): Promise<string | null> => {
    if (!auth.token) return null;
    try {
      const metadata = { name: `recipe_${Date.now()}_${file.name}`, mimeType: file.type };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);

      // 1. Upload
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const fileId = data.id;

      // 2. Make Public (Reader/Anyone) - FIXES THE REDIRECT LOOP
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });

      // 3. Return Thumbnail Link
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    } catch (err) {
      console.error("Drive upload failed", err);
      return null;
    }
  };

  // *** CRITICAL FIX: Fresh Token for Saving ***
  const addRecipe = async (recipe: Omit<Recipe, 'id'>, imageFile?: File) => {
    const freshToken = sessionStorage.getItem('g_access_token'); // Force fresh token

    let finalImageUrl = recipe.imageUrl;
    if (imageFile && !isPreview && freshToken) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }

    if (isPreview) {
      setRecipes(prev => [{ ...recipe, imageUrl: finalImageUrl, id: Date.now().toString() }, ...prev]);
      return true;
    }

    if (!freshToken) {
        alert("Session expired. Please refresh.");
        return false;
    }

    try {
      const instructionsString = (recipe.instructions || []).join(' || ');
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Recipes!A2:F:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[recipe.name, recipe.ingredients.join(', '), finalImageUrl, recipe.tags.join(', '), instructionsString]] })
      });
      if (res.ok) { fetchData(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };

  const addEvent = async (event: { summary: string; start: string; allDay: boolean }) => {
    if (isPreview) {
      setCalendarEvents(prev => [{ id: Date.now().toString(), summary: event.summary, start: { dateTime: event.start }, end: { dateTime: event.start } }]);
      return true;
    }
    try {
      const body = {
        summary: event.summary,
        start: event.allDay ? { date: event.start } : { dateTime: event.start },
        end: event.allDay ? { date: event.start } : { dateTime: new Date(new Date(event.start).getTime() + 3600000).toISOString() }
      };
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      fetchData(); return true;
    } catch (err) { console.error(err); return false; }
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

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white"><ICONS.Dashboard /></div>
            <span className="text-xl font-bold tracking-tight">Harmony</span>
          </div>
          {isSyncing && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
        </div>
        <div className="space-y-1 flex-1">
          {[
            { id: View.Dashboard, label: 'Dashboard', icon: <ICONS.Dashboard /> },
            { id: View.Calendar, label: 'Full Calendar', icon: <ICONS.Calendar /> },
            { id: View.Recipes, label: 'Recipe Book', icon: <ICONS.Recipes /> },
            { id: View.ShoppingList, label: 'Shopping List', icon: <ICONS.Shopping /> },
          ].map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{item.icon} {item.label}</button>
          ))}
        </div>
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <img src={auth.user?.picture} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" />
            <div className="flex-1 overflow-hidden"><p className="text-sm font-semibold text-slate-900 truncate">{auth.user?.name}</p><p className="text-xs text-slate-500 truncate">{auth.user?.email}</p></div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-400 hover:text-red-600 transition-colors">Sign Out</button>
        </div>
      </nav>

      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {currentView === View.Dashboard && (
          <Dashboard events={calendarEvents} weeklyPlan={weeklyPlan} recipes={recipes} onUpdateMeal={(day, recipe) => setWeeklyPlan(prev => ({ ...prev, [day]: recipe }))} onDragDrop={(src, tgt) => setWeeklyPlan(prev => { const next = {...prev}; const tmp = next[src]; next[src] = next[tgt]; next[tgt] = tmp; return next; })} notes={notes} onAddNote={(text) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev])} onRemoveNote={(id) => setNotes(prev => prev.filter(n => n.id !== id))} />
        )}
        {currentView === View.Recipes && <RecipeBook recipes={recipes} onRefresh={fetchData} onAddRecipe={addRecipe} />}
        {currentView === View.ShoppingList && (
          <ShoppingList weeklyPlan={weeklyPlan} authToken={isPreview ? null : auth.token} manualItems={manualItems} onUpdateItems={setManualItems} hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients} checkedIngredients={checkedIngredients} onUpdateChecked={setCheckedIngredients} />
        )}
        {currentView === View.Calendar && <CalendarView events={calendarEvents} onAddEvent={addEvent} />}
      </main>
    </div>
  );
};

export default App;
