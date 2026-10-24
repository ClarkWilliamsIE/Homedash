// App.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote, Ingredient, Instruction } from './types';
import { ICONS, ROOT_FOLDER_ID } from './constants';
import Dashboard from './components/Dashboard';
import RecipeBook from './components/RecipeBook';
import ShoppingList from './components/ShoppingList';
import HomeScreen from './components/home/HomeScreen';
import LightsView from './components/home/LightsView';
import MusicView from './components/home/MusicView';
import SettingsView, { CalendarStatus } from './components/home/SettingsView';
import TimerTray from './components/home/TimerTray';
import NightMode from './components/home/NightMode';
import { loadCalendar } from './lib/calendar';
import { HomeIcons } from './components/home/icons';
import { useIsHome } from './lib/hass';
import { apiUrl } from './lib/runtime';
import { pack, mergeState, SyncState, ManualItem as SyncManualItem } from './lib/merge';
import { HomeSettings, settingsStore, withDefaults } from './lib/settings';

const INITIAL_PLAN: WeeklyPlan = {
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

export type ManualItem = SyncManualItem;

// --- CONFIGURATION ---
const HARDCODED_SHEET_ID = '1IwqSELEbCQPAzM9-o5d1g4lXuuGzcev7F1kJeFjpihQ';

// How often to pull changes made on other devices (phones, the kitchen iPad).
const SYNC_POLL_MS = 30 * 1000;
const RECIPE_POLL_MS = 5 * 60 * 1000;

const parseRecipeRows = (rows: any[][]): Recipe[] =>
  rows.map((row: any, idx: number) => {
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

interface AppProps {
  /** True when running inside Home Assistant (the kitchen iPad). */
  embedded?: boolean;
}

const App: React.FC<AppProps> = ({ embedded = false }) => {
  const isHome = useIsHome();

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

  const [currentView, setCurrentView] = useState<View>(embedded ? View.Home : View.Dashboard);
  const [spreadsheetId] = useState<string>(HARDCODED_SHEET_ID);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);

  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>([]);
  const [clearedIngredients, setClearedIngredients] = useState<string[]>([]);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [settings, setSettings] = useState<HomeSettings | null>(null);

  // Share the current settings with the home screens (moods, rooms, Start cooking).
  useEffect(() => { settingsStore.set(withDefaults(settings)); }, [settings]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ status: 'loading', calendars: [] });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [externallySelectedRecipeId, setExternallySelectedRecipeId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initStatus, setInitStatus] = useState<string>('');
  const [isTokenExpired, setIsTokenExpired] = useState(false);

  const saveTimeout = useRef<any>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = auth.token;

  // --- SYNC BOOKKEEPING ---
  // lastSynced: the shared state as this device last read/wrote it in the sheet.
  const lastSynced = useRef<SyncState | null>(null);
  const lastSyncedStr = useRef('');
  const isSaving = useRef(false);
  const currentState = (): SyncState => pack({ weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, settings });
  const stateRef = useRef<SyncState>(currentState());
  stateRef.current = currentState();

  const applyState = (s: SyncState) => {
    setWeeklyPlan(s.weeklyPlan);
    setNotes(s.notes);
    setManualItems(s.manualItems);
    setHiddenIngredients(s.hiddenIngredients);
    setClearedIngredients(s.clearedIngredients);
    setCheckedIngredients(s.checkedIngredients);
    setSettings(s.settings);
  };

  const markSynced = (s: SyncState) => {
    lastSynced.current = s;
    lastSyncedStr.current = JSON.stringify(s);
  };

  // SILENT LOGIN: sends the PIN to the backend to get the token
  const loginSilently = useCallback(async (pinToTry?: string) => {
    const pin = pinToTry || localStorage.getItem('family_pin');
    if (!pin) {
      setNeedsPin(true);
      return null;
    }

    setInitStatus('Connecting securely to Family Database...');
    try {
      const res = await fetch(apiUrl('/api/getToken'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem('family_pin', pin);
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
        localStorage.removeItem('family_pin');
        setNeedsPin(true);
        if (pinToTry) setPinError(true);
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

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setIsVerifyingPin(true);
    await loginSilently(pinInput);
    setIsVerifyingPin(false);
    setPinInput('');
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

  // --- SHEET ACCESS ---
  const sheetUrl = (range: string, extra = '') =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}${extra}`;

  const readSyncData = async (token: string): Promise<SyncState | null | 'expired'> => {
    const res = await fetch(sheetUrl('SyncData!A1', '?valueRenderOption=UNFORMATTED_VALUE'), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return 'expired';
    const data = await res.json();
    const raw = data.values?.[0]?.[0];
    if (!raw) return null;
    try { return pack(JSON.parse(raw)); } catch (e) { console.error("Failed to parse SyncData", e); return null; }
  };

  const writeSyncData = async (token: string, s: SyncState) => {
    await fetch(sheetUrl('SyncData!A1', '?valueInputOption=USER_ENTERED'), {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[JSON.stringify(s)]] })
    });
  };

  const readRecipes = async (token: string): Promise<Recipe[] | 'expired'> => {
    const res = await fetch(sheetUrl('Recipes!A2:H'), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return 'expired';
    const data = await res.json();
    return data.values ? parseRecipeRows(data.values) : [];
  };

  const fetchData = useCallback(async (overrideToken?: string) => {
    const activeToken = overrideToken || auth.token;
    if (!activeToken || !spreadsheetId) return;

    setIsLoading(true);
    try {
      const fresh = await readRecipes(activeToken);
      if (fresh === 'expired') { setIsTokenExpired(true); return; }
      setRecipes(fresh);

      const remote = await readSyncData(activeToken);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      if (remote) {
        applyState(remote);
        markSynced(remote);
      } else if (!lastSynced.current) {
        markSynced(stateRef.current);
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, spreadsheetId]);

  useEffect(() => {
    if (auth.isAuthenticated && spreadsheetId && !isTokenExpired) {
      fetchData();
    }
  }, [auth.isAuthenticated, spreadsheetId, fetchData, isTokenExpired]);

  // --- SAVE: merge with whatever other devices wrote since we last looked ---
  const saveNow = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || !lastSynced.current || isSaving.current) return;
    const local = stateRef.current;
    if (JSON.stringify(local) === lastSyncedStr.current) return;

    isSaving.current = true;
    setIsSyncing(true);
    try {
      const remote = await readSyncData(token);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      const base = lastSynced.current;
      const remoteChanged = remote && JSON.stringify(remote) !== lastSyncedStr.current;
      const toWrite = remoteChanged ? mergeState(base, local, remote) : local;
      await writeSyncData(token, toWrite);
      markSynced(toWrite);

      if (remoteChanged) {
        // Show the merged result, keeping anything typed while we were saving.
        const latest = stateRef.current;
        applyState(JSON.stringify(latest) === JSON.stringify(local) ? toWrite : mergeState(local, latest, toWrite));
      }
    } catch (err) {
      console.error("Failed to sync state", err);
    } finally {
      isSaving.current = false;
      setIsSyncing(false);
      // If more changes arrived during the save, save again.
      if (JSON.stringify(stateRef.current) !== lastSyncedStr.current) {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => saveNow(), 1000);
      }
    }
  }, []);

  // AUTO SAVE CHANGES TO SHEET
  useEffect(() => {
    if (!auth.token || !lastSynced.current || isTokenExpired) return;
    if (JSON.stringify(stateRef.current) === lastSyncedStr.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(), 1500);
    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, settings, auth.token, isTokenExpired, saveNow]);

  // --- PULL: pick up changes made on phones while this screen is open ---
  const pullChanges = useCallback(async (includeRecipes = false) => {
    const token = tokenRef.current;
    if (!token || !lastSynced.current || isSaving.current) return;
    // Don't pull over the top of unsaved local edits; the save will merge them.
    if (JSON.stringify(stateRef.current) !== lastSyncedStr.current) return;
    try {
      const remote = await readSyncData(token);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      if (remote && JSON.stringify(remote) !== lastSyncedStr.current && JSON.stringify(stateRef.current) === lastSyncedStr.current) {
        markSynced(remote);
        applyState(remote);
      }
      if (includeRecipes) {
        const fresh = await readRecipes(token);
        if (fresh !== 'expired') setRecipes(fresh);
      }
    } catch (err) { console.error("Failed to pull changes", err); }
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const syncTimer = setInterval(() => { if (!document.hidden) pullChanges(false); }, SYNC_POLL_MS);
    const recipeTimer = setInterval(() => { if (!document.hidden) pullChanges(true); }, RECIPE_POLL_MS);
    const onVisible = () => { if (!document.hidden) pullChanges(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(syncTimer);
      clearInterval(recipeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [auth.isAuthenticated, pullChanges]);

  // --- FAMILY CALENDAR ---
  const chosenCalendars = JSON.stringify(withDefaults(settings).calendars);
  const refreshCalendar = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const result = await loadCalendar(token, JSON.parse(chosenCalendars));
    if (result.ok) {
      setCalendarEvents(result.events);
      setCalendarStatus({ status: 'ok', calendars: result.calendars });
    } else if (result.reason !== 'expired') {
      setCalendarStatus(prev => ({ ...prev, status: result.reason }));
    }
  }, [chosenCalendars]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    refreshCalendar();
    const timer = setInterval(() => { if (!document.hidden) refreshCalendar(); }, 10 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) refreshCalendar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [auth.isAuthenticated, auth.token, refreshCalendar]);

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

  // Recipes are saved by re-reading the sheet first and applying just this change,
  // so a recipe added on a phone isn't wiped out by an edit made on the iPad.
  const saveRecipeChange = async (change: (list: Recipe[]) => Recipe[]) => {
    const token = auth.token;
    if (!spreadsheetId || !token) { setRecipes(prev => change(prev)); return; }
    try {
      const fresh = await readRecipes(token);
      const next = change(fresh === 'expired' ? recipes : fresh);
      setRecipes(next);
      const values = next.map(r => [
        r.name,
        JSON.stringify(r.ingredients),
        r.imageUrl,
        r.tags.join(', '),
        JSON.stringify(r.instructions),
        r.id,
        r.isFavorite ? 'TRUE' : 'FALSE',
        r.isNew ? 'TRUE' : 'FALSE'
      ]);
      await fetch(sheetUrl('Recipes!A2:H:clear'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      await fetch(sheetUrl('Recipes!A2:H', '?valueInputOption=USER_ENTERED'), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
    } catch (err) { console.error("Failed to save recipes", err); }
  };

  const addRecipe = async (recipe: Omit<Recipe, 'id'>, imageFile?: File) => {
    let finalImageUrl = recipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const newRecipe = { ...recipe, imageUrl: finalImageUrl, id: Date.now().toString() };
    await saveRecipeChange(list => [...list, newRecipe]);
    return true;
  };

  const updateRecipe = async (updatedRecipe: Recipe, imageFile?: File) => {
    let finalImageUrl = updatedRecipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const merged = { ...updatedRecipe, imageUrl: finalImageUrl };
    await saveRecipeChange(list => list.map(r => r.id === merged.id ? merged : r));
    return true;
  };

  const deleteRecipe = async (id: string) => {
    if (confirm("Are you sure you want to delete this recipe?")) {
      await saveRecipeChange(list => list.filter(r => r.id !== id));
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

  const addManualItem = (name: string) => {
    const clean = name.toLowerCase().split('(')[0].trim();
    setClearedIngredients(prev => prev.filter(i => i !== clean));
    setManualItems(prev => [...prev, { id: Date.now().toString(), name: name, checked: false }]);
  };

  const openRecipe = (recipe: Recipe) => {
    setExternallySelectedRecipeId(recipe.id);
    setCurrentView(View.Recipes);
  };

  const addMeal = (d: string, r: Recipe) => setWeeklyPlan(p => ({ ...p, [d]: [...(p[d] || []), r] }));
  const addNote = (text: string) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev]);
  const removeNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));

  // --- RENDERING ---
  const shell = embedded ? 'h-full' : 'min-h-screen';

  if (needsPin) {
    return (
      <div className={`${shell} bg-slate-50 flex flex-col items-center justify-center p-6`}>
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
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              disabled={isVerifyingPin}
              className={`w-full text-center text-2xl tracking-[0.5em] font-bold bg-slate-50 border ${pinError ? 'border-red-500' : 'border-slate-200'} rounded-2xl px-4 py-4 outline-none focus:ring-2 focus:ring-indigo-100 transition-all`}
              autoFocus
            />
            {pinError && <p className="text-red-500 text-xs font-bold">Incorrect PIN. Try again.</p>}
            {initStatus && !pinError && <p className="text-slate-400 text-xs font-bold">{initStatus}</p>}
            <button type="submit" disabled={isVerifyingPin || !pinInput} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg">
              {isVerifyingPin ? 'Unlocking...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className={`${shell} bg-slate-50 flex flex-col items-center justify-center p-6`}>
        <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
        <p className="text-slate-600 font-bold animate-pulse">{initStatus || 'Opening Dashboard...'}</p>
      </div>
    );
  }

  const navItems = [
    ...(isHome ? [{ id: View.Home, label: 'Home', icon: <HomeIcons.Home className="w-5 h-5" /> }] : []),
    { id: View.Dashboard, label: isHome ? 'This week' : 'Dashboard', icon: <ICONS.Dashboard /> },
    { id: View.Recipes, label: 'Recipes', icon: <ICONS.Recipes /> },
    { id: View.ShoppingList, label: 'Shopping', icon: <ICONS.Shopping /> },
    ...(isHome ? [
      { id: View.Lights, label: 'Lights', icon: <HomeIcons.Bulb className="w-5 h-5" /> },
      { id: View.Music, label: 'Music', icon: <HomeIcons.Music className="w-5 h-5" /> },
      { id: View.Settings, label: 'Settings', icon: <HomeIcons.Gear className="w-5 h-5" /> },
    ] : []),
  ];

  // On the kitchen iPad the menu is a slim rail so the content gets the room.
  const nav = embedded ? (
    <nav className="w-[5.5rem] shrink-0 bg-white border-r border-slate-200 flex flex-col items-center py-5 gap-2">
      <div className="relative bg-indigo-600 p-2.5 rounded-xl text-white mb-4">
        <ICONS.Dashboard />
        {(isSyncing || isLoading) && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white animate-pulse" />}
      </div>
      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => setCurrentView(item.id)}
          className={`w-[4.5rem] flex flex-col items-center gap-1 py-2.5 rounded-2xl text-[11px] font-bold transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  ) : (
    <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="bg-indigo-600 p-2 rounded-lg text-white"><ICONS.Dashboard /></div><span className="text-xl font-bold tracking-tight">Harmony</span></div>
        {(isSyncing || isLoading) && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
      </div>
      <div className="space-y-1 flex-1">
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${currentView === item.id ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{item.icon}{item.label}</button>
        ))}
      </div>
      <div className="pt-6 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-3 px-2"><img src={auth.user?.picture} className="w-10 h-10 rounded-full border border-slate-200" alt="Avatar" /><div className="flex-1 overflow-hidden"><p className="text-sm font-semibold text-slate-900 truncate">{auth.user?.name}</p><p className="text-xs text-slate-500 truncate">{auth.user?.email}</p></div></div>
      </div>
    </nav>
  );

  return (
    <div className={`flex ${embedded ? 'flex-row h-full' : 'flex-col md:flex-row min-h-screen'} relative`}>
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
            <button onClick={() => { setIsTokenExpired(false); loginSilently(); }} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">Reconnect</button>
          </div>
        </div>
      )}

      {nav}

      <main className={`flex-1 bg-slate-50 overflow-y-auto ${embedded ? 'p-5 lg:p-6' : 'p-4 md:p-10'}`}>
        {currentView === View.Home && isHome && (
          <HomeScreen
            weeklyPlan={weeklyPlan}
            recipes={recipes}
            notes={notes}
            manualItems={manualItems}
            onAddNote={addNote}
            onRemoveNote={removeNote}
            onAddShoppingItem={addManualItem}
            onAddMeal={addMeal}
            onOpenRecipe={openRecipe}
            onNavigate={setCurrentView}
            events={calendarEvents}
          />
        )}
        {currentView === View.Lights && isHome && <LightsView />}
        {currentView === View.Music && isHome && <MusicView />}
        {currentView === View.Settings && isHome && <SettingsView settings={withDefaults(settings)} onChange={setSettings} calendar={calendarStatus} />}
        {currentView === View.Dashboard && (
          <Dashboard
            compact={isHome}
            events={calendarEvents}
            weeklyPlan={weeklyPlan}
            recipes={recipes}
            notes={notes}
            onAddMeal={addMeal}
            onRemoveMeal={(d, id) => setWeeklyPlan(p => ({ ...p, [d]: p[d].filter(r => r.id !== id) }))}
            onMoveMeal={(s, t, id) => setWeeklyPlan(p => { const next = { ...p }; const move = next[s].find(r => r.id === id); if (move) { next[s] = next[s].filter(r => r.id !== id); next[t] = [...next[t], move]; } return next; })}
            onAddNote={addNote}
            onRemoveNote={removeNote}
            onViewRecipe={openRecipe}
            onResetWeek={handleResetWeek}
          />
        )}
        {currentView === View.Recipes && <RecipeBook recipes={recipes} onRefresh={() => fetchData()} onAddRecipe={addRecipe} onUpdateRecipe={updateRecipe} onDeleteRecipe={deleteRecipe} hiddenIngredients={hiddenIngredients} onUpdateHidden={setHiddenIngredients} onAddManualShoppingItem={addManualItem} externalIdToOpen={externallySelectedRecipeId} onClearExternalId={() => setExternallySelectedRecipeId(null)} />}
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

      <TimerTray />
      {embedded && isHome && <NightMode events={calendarEvents} weeklyPlan={weeklyPlan} />}
    </div>
  );
};

export default App;
