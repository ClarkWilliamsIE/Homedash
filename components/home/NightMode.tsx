// components/home/NightMode.tsx
// Late at night, after a couple of idle minutes, the iPad shows a dark, dim clock.
// Any touch brings the dashboard back.

import React, { useEffect, useState } from 'react';
import { CalendarEvent, WeeklyPlan } from '../../types';
import { useSettings } from '../../lib/settings';
import { useTimers } from '../../lib/timers';
import { useWeather } from '../../lib/useWeather';
import { eventsOn, eventTime } from '../../lib/calendar';

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True when `now` is between start and end (handles overnight, e.g. 21:30 → 06:30). */
export const inNightWindow = (now: Date, start: string, end: string) => {
  const t = now.getHours() * 60 + now.getMinutes();
  const s = minutesOf(start), e = minutesOf(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const NightMode: React.FC<{ events: CalendarEvent[]; weeklyPlan: WeeklyPlan }> = ({ events, weeklyPlan }) => {
  const { night } = useSettings();
  const timers = useTimers();
  const weather = useWeather();
  const [lastTouch, setLastTouch] = useState(Date.now());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const wake = () => setLastTouch(Date.now());
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', wake, opts);
    window.addEventListener('keydown', wake, opts);
    window.addEventListener('touchstart', wake, opts);
    const tick = setInterval(() => setNow(new Date()), 10 * 1000);
    return () => {
      window.removeEventListener('pointerdown', wake, opts);
      window.removeEventListener('keydown', wake, opts);
      window.removeEventListener('touchstart', wake, opts);
      clearInterval(tick);
    };
  }, []);

  const idle = now.getTime() - lastTouch >= night.idleMinutes * 60 * 1000;
  const timerNeedsAttention = timers.some(t => t.done || t.endsAt);
  const active = night.enabled && idle && !timerNeedsAttention && inNightWindow(now, night.start, night.end);
  if (!active) return null;

  // After midnight "tomorrow" is the coming day; before midnight it's the next day.
  const nextDay = new Date(now);
  if (now.getHours() >= 12) nextDay.setDate(nextDay.getDate() + 1);
  const upcoming = eventsOn(events, nextDay).slice(0, 2);
  const tomorrowsDinner = weeklyPlan[DAYS[nextDay.getDay()]]?.[0];
  // Drift the clock a little each minute so nothing sits in one spot all night.
  const drift = now.getMinutes() % 10;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center cursor-pointer select-none"
      onPointerDown={() => setLastTouch(Date.now())}
    >
      <div className="text-center transition-transform duration-[3000ms]" style={{ transform: `translate(${(drift - 5) * 6}px, ${(drift % 5 - 2) * 8}px)` }}>
        <p className="text-[9rem] leading-none font-semibold text-zinc-600 tabular-nums">
          {now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m$/i, '')}
        </p>
        <p className="text-2xl font-bold text-zinc-700 mt-3">
          {now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          {weather && <span> · {weather.temp}° {weather.condition.toLowerCase()}</span>}
        </p>
        <div className="mt-10 space-y-2 text-lg font-semibold text-zinc-700">
          {upcoming.map(e => (
            <p key={e.id}><span className="text-zinc-600">{nextDay.toLocaleDateString('en-NZ', { weekday: 'short' })} {eventTime(e)}</span> · {e.summary}</p>
          ))}
          {tomorrowsDinner && <p><span className="text-zinc-600">Dinner</span> · {tomorrowsDinner.name}</p>}
        </div>
      </div>
    </div>
  );
};

export default NightMode;
