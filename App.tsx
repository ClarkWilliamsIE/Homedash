// App.tsx
// Homedash: the family meal plan, recipes and shopping list, plus (inside Home Assistant)
// the house's lights and music. One app for the kitchen iPad, the website and phones.

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { AuthState, View, Recipe, CalendarEvent, WeeklyPlan, FamilyNote, Ingredient, Instruction } from './types';
import { ROOT_FOLDER_ID } from './constants';
import WeekPlanner from './components/WeekPlanner';
import RecipeBook from './components/RecipeBook';
import ShoppingList, { openItemCount } from './components/ShoppingList';
import HomeScreen from './components/home/HomeScreen';
import LightsView from './components/home/LightsView';
import MusicView from './components/home/MusicView';
import SettingsView, { CalendarStatus } from './components/home/SettingsView';
import TimerTray from './components/home/TimerTray';
import NightMode from './components/home/NightMode';
import { PhotoFrame } from './components/home/photos';
import { loadCalendar } from './lib/calendar';
import { HomeIcons } from './components/home/icons';
import { Icon, Sheet, useIsPhone } from './components/ui';
import { useIsHome } from './lib/hass';
import { apiUrl } from './lib/runtime';
import { pack, mergeState, SyncState, ManualItem as SyncManualItem } from './lib/merge';
import { HomeSettings, settingsStore, withDefaults } from './lib/settings';
import { recordItem, setItemCatalog } from './lib/items';
import { nudgeRemoteHass, startRemoteHass } from './lib/haRemote';
import { stampMeal, tidyPlan, isoDay } from './lib/weekDates';

const INITIAL_PLAN: WeeklyPlan = {
  Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

export type ManualItem = SyncManualItem;

// --- CONFIGURATION ---
const HARDCODED_SHEET_ID = '1IwqSELEbCQPAzM9-o5d1g4lXuuGzcev7F1kJeFjpihQ';

// How often to pull changes made on other devices (phones, the kitchen iPad).
const SYNC_POLL_MS = 10 * 1000;
const RECIPE_POLL_MS = 5 * 60 * 1000;

// --- OFFLINE COPY ---
// The last known recipes, plan and list are kept on this device, so the app opens with no
// signal (inside the supermarket) and ticks made offline sync when the phone reconnects.
const CACHE_KEY = 'homedash_cache_v1';
interface OfflineCopy { recipes: Recipe[]; state: SyncState; base: SyncState | null; savedAt: number }
const readCache = (): OfflineCopy | null => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.state ? { ...c, state: pack(c.state), base: c.base ? pack(c.base) : null } : null;
  } catch { return null; }
};
const writeCache = (c: Omit<OfflineCopy, 'savedAt'>) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, savedAt: Date.now() })); } catch { /* storage full or blocked */ }
};

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

// Links like ?view=shopping (for a "at the supermarket" shortcut) or ?import=<recipe url>.
const VIEW_PARAMS: Record<string, View> = { home: View.Home, week: View.Dashboard, recipes: View.Recipes, shopping: View.ShoppingList, list: View.ShoppingList };
const readLinkParams = () => {
  try {
    const p = new URLSearchParams(window.location.search);
    const shared = p.get('import') || p.get('url') || (p.get('text') || '').match(/https?:\/\/\S+/)?.[0] || null;
    const view = VIEW_PARAMS[(p.get('view') || '').toLowerCase()];
    if (shared || view) {
      ['import', 'url', 'text', 'title', 'view'].forEach(k => p.delete(k));
      const rest = p.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    }
    return { importUrl: shared, view: shared ? View.Recipes : view };
  } catch { return { importUrl: null, view: undefined }; }
};

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
      isNew: row[7] === 'TRUE',
      sourceUrl: row[8] || undefined,
    };
  });

interface AppProps {
  /** True when running inside Home Assistant (the kitchen iPad, or the HA app on a phone). */
  embedded?: boolean;
}

const App: React.FC<AppProps> = ({ embedded = false }) => {
  const isHome = useIsHome();
  const isPhone = useIsPhone();
  const online = useOnline();
  const [cached] = useState(readCache);

  // Phone/website: reach Home Assistant over Tailscale when possible (the kitchen iPad is already inside it).
  const connectHouse = (url?: string, token?: string) => {
    if (embedded) return;
    try {
      if (url && token) localStorage.setItem('homedash_ha', JSON.stringify({ url, token }));
      const saved = url && token ? { url, token } : JSON.parse(localStorage.getItem('homedash_ha') || 'null');
      if (saved?.url && saved?.token) startRemoteHass(saved.url, saved.token);
    } catch { /* storage blocked */ }
  };
  useEffect(() => { connectHouse(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (embedded) return;
    const again = () => { if (!document.hidden) nudgeRemoteHass(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('online', again); };
  }, [embedded]);
  const [link] = useState(readLinkParams);

  // --- PIN & AUTH STATE ---
  const [needsPin, setNeedsPin] = useState(!localStorage.getItem('family_pin'));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  const [auth, setAuth] = useState<AuthState>({
    token: null,
    user: { name: 'Family Member', email: 'Shared Access', picture: '' },
    isAuthenticated: false
  });

  const [currentView, setCurrentView] = useState<View>(link.view || View.Home);
  const [moreOpen, setMoreOpen] = useState(false);
  const [spreadsheetId] = useState<string>(HARDCODED_SHEET_ID);

  const [recipes, setRecipes] = useState<Recipe[]>(cached?.recipes || []);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(cached?.state.weeklyPlan || INITIAL_PLAN);
  const [notes, setNotes] = useState<FamilyNote[]>(cached?.state.notes || []);
  const [manualItems, setManualItems] = useState<ManualItem[]>(cached?.state.manualItems || []);

  const [hiddenIngredients, setHiddenIngredients] = useState<string[]>(cached?.state.hiddenIngredients || []);
  const [clearedIngredients, setClearedIngredients] = useState<string[]>(cached?.state.clearedIngredients || []);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>(cached?.state.checkedIngredients || []);
  const [pantryHidden, setPantryHidden] = useState<string[]>(cached?.state.pantryHidden || []);
  const [settings, setSettings] = useState<HomeSettings | null>(cached?.state.settings ?? null);

  // Everything the "add an item" boxes can suggest.
  useEffect(() => {
    setItemCatalog([...recipes.flatMap(r => r.ingredients.map(i => i.item)), ...hiddenIngredients]);
  }, [recipes, hiddenIngredients]);

  // Share the current settings with the home screens (moods, rooms, Start cooking).
  useEffect(() => { settingsStore.set(withDefaults(settings)); }, [settings]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ status: 'loading', calendars: [] });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [externallySelectedRecipeId, setExternallySelectedRecipeId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(link.importUrl);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initStatus, setInitStatus] = useState<string>('');
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };

  const saveTimeout = useRef<any>(null);
  const saveFailures = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const tokenAt = useRef(0);
  tokenRef.current = auth.token;

  // --- SYNC BOOKKEEPING ---
  // lastSynced: the shared state as this device last read/wrote it in the sheet.
  const lastSynced = useRef<SyncState | null>(cached?.base || null);
  const lastSyncedStr = useRef(cached?.base ? JSON.stringify(cached.base) : '');
  const isSaving = useRef(false);
  const currentState = (): SyncState => pack({ weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, pantryHidden, settings });
  const stateRef = useRef<SyncState>(currentState());
  stateRef.current = currentState();
  const recipesRef = useRef(recipes);
  recipesRef.current = recipes;

  const applyState = (s: SyncState) => {
    setWeeklyPlan(s.weeklyPlan);
    setNotes(s.notes);
    setManualItems(s.manualItems);
    setHiddenIngredients(s.hiddenIngredients);
    setClearedIngredients(s.clearedIngredients);
    setCheckedIngredients(s.checkedIngredients);
    setPantryHidden(s.pantryHidden);
    setSettings(s.settings);
  };

  const markSynced = (s: SyncState) => {
    lastSynced.current = s;
    lastSyncedStr.current = JSON.stringify(s);
  };

  // Keep the offline copy up to date.
  useEffect(() => {
    writeCache({ recipes, state: stateRef.current, base: lastSynced.current });
  }, [recipes, weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, pantryHidden, settings, isSyncing]);

  // SILENT LOGIN: sends the PIN to the backend to get the token
  const loginSilently = useCallback(async (pinToTry?: string) => {
    const pin = pinToTry || localStorage.getItem('family_pin');
    if (!pin) {
      setNeedsPin(true);
      return null;
    }

    setInitStatus('Connecting…');
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
          tokenAt.current = Date.now();
          connectHouse(data.ha_url, data.ha_token);
          setNeedsPin(false);
          setPinError(false);
          setAuth(a => ({ ...a, token: data.access_token, isAuthenticated: true }));
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

      setInitStatus("Couldn't reach the family database. Check your connection and try again.");
    } catch (e) {
      setInitStatus("No connection. Homedash will connect when you're back online.");
      console.error('Homedash: sign-in failed', e);
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
    // Signed in: refresh the token every 45 minutes. Opened from the offline copy without
    // signal: keep trying every 20 seconds until the connection comes back.
    const interval = setInterval(() => {
      if (!needsPin && navigator.onLine) loginSilently();
    }, auth.isAuthenticated ? 45 * 60 * 1000 : 20 * 1000);
    return () => clearInterval(interval);
  }, [auth.isAuthenticated, needsPin, loginSilently]);

  // A lapsed Google token: quietly get a new one rather than asking anyone to reload.
  useEffect(() => {
    if (isTokenExpired && navigator.onLine) loginSilently();
  }, [isTokenExpired, loginSilently]);

  // --- SHEET ACCESS ---
  const sheetUrl = (range: string, extra = '') =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}${extra}`;

  const readSyncData = async (token: string): Promise<SyncState | null | 'expired'> => {
    const res = await fetch(sheetUrl('SyncData!A1', '?valueRenderOption=UNFORMATTED_VALUE'), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return 'expired';
    if (!res.ok) throw new Error(`Sheet read failed (${res.status})`);
    const data = await res.json();
    const raw = data.values?.[0]?.[0];
    if (!raw) return null;
    try { return pack(JSON.parse(raw)); } catch (e) { console.error("Failed to parse SyncData", e); return null; }
  };

  const writeSyncData = async (token: string, s: SyncState) => {
    const res = await fetch(sheetUrl('SyncData!A1', '?valueInputOption=USER_ENTERED'), {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[JSON.stringify(s)]] })
    });
    if (!res.ok) throw new Error(`Sheet write failed (${res.status})`);
  };

  const readRecipes = async (token: string): Promise<Recipe[] | 'expired'> => {
    const res = await fetch(sheetUrl('Recipes!A2:I'), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return 'expired';
    if (!res.ok) throw new Error(`Recipe read failed (${res.status})`);
    const data = await res.json();
    return data.values ? parseRecipeRows(data.values) : [];
  };

  const hasUnsaved = () => !!lastSynced.current && JSON.stringify(stateRef.current) !== lastSyncedStr.current;

  // --- SAVE: merge with whatever other devices wrote since we last looked ---
  const saveNow = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || !lastSynced.current || isSaving.current) return;
    const local = stateRef.current;
    if (JSON.stringify(local) === lastSyncedStr.current) return;

    isSaving.current = true;
    setIsSyncing(true);
    let failed = false;
    try {
      const remote = await readSyncData(token);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      const base = lastSynced.current;
      const remoteChanged = remote && JSON.stringify(remote) !== lastSyncedStr.current;
      const toWrite = remoteChanged ? mergeState(base, local, remote) : local;
      await writeSyncData(token, toWrite);
      markSynced(toWrite);
      saveFailures.current = 0;

      if (remoteChanged) {
        // Show the merged result, keeping anything typed while we were saving.
        const latest = stateRef.current;
        applyState(JSON.stringify(latest) === JSON.stringify(local) ? toWrite : mergeState(local, latest, toWrite));
      }
    } catch (err) {
      failed = true;
      saveFailures.current += 1;
      console.error("Failed to sync state", err);
    } finally {
      isSaving.current = false;
      setIsSyncing(false);
      // More changes arrived during the save, or the save failed (weak signal): try again,
      // waiting longer after each failure. Going back online also retries straight away.
      if (JSON.stringify(stateRef.current) !== lastSyncedStr.current && navigator.onLine) {
        const wait = failed ? Math.min(60000, 2000 * 2 ** (saveFailures.current - 1)) : 1000;
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => saveNow(), wait);
      }
    }
  }, []);

  const fetchData = useCallback(async (overrideToken?: string) => {
    const activeToken = overrideToken || auth.token;
    if (!activeToken || !spreadsheetId) return;

    setIsLoading(true);
    try {
      const fresh = await readRecipes(activeToken);
      if (fresh === 'expired') { setIsTokenExpired(true); return; }
      setRecipes(fresh);

      if (hasUnsaved()) {
        // Changes were made offline: merge them into the sheet instead of replacing them.
        saveNow();
        return;
      }
      const remote = await readSyncData(activeToken);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      if (remote) {
        if (hasUnsaved()) { saveNow(); return; }
        applyState(remote);
        markSynced(remote);
      } else if (!lastSynced.current) {
        markSynced(stateRef.current);
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, spreadsheetId, saveNow]);

  useEffect(() => {
    if (auth.isAuthenticated && spreadsheetId && !isTokenExpired) {
      fetchData();
    }
  }, [auth.isAuthenticated, spreadsheetId, fetchData, isTokenExpired]);

  // AUTO SAVE CHANGES TO SHEET
  useEffect(() => {
    if (!auth.token || !lastSynced.current || isTokenExpired) return;
    if (JSON.stringify(stateRef.current) === lastSyncedStr.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveNow(), 1500);
    return () => clearTimeout(saveTimeout.current);
  }, [weeklyPlan, notes, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients, pantryHidden, settings, auth.token, isTokenExpired, saveNow]);

  // Back online: sign in if we couldn't before, and send anything ticked while offline.
  useEffect(() => {
    if (!online || needsPin) return;
    if (!tokenRef.current) loginSilently();
    else { saveFailures.current = 0; saveNow(); }
  }, [online, needsPin, loginSilently, saveNow]);

  // --- PULL: pick up changes made on phones while this screen is open ---
  const pullChanges = useCallback(async (includeRecipes = false) => {
    const token = tokenRef.current;
    if (!token || !lastSynced.current || isSaving.current || !navigator.onLine) return;
    // Edits here that haven't reached the sheet yet (say a save failed on weak signal):
    // save now, which reads the sheet, merges both sides and shows the result.
    if (JSON.stringify(stateRef.current) !== lastSyncedStr.current) { saveNow(); return; }
    try {
      const remote = await readSyncData(token);
      if (remote === 'expired') { setIsTokenExpired(true); return; }
      if (remote && JSON.stringify(remote) !== lastSyncedStr.current) {
        if (JSON.stringify(stateRef.current) === lastSyncedStr.current) {
          markSynced(remote);
          applyState(remote);
        } else {
          saveNow(); // something was ticked while we were reading: merge instead
        }
      }
      if (includeRecipes) {
        const fresh = await readRecipes(token);
        if (fresh !== 'expired') setRecipes(fresh);
      }
    } catch (err) { console.error("Failed to pull changes", err); }
  }, [saveNow]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const syncTimer = setInterval(() => { if (!document.hidden) pullChanges(false); }, SYNC_POLL_MS);
    const recipeTimer = setInterval(() => { if (!document.hidden) pullChanges(true); }, RECIPE_POLL_MS);
    // Coming back to the app (unlocking the phone, switching back from another app).
    // Phones pause the app in the background, so its Google sign-in may have lapsed: renew it first.
    let last = 0;
    const onResume = async () => {
      if (document.hidden || Date.now() - last < 2000) return;
      last = Date.now();
      if (Date.now() - tokenAt.current > 40 * 60 * 1000 && navigator.onLine) await loginSilently();
      pullChanges(true);
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      clearInterval(syncTimer);
      clearInterval(recipeTimer);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [auth.isAuthenticated, pullChanges, loginSilently]);

  // --- FAMILY CALENDAR ---
  const chosenCalendars = JSON.stringify(withDefaults(settings).calendars);
  const refreshCalendar = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || !navigator.onLine) return;
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
  // Recipe changes need a connection; the plan and list work offline.
  const saveRecipeChange = async (change: (list: Recipe[]) => Recipe[]): Promise<boolean> => {
    const token = auth.token;
    if (!navigator.onLine || !token) {
      showToast("Recipe changes need a connection. Try again when you have signal.");
      return false;
    }
    try {
      const fresh = await readRecipes(token);
      const next = change(fresh === 'expired' ? recipes : fresh);
      const values = next.map(r => [
        r.name,
        JSON.stringify(r.ingredients),
        r.imageUrl,
        r.tags.join(', '),
        JSON.stringify(r.instructions),
        r.id,
        r.isFavorite ? 'TRUE' : 'FALSE',
        r.isNew ? 'TRUE' : 'FALSE',
        r.sourceUrl || ''
      ]);
      await fetch(sheetUrl('Recipes!A2:I:clear'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const res = await fetch(sheetUrl('Recipes!A2:I', '?valueInputOption=USER_ENTERED'), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
      if (!res.ok) throw new Error(`Recipe save failed (${res.status})`);
      setRecipes(next);
      return true;
    } catch (err) {
      console.error("Failed to save recipes", err);
      showToast("Couldn't save the recipe. Check your connection and try again.");
      return false;
    }
  };

  const addRecipe = async (recipe: Omit<Recipe, 'id'>, imageFile?: File) => {
    let finalImageUrl = recipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const newRecipe = { ...recipe, imageUrl: finalImageUrl, id: Date.now().toString() };
    const ok = await saveRecipeChange(list => [...list, newRecipe]);
    if (ok) showToast(`Saved ${recipe.name}`);
    return ok;
  };

  const updateRecipe = async (updatedRecipe: Recipe, imageFile?: File) => {
    let finalImageUrl = updatedRecipe.imageUrl;
    if (imageFile) {
      const uploadedUrl = await uploadToDrive(imageFile);
      if (uploadedUrl) finalImageUrl = uploadedUrl;
    }
    const merged = { ...updatedRecipe, imageUrl: finalImageUrl };
    return saveRecipeChange(list => list.map(r => r.id === merged.id ? merged : r));
  };

  const deleteRecipe = async (id: string) => {
    if (confirm("Delete this recipe? This can't be undone.")) {
      return saveRecipeChange(list => list.filter(r => r.id !== id));
    }
    return false;
  };

  const handleResetWeek = () => {
    if (confirm("Start a new week? This clears the meal plan and the shopping list.")) {
      setWeeklyPlan(INITIAL_PLAN);
      setClearedIngredients([]);
      setCheckedIngredients([]);
      setManualItems([]);
    }
  };

  const addManualItem = (name: string) => {
    recordItem(name);
    const clean = name.toLowerCase().split('(')[0].trim();
    setClearedIngredients(prev => prev.filter(i => i !== clean));
    setManualItems(prev => [...prev, { id: Date.now().toString(), name: name, checked: false }]);
  };

  const navigate = (view: View) => {
    setCurrentView(view);
    setMoreOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const openRecipe = (recipe: Recipe, cook = false) => {
    // One-off meals have no recipe page; they're edited from the week.
    if (recipe.isCustom) { navigate(View.Dashboard); return; }
    setExternallySelectedRecipeId(cook ? `cook:${recipe.id}` : recipe.id);
    navigate(View.Recipes);
  };

  const addMeal = (d: string, r: Recipe) => setWeeklyPlan(p => ({ ...p, [d]: [...(p[d] || []), stampMeal(d, r)] }));
  const removeMeal = (d: string, id: string) => setWeeklyPlan(p => ({ ...p, [d]: p[d].filter(r => r.id !== id) }));
  const updateMeal = (d: string, meal: Recipe) => setWeeklyPlan(p => ({ ...p, [d]: p[d].map(r => r.id === meal.id ? { ...meal, plannedFor: r.plannedFor } : r) }));
  const moveMeal = (s: string, t: string, id: string) => setWeeklyPlan(p => {
    const next = { ...p };
    const move = next[s].find(r => r.id === id);
    if (move) { next[s] = next[s].filter(r => r.id !== id); next[t] = [...next[t], stampMeal(t, move)]; }
    return next;
  });

  // Meals come off the plan once their day has been, so the week view (which always starts
  // today) never shows last Sunday's dinner as next Sunday's. Checked again when the date
  // ticks over, for the kitchen iPad that stays open overnight.
  const [todayKey, setTodayKey] = useState(() => isoDay(new Date()));
  useEffect(() => {
    const tick = () => setTodayKey(isoDay(new Date()));
    const t = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    setWeeklyPlan(p => tidyPlan(p));
  }, [weeklyPlan, todayKey]);
  const addNote = (text: string) => setNotes(prev => [{ id: Date.now().toString(), text, color: 'bg-yellow-100' }, ...prev]);
  const removeNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));

  const mainRef = useRef<HTMLElement>(null);

  // --- RENDERING ---
  const shell = embedded ? 'h-full' : 'h-[100dvh]';

  if (needsPin) {
    return (
      <div className={`${shell} bg-slate-50 flex flex-col items-center justify-center p-6 pt-safe`}>
        <div className="w-full max-w-xs text-center">
          <img src={apiUrl('/icons/icon-192.png')} alt="" className="w-20 h-20 rounded-[1.4rem] mx-auto shadow-lg" />
          <h1 className="font-display text-4xl text-slate-900 mt-6">Homedash</h1>
          <p className="text-slate-500 mt-2">Enter the family PIN to open the meal plan and shopping list.</p>
          <form onSubmit={handlePinSubmit} className="space-y-3 mt-8">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              aria-label="Family PIN"
              disabled={isVerifyingPin}
              className={`w-full text-center text-2xl tracking-[0.4em] font-semibold bg-white border ${pinError ? 'border-rose-500' : 'border-slate-200'} rounded-2xl px-4 py-4 outline-none focus:border-indigo-500`}
              autoFocus
            />
            {pinError && <p className="text-rose-700 text-sm font-semibold">That PIN didn't work. Try again.</p>}
            {initStatus && !pinError && <p className="text-slate-500 text-sm">{initStatus}</p>}
            <button type="submit" disabled={isVerifyingPin || !pinInput} className="w-full bg-indigo-700 text-white h-14 rounded-2xl font-semibold text-lg hover:bg-indigo-800 disabled:opacity-40">
              {isVerifyingPin ? 'Opening…' : 'Open Homedash'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // With an offline copy we can show the app straight away and connect in the background.
  if (!auth.isAuthenticated && !cached) {
    return (
      <div className={`${shell} bg-slate-50 flex flex-col items-center justify-center p-6 text-center`}>
        <div className="animate-spin w-9 h-9 border-[3px] border-indigo-700 border-t-transparent rounded-full mb-4" />
        <p className="text-slate-600 font-medium max-w-xs">{initStatus || 'Opening Homedash…'}</p>
        {initStatus && !online && <button onClick={() => loginSilently()} className="mt-4 text-indigo-700 font-semibold">Try again</button>}
      </div>
    );
  }

  const shoppingLeft = openItemCount({ weeklyPlan, manualItems, hiddenIngredients, clearedIngredients, checkedIngredients });

  const mainTabs = [
    { id: View.Home, label: 'Home', icon: <Icon.Home className="w-6 h-6" /> },
    { id: View.Dashboard, label: 'Week', icon: <Icon.Week className="w-6 h-6" /> },
    { id: View.Recipes, label: 'Recipes', icon: <Icon.Book className="w-6 h-6" /> },
    { id: View.ShoppingList, label: 'Shopping', icon: <Icon.Basket className="w-6 h-6" />, badge: shoppingLeft },
  ];
  const houseTabs = isHome ? [
    { id: View.Lights, label: 'Lights', icon: <HomeIcons.Bulb className="w-6 h-6" /> },
    { id: View.Music, label: 'Music', icon: <HomeIcons.Music className="w-6 h-6" /> },
    { id: View.Settings, label: 'Settings', icon: <HomeIcons.Gear className="w-6 h-6" /> },
  ] : [];
  const unsaved = hasUnsaved();
  const status: null | { tone: 'offline' | 'saving'; text: string } =
    !online ? { tone: 'offline', text: unsaved ? 'Offline · changes saved on this device' : 'Offline' }
      : isTokenExpired || (!auth.isAuthenticated && cached) ? { tone: 'saving', text: 'Connecting…' }
        : isSyncing ? { tone: 'saving', text: 'Saving…' } : null;

  const badge = (n?: number) => n ? (
    <span className="absolute -top-1 left-1/2 ml-2 min-w-[1.25rem] h-5 px-1 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center">{n > 99 ? '99+' : n}</span>
  ) : null;

  const tabButton = (item: { id: View; label: string; icon: React.ReactNode; badge?: number }, rail: boolean) => {
    const active = currentView === item.id;
    return rail ? (
      <button
        key={item.id}
        onClick={() => navigate(item.id)}
        aria-current={active ? 'page' : undefined}
        className={`relative w-[4.5rem] flex flex-col items-center gap-1 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${active ? 'bg-white/15 text-white' : 'text-indigo-200 hover:bg-white/10 hover:text-white'}`}
      >
        <span className="relative">{item.icon}{badge(item.badge)}</span>
        {item.label}
      </button>
    ) : (
      <button
        key={item.id}
        onClick={() => navigate(item.id)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold ${active ? 'text-indigo-700' : 'text-slate-500'}`}
      >
        <span className={`relative px-4 py-1 rounded-full ${active ? 'bg-indigo-50' : ''}`}>{item.icon}{badge(item.badge)}</span>
        {item.label}
      </button>
    );
  };

  const statusChip = status && (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${status.tone === 'offline' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
      {status.tone === 'offline' ? <Icon.Cloud className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
      {status.text}
    </div>
  );

  const content = (
    <>
      {currentView === View.Home && (
        <HomeScreen
          weeklyPlan={weeklyPlan}
          recipes={recipes}
          notes={notes}
          shoppingLeft={shoppingLeft}
          onAddNote={addNote}
          onRemoveNote={removeNote}
          onAddShoppingItem={addManualItem}
          onAddMeal={addMeal}
          onOpenRecipe={openRecipe}
          onNavigate={navigate}
          events={calendarEvents}
        />
      )}
      {currentView === View.Lights && isHome && <LightsView />}
      {currentView === View.Music && isHome && <MusicView />}
      {currentView === View.Settings && isHome && <SettingsView settings={withDefaults(settings)} onChange={setSettings} calendar={calendarStatus} />}
      {currentView === View.Dashboard && (
        <WeekPlanner
          weeklyPlan={weeklyPlan}
          recipes={recipes}
          onAddMeal={addMeal}
          onRemoveMeal={removeMeal}
          onUpdateMeal={updateMeal}
          onMoveMeal={moveMeal}
          onViewRecipe={openRecipe}
          onResetWeek={handleResetWeek}
          onOpenShopping={() => navigate(View.ShoppingList)}
          shoppingLeft={shoppingLeft}
        />
      )}
      {currentView === View.Recipes && (
        <RecipeBook
          recipes={recipes}
          weeklyPlan={weeklyPlan}
          onRefresh={() => fetchData()}
          onAddRecipe={addRecipe}
          onUpdateRecipe={updateRecipe}
          onDeleteRecipe={deleteRecipe}
          onAddMeal={addMeal}
          hiddenIngredients={hiddenIngredients}
          onUpdateHidden={setHiddenIngredients}
          onAddManualShoppingItem={addManualItem}
          externalIdToOpen={externallySelectedRecipeId}
          onClearExternalId={() => setExternallySelectedRecipeId(null)}
          importUrl={pendingImport}
          onImportHandled={() => setPendingImport(null)}
        />
      )}
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
          pantryHidden={pantryHidden}
          onUpdatePantryHidden={setPantryHidden}
        />
      )}
    </>
  );

  return (
    <div className={`${shell} flex ${isPhone ? 'flex-col' : 'flex-row'} bg-slate-50 text-slate-900 relative overflow-hidden`}>
      {!isPhone && (
        <nav className="w-[5.75rem] shrink-0 bg-indigo-800 flex flex-col items-center py-5 gap-1.5 overflow-y-auto no-scrollbar" aria-label="Homedash">
          <img src={apiUrl('/icons/icon-192.png')} alt="Homedash" className="w-11 h-11 rounded-xl mb-4 ring-1 ring-white/15" />
          {mainTabs.map(t => tabButton(t, true))}
          {houseTabs.length > 0 && <div className="w-10 h-px bg-white/15 my-2" />}
          {houseTabs.map(t => tabButton(t, true))}
        </nav>
      )}

      <main ref={mainRef} className={`flex-1 min-h-0 overflow-y-auto ${isPhone ? 'px-4 pb-6 pt-safe-4' : embedded ? 'p-6' : 'p-6 lg:p-10'}`}>
        <div className="max-w-[1400px] mx-auto">{content}</div>
      </main>

      {status && !isPhone && <div className="absolute top-3 right-5 z-30">{statusChip}</div>}

      {isPhone && status && (
        <div className={`shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${status.tone === 'offline' ? 'bg-slate-800 text-white' : 'bg-amber-50 text-slate-600 border-t border-amber-100'}`} role="status">
          {status.tone === 'offline' ? <Icon.Cloud className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          {status.text}
        </div>
      )}

      {isPhone && (
        <nav className="shrink-0 bg-white border-t border-slate-200 flex pb-safe z-40" aria-label="Homedash">
          {mainTabs.map(t => tabButton(t, false))}
          {houseTabs.length > 0 && (
            <button onClick={() => setMoreOpen(true)} className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold ${houseTabs.some(t => t.id === currentView) ? 'text-indigo-700' : 'text-slate-500'}`}>
              <span className={`px-4 py-1 rounded-full ${houseTabs.some(t => t.id === currentView) ? 'bg-indigo-50' : ''}`}><HomeIcons.Bulb className="w-6 h-6" /></span>
              House
            </button>
          )}
        </nav>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="House">
        <div className="grid grid-cols-3 gap-3 pb-2">
          {houseTabs.map(t => (
            <button key={t.id} onClick={() => navigate(t.id)} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-slate-100 text-slate-800 font-semibold">
              <span className="text-indigo-700">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </Sheet>

      {toast && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-[150] ${isPhone ? 'bottom-24' : 'bottom-8'} max-w-[90vw] px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold shadow-xl`} role="status">
          {toast}
        </div>
      )}

      <TimerTray />
      {embedded && isHome && <PhotoFrame weeklyPlan={weeklyPlan} />}
      {embedded && isHome && <NightMode events={calendarEvents} weeklyPlan={weeklyPlan} />}
    </div>
  );
};

export default App;
