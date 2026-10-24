// lib/merge.ts
// Three-way merge for the shared family state stored in the Google Sheet.
// `base` is what this device last saw in the sheet, `local` is what it has now,
// `remote` is what's in the sheet now (maybe changed from a phone). Changes on both
// sides are kept: additions from either side survive, deletions from either side apply,
// and when the same item was edited on both, this device's edit wins.

import { Recipe, WeeklyPlan, FamilyNote } from '../types';
import type { HomeSettings } from './settings';

export interface ManualItem {
  id: string;
  name: string;
  checked: boolean;
}

export interface SyncState {
  weeklyPlan: WeeklyPlan;
  notes: FamilyNote[];
  manualItems: ManualItem[];
  hiddenIngredients: string[];
  clearedIngredients: string[];
  checkedIngredients: string[];
  /** Settings screen (music moods, rooms, Start cooking). null until someone changes a setting. */
  settings: HomeSettings | null;
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Always the same key order, so JSON comparisons are reliable. */
export const pack = (s: Partial<SyncState>): SyncState => ({
  weeklyPlan: Object.fromEntries(DAYS.map(d => [d, s.weeklyPlan?.[d] || []])),
  notes: s.notes || [],
  manualItems: s.manualItems || [],
  hiddenIngredients: s.hiddenIngredients || [],
  clearedIngredients: s.clearedIngredients || [],
  checkedIngredients: s.checkedIngredients || [],
  settings: s.settings ?? null,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function mergeList<T>(base: T[], local: T[], remote: T[], key: (t: T) => string): T[] {
  const baseMap = new Map(base.map(x => [key(x), x]));
  const localMap = new Map(local.map(x => [key(x), x]));
  const out: T[] = [];
  const seen = new Set<string>();

  for (const r of remote) {
    const k = key(r);
    if (seen.has(k)) continue;
    const b = baseMap.get(k);
    const l = localMap.get(k);
    if (b !== undefined && l === undefined) continue; // deleted here
    if (l !== undefined && (b === undefined || !same(l, b))) out.push(l); // edited/added here
    else out.push(r);
    seen.add(k);
  }
  local.forEach((l, index) => {
    const k = key(l);
    if (seen.has(k)) return;
    // Added here, not in the sheet yet: keep it where it was added (new notes go on top).
    if (!baseMap.has(k)) { out.splice(Math.min(index, out.length), 0, l); seen.add(k); }
    // In base but missing from remote → deleted elsewhere, so drop it.
  });
  return out;
}

const byId = (x: { id: string }) => x.id;
const self = (s: string) => s;

export function mergeState(baseIn: SyncState, localIn: SyncState, remoteIn: SyncState): SyncState {
  const base = pack(baseIn), local = pack(localIn), remote = pack(remoteIn);
  return pack({
    weeklyPlan: Object.fromEntries(
      DAYS.map(d => [d, mergeList<Recipe>(base.weeklyPlan[d], local.weeklyPlan[d], remote.weeklyPlan[d], byId)])
    ),
    notes: mergeList(base.notes, local.notes, remote.notes, byId),
    manualItems: mergeList(base.manualItems, local.manualItems, remote.manualItems, byId),
    hiddenIngredients: mergeList(base.hiddenIngredients, local.hiddenIngredients, remote.hiddenIngredients, self),
    clearedIngredients: mergeList(base.clearedIngredients, local.clearedIngredients, remote.clearedIngredients, self),
    checkedIngredients: mergeList(base.checkedIngredients, local.checkedIngredients, remote.checkedIngredients, self),
    // Settings are saved as a whole: if this device changed them, its version wins.
    settings: same(local.settings, base.settings) ? remote.settings : local.settings,
  });
}
