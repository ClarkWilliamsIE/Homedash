// lib/weekDates.ts
// The week view always runs from today forward, so each planned meal remembers the date it's
// for. Once that date has passed the meal comes off the plan, leaving the day free for next
// week's planning (and its ingredients off the shopping list).

import type { Recipe, WeeklyPlan } from '../types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** YYYY-MM-DD in local time (so it sorts and compares as text). */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** The next time this weekday comes round, counting today. */
export const dateForDay = (day: string, now = new Date()) =>
  isoDay(addDays(now, (DAYS.indexOf(day) - now.getDay() + 7) % 7));

export const stampMeal = (day: string, meal: Recipe, now = new Date()): Recipe =>
  ({ ...meal, plannedFor: dateForDay(day, now) });

/**
 * Dates any meal planned before dates were kept (taken as this Sunday-to-Saturday week),
 * and removes meals whose day has been. Returns the same object when nothing changed.
 */
export function tidyPlan(plan: WeeklyPlan, now = new Date()): WeeklyPlan {
  const today = isoDay(now);
  const weekStart = addDays(now, -now.getDay());
  let changed = false;
  const next: WeeklyPlan = {};
  for (const day of Object.keys(plan)) {
    const kept: Recipe[] = [];
    for (const meal of plan[day] || []) {
      let m = meal;
      if (!m.plannedFor) {
        const idx = DAYS.indexOf(day);
        m = { ...m, plannedFor: isoDay(addDays(weekStart, idx < 0 ? 0 : idx)) };
        changed = true;
      }
      if (m.plannedFor! < today) { changed = true; continue; }
      kept.push(m);
    }
    next[day] = kept;
  }
  return changed ? next : plan;
}
