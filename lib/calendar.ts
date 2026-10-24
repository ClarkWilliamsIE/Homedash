// lib/calendar.ts
// Reads the family's Google Calendars with the same Google login Homedash uses for the Sheet.

import { CalendarEvent } from '../types';

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  /** ticked in Google Calendar itself */
  selected: boolean;
}

export type CalendarResult =
  | { ok: true; calendars: CalendarInfo[]; events: CalendarEvent[] }
  | { ok: false; reason: 'no-access' | 'expired' | 'error' };

const API = 'https://www.googleapis.com/calendar/v3';

export async function loadCalendar(token: string, chosen: string[] | null, days = 2): Promise<CalendarResult> {
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const listRes = await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, { headers });
    if (listRes.status === 401) return { ok: false, reason: 'expired' };
    if (listRes.status === 403) return { ok: false, reason: 'no-access' };
    if (!listRes.ok) return { ok: false, reason: 'error' };
    const list = await listRes.json();
    const calendars: CalendarInfo[] = (list.items || []).map((c: any) => ({
      id: c.id,
      name: c.summaryOverride || c.summary,
      color: c.backgroundColor || '#6366f1',
      primary: !!c.primary,
      selected: !!c.selected,
    }));

    const show = calendars.filter(c => (chosen ? chosen.includes(c.id) : c.selected || c.primary));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + days);
    const params = `timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=50`;

    const perCalendar = await Promise.all(show.map(async c => {
      const r = await fetch(`${API}/calendars/${encodeURIComponent(c.id)}/events?${params}`, { headers });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.items || [])
        .filter((e: any) => e.status !== 'cancelled')
        .map((e: any): CalendarEvent => ({
          id: `${c.id}:${e.id}`,
          summary: e.summary || '(No title)',
          start: e.start,
          end: e.end,
          location: e.location,
          calendarName: c.name,
          color: c.color,
        }));
    }));

    const time = (e: CalendarEvent) => new Date(e.start.dateTime || `${e.start.date}T00:00:00`).getTime();
    const events = perCalendar.flat().sort((a, b) => time(a) - time(b));
    return { ok: true, calendars, events };
  } catch (err) {
    console.error('Calendar load failed', err);
    return { ok: false, reason: 'error' };
  }
}

/** Events that happen on the given day (all-day events included). */
export const eventsOn = (events: CalendarEvent[], dayIn: Date) => {
  const day = new Date(dayIn); day.setHours(0, 0, 0, 0);
  const key = day.toDateString();
  return events.filter(e => {
    if (e.start.date) {
      const s = new Date(`${e.start.date}T00:00:00`), en = new Date(`${(e.end.date || e.start.date)}T00:00:00`);
      return day >= s && day < (en > s ? en : new Date(s.getTime() + 86400000));
    }
    return new Date(e.start.dateTime!).toDateString() === key;
  });
};

export const eventTime = (e: CalendarEvent) =>
  e.start.dateTime
    ? new Date(e.start.dateTime).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '')
    : 'All day';
