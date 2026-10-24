// lib/timers.ts
// Kitchen timers. Kept on this device (they survive a page reload); when one finishes
// the screen chimes and, inside Home Assistant, the kitchen speaker announces it.

import { useSyncExternalStore } from 'react';

export interface Timer {
  id: string;
  label: string;
  /** total length in ms */
  duration: number;
  /** when it finishes (ms since epoch) while running */
  endsAt: number | null;
  /** ms left while paused */
  remaining: number;
  done: boolean;
}

const KEY = 'homedash_timers';
const load = (): Timer[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

let timers: Timer[] = load();
const listeners = new Set<() => void>();
const emit = () => {
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* private mode */ }
  listeners.forEach(l => l());
};
const set = (next: Timer[]) => { timers = next; emit(); };

export const timerStore = {
  get: () => timers,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useTimers = () => useSyncExternalStore(timerStore.subscribe, timerStore.get);

export const timeLeft = (t: Timer, now = Date.now()) => (t.endsAt ? Math.max(0, t.endsAt - now) : t.remaining);

// --- Sound (Web Audio; unlocked by the tap that starts a timer) ---
let audio: AudioContext | null = null;
const unlockAudio = () => {
  try {
    audio = audio || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
};
export const chime = () => {
  if (!audio) return;
  const now = audio.currentTime;
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = [880, 1175, 1568][i];
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4);
    osc.connect(gain).connect(audio!.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.45);
  });
};

export const startTimer = (label: string, seconds: number) => {
  unlockAudio();
  const ms = Math.round(seconds * 1000);
  set([...timers, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label, duration: ms, endsAt: Date.now() + ms, remaining: ms, done: false }]);
};
export const pauseTimer = (id: string) =>
  set(timers.map(t => (t.id === id && t.endsAt ? { ...t, remaining: timeLeft(t), endsAt: null } : t)));
export const resumeTimer = (id: string) => {
  unlockAudio();
  set(timers.map(t => (t.id === id && !t.endsAt && !t.done ? { ...t, endsAt: Date.now() + t.remaining } : t)));
};
export const addTime = (id: string, seconds: number) =>
  set(timers.map(t => {
    if (t.id !== id) return t;
    const base = t.done ? 0 : timeLeft(t);
    const left = base + seconds * 1000;
    return { ...t, done: false, duration: t.duration + seconds * 1000, remaining: left, endsAt: t.done || t.endsAt ? Date.now() + left : null };
  }));
export const removeTimer = (id: string) => set(timers.filter(t => t.id !== id));
export const markDone = (id: string) => set(timers.map(t => (t.id === id ? { ...t, done: true, endsAt: null, remaining: 0 } : t)));

export const formatLeft = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/** Finds times in a recipe step ("simmer for 20 minutes", "bake 1-2 hours"). */
export const TIME_PATTERN = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
export const toSeconds = (amount: number, unit: string) => {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return amount * 3600;
  if (u.startsWith('m')) return amount * 60;
  return amount;
};
