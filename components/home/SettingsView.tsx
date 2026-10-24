// components/home/SettingsView.tsx
// Settings: music moods, which lights show on the home screen, and what "Start cooking" does.
// Everything here saves to the family Google Sheet; moods are also written to Home Assistant.

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HOME, Room } from '../../home.config';
import { hassStore, runScript } from '../../lib/hass';
import { startCooking } from '../../lib/cooking';
import {
  HomeSettings, Mood, MoodMusic, MusicChoice, Tone, TONE_STYLES,
  deleteMoodScript, isHassAdmin, loadMusicChoices, newMoodId, saveMoodScript,
} from '../../lib/settings';
import { Card, FillSlider, Switch } from './controls';
import { callDinner } from '../../lib/announce';
import { CalendarInfo } from '../../lib/calendar';
import { setFullscreen, useFullscreen } from '../../lib/kiosk';
import { HomeIcons } from './icons';

export interface CalendarStatus {
  status: 'loading' | 'ok' | 'no-access' | 'error';
  calendars: CalendarInfo[];
}

interface SettingsViewProps {
  settings: HomeSettings;
  onChange: (s: HomeSettings) => void;
  calendar: CalendarStatus;
}

const TONES: Tone[] = ['orange', 'amber', 'rose', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'slate'];
const speakerName = (entity: string) => HOME.music.speakers.find(s => s.entity === entity)?.name || entity;
const move = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** All lights in Home Assistant, light groups first. */
const useLightOptions = () => {
  const key = useSyncExternalStore(hassStore.subscribe, () =>
    Object.keys(hassStore.get()?.states || {}).filter(id => id.startsWith('light.')).sort().join(',')
  );
  return useMemo(() => {
    const states = hassStore.get()?.states || {};
    return key.split(',').filter(Boolean).map(id => ({
      id,
      name: states[id]?.attributes.friendly_name || id,
      isGroup: Array.isArray(states[id]?.attributes.entity_id),
    })).sort((a, b) => Number(b.isGroup) - Number(a.isGroup) || a.name.localeCompare(b.name));
  }, [key]);
};

const moodSummary = (m: Mood) => {
  const speakers = HOME.music.speakers.map(s => {
    const v = m.volumes[s.entity];
    return v === null || v === undefined ? null : `${s.name} ${Math.round(v)}%`;
  }).filter(Boolean).join(' · ') || 'No speakers';
  const music = m.music.mode === 'none' || !m.music.mediaId ? 'volumes only' : `${m.music.label || 'music'}${m.music.shuffle ? ', shuffled' : ''}${m.music.mode === 'always' ? ' (always)' : ''}`;
  return `${speakers} · ${music}`;
};

const inputClass = 'w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 outline-none border border-transparent focus:border-indigo-200 focus:bg-white';
const smallBtn = 'w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25';

// ---------------------------------------------------------------------------
// Mood editor (full-screen sheet)
// ---------------------------------------------------------------------------

const MoodEditor: React.FC<{
  mood: Mood;
  isNew: boolean;
  canDelete: boolean;
  onSave: (m: Mood) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}> = ({ mood, isNew, canDelete, onSave, onDelete, onClose }) => {
  const [draft, setDraft] = useState<Mood>(mood);
  const [choices, setChoices] = useState<MusicChoice[] | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const admin = isHassAdmin();

  useEffect(() => { loadMusicChoices().then(setChoices).catch(() => setChoices([])); }, []);

  const setVolume = (entity: string, v: number | null) => setDraft(d => ({ ...d, volumes: { ...d.volumes, [entity]: v } }));
  const setMusic = (patch: Partial<MoodMusic>) => setDraft(d => ({ ...d, music: { ...d.music, ...patch } }));
  const anyOn = Object.values(draft.volumes).some(v => v !== null && v !== undefined);

  const save = async () => {
    if (!draft.name.trim()) { setError('Give the mood a name.'); return; }
    if (!anyOn) { setError('Turn on at least one speaker.'); return; }
    setBusy('save'); setError('');
    try { await onSave({ ...draft, name: draft.name.trim(), hint: draft.hint.trim() }); }
    catch (e: any) { setError(e?.message || 'Could not save to Home Assistant.'); setBusy(null); }
  };

  const remove = async () => {
    if (!confirm(`Delete the "${mood.name}" mood?`)) return;
    setBusy('delete'); setError('');
    try { await onDelete(); }
    catch (e: any) { setError(e?.message || 'Could not delete from Home Assistant.'); setBusy(null); }
  };

  const grouped = useMemo(() => {
    const g: Record<string, MusicChoice[]> = {};
    (choices || []).forEach(c => { (g[c.group] = g[c.group] || []).push(c); });
    return g;
  }, [choices]);
  const currentInList = (choices || []).some(c => c.mediaId === draft.music.mediaId);

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl my-6 overflow-hidden">
        <div className={`bg-gradient-to-br ${TONE_STYLES[draft.tone]} px-8 pt-7 pb-6 text-white`}>
          <div className="flex justify-between items-start">
            <p className="text-sm font-medium text-white/80">{isNew ? 'New music mood' : 'Edit music mood'}</p>
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">✕</button>
          </div>
          <input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="Mood name"
            className="mt-2 w-full bg-transparent font-display text-4xl placeholder-white/50 outline-none"
          />
          <input
            value={draft.hint}
            onChange={e => setDraft({ ...draft, hint: e.target.value })}
            placeholder="Short description, e.g. Kitchen loud"
            className="mt-1 w-full bg-transparent text-lg font-semibold text-white/90 placeholder-white/50 outline-none"
          />
          <div className="flex gap-2 mt-4">
            {TONES.map(t => (
              <button key={t} aria-label={`Colour ${t}`} onClick={() => setDraft({ ...draft, tone: t })}
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${TONE_STYLES[t]} border-2 ${draft.tone === t ? 'border-white scale-110' : 'border-white/40'} transition-transform`} />
            ))}
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-3">Speakers & volume</h4>
            <div className="space-y-2">
              {HOME.music.speakers.map(s => {
                const v = draft.volumes[s.entity];
                const on = v !== null && v !== undefined;
                return (
                  <div key={s.entity} className={`flex items-center gap-4 p-3 rounded-2xl ${on ? 'bg-indigo-50/60' : 'bg-slate-50'}`}>
                    <Switch tone="indigo" on={on} onToggle={() => setVolume(s.entity, on ? null : 30)} label={`${s.name} on or off`} />
                    <span className="w-28 shrink-0 font-bold text-slate-800">{s.name}</span>
                    {on
                      ? <FillSlider className="h-10 flex-1" tone="indigo" value={v!} onCommit={val => setVolume(s.entity, val)} label="Volume" />
                      : <span className="flex-1 text-sm font-semibold text-slate-400">Off: {s.entity === 'media_player.bedroom' ? 'not playing' : 'left out of the group'}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-600 mb-3">Music</h4>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                ['if_idle', "Start if nothing's playing"],
                ['always', 'Always switch to it'],
                ['none', 'Just set volumes'],
              ] as [MoodMusic['mode'], string][]).map(([mode, label]) => (
                <button key={mode} onClick={() => setMusic({ mode })}
                  className={`py-3 px-3 rounded-2xl text-sm font-bold transition-colors ${draft.music.mode === mode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            {draft.music.mode !== 'none' && (
              <select
                value={draft.music.mediaId || ''}
                onChange={e => {
                  const c = (choices || []).find(x => x.mediaId === e.target.value);
                  if (c) setMusic({ mediaId: c.mediaId, mediaType: c.mediaType, label: c.label });
                }}
                className={inputClass}
              >
                {!draft.music.mediaId && <option value="">Choose a playlist or station…</option>}
                {draft.music.mediaId && !currentInList && <option value={draft.music.mediaId}>{draft.music.label || draft.music.mediaId}</option>}
                {choices === null && <option disabled>Loading your Music Assistant library…</option>}
                {Object.entries(grouped).map(([group, list]) => (
                  <optgroup key={group} label={group}>
                    {list.map(c => <option key={c.mediaId} value={c.mediaId}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            {draft.music.mode !== 'none' && (
              <div onClick={() => setMusic({ shuffle: !draft.music.shuffle })} className="mt-3 flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100 cursor-pointer">
                <span>
                  <span className="block font-semibold text-slate-800">Shuffle</span>
                  <span className="block text-sm text-slate-500">Play the songs in a random order each time</span>
                </span>
                <Switch on={!!draft.music.shuffle} tone="indigo" label="Shuffle" onToggle={() => setMusic({ shuffle: !draft.music.shuffle })} />
              </div>
            )}
          </div>

          {!admin && (
            <p className="text-sm font-semibold text-amber-700 bg-amber-50 rounded-2xl p-4">
              Saving a mood updates its Home Assistant script, which needs a Home Assistant admin login. Sign in as an admin on this device to save moods.
            </p>
          )}
          {error && <p className="text-sm font-bold text-red-600 bg-red-50 rounded-2xl p-4">{error}</p>}

          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            {!isNew && canDelete && (
              <button onClick={remove} disabled={!!busy || !admin} className="flex items-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-red-500 hover:bg-red-50 disabled:opacity-40">
                <HomeIcons.Trash className="w-4 h-4" /> {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button onClick={onClose} className="ml-auto px-5 py-3.5 rounded-2xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={!!busy || !admin} className="px-7 py-3.5 rounded-2xl font-bold bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 disabled:opacity-40">
              {busy === 'save' ? 'Saving…' : 'Save mood'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onChange, calendar }) => {
  const fullscreen = useFullscreen();
  const [editing, setEditing] = useState<{ mood: Mood; isNew: boolean } | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const lights = useLightOptions();
  const admin = isHassAdmin();

  const update = (patch: Partial<HomeSettings>) => onChange({ ...settings, ...patch });
  const flash = (id: string) => { setTested(id); setTimeout(() => setTested(t => (t === id ? null : t)), 2500); };

  // --- Moods ---
  const newMood = (): Mood => ({
    id: '',
    name: '',
    hint: '',
    tone: 'teal',
    volumes: Object.fromEntries(HOME.music.speakers.map(s => [s.entity, s.entity === 'media_player.bedroom' ? null : 30])),
    music: { ...settings.moods[0]?.music, mode: 'if_idle' },
  });

  const saveMood = async (m: Mood) => {
    const isNew = !m.id;
    const mood = isNew ? { ...m, id: newMoodId(m.name) } : m;
    await saveMoodScript(mood);
    update({ moods: isNew ? [...settings.moods, mood] : settings.moods.map(x => (x.id === mood.id ? mood : x)) });
    setEditing(null);
  };

  const deleteMood = async (id: string) => {
    await deleteMoodScript(id);
    update({
      moods: settings.moods.filter(m => m.id !== id),
      cooking: settings.cooking.moodId === id ? { ...settings.cooking, moodId: null } : settings.cooking,
    });
    setEditing(null);
  };

  // --- Rooms ---
  const setRoom = (i: number, patch: Partial<Room>) => update({ rooms: settings.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRoom = () => {
    const used = new Set(settings.rooms.map(r => r.entity));
    const next = lights.find(l => !used.has(l.id));
    if (!next) return;
    update({ rooms: [...settings.rooms, { id: `room_${Date.now().toString(36)}`, name: next.name.replace(/ lights?$/i, ''), entity: next.id }] });
  };

  const kelvinLabel = (k: number) => (k <= 3000 ? 'Warm' : k <= 4500 ? 'Neutral' : 'Daylight');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-[2rem] md:text-4xl text-slate-900">Settings</h1>
        <p className="text-slate-500 font-medium mt-1">Changes save automatically and show up on every device.</p>
      </div>

      {/* MUSIC MOODS */}
      <Card
        title="Music moods"
        action={
          <button onClick={() => setEditing({ mood: newMood(), isNew: true })} disabled={!admin}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            <HomeIcons.Plus className="w-4 h-4" /> New mood
          </button>
        }
      >
        {!admin && (
          <p className="text-sm font-semibold text-amber-700 bg-amber-50 rounded-2xl p-3 mb-3">
            You're signed in to Home Assistant without admin rights, so moods can be played and reordered but not edited here.
          </p>
        )}
        <div className="space-y-2">
          {settings.moods.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
              <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${TONE_STYLES[m.tone] || TONE_STYLES.indigo} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{m.name} <span className="font-semibold text-slate-400">· {m.hint}</span></p>
                <p className="text-xs font-semibold text-slate-500 truncate">{moodSummary(m)}</p>
              </div>
              <button className={smallBtn} aria-label="Move up" disabled={i === 0} onClick={() => update({ moods: move(settings.moods, i, i - 1) })}><HomeIcons.Up className="w-5 h-5" /></button>
              <button className={smallBtn} aria-label="Move down" disabled={i === settings.moods.length - 1} onClick={() => update({ moods: move(settings.moods, i, i + 1) })}><HomeIcons.Down className="w-5 h-5" /></button>
              <button onClick={() => { runScript(`script.${m.id}`); flash(m.id); }}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${tested === m.id ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                {tested === m.id ? 'Playing' : 'Try it'}
              </button>
              <button onClick={() => setEditing({ mood: m, isNew: false })} disabled={!admin}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white disabled:opacity-30">
                <HomeIcons.Edit className="w-4 h-4" /> Edit
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* START COOKING */}
      <Card
        title="Start cooking button"
        action={
          <button onClick={() => { startCooking(); flash('cooking'); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tested === 'cooking' ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {tested === 'cooking' ? 'Done' : 'Try it'}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-600 mb-2">Music</span>
            <select className={inputClass} value={settings.cooking.moodId || ''} onChange={e => update({ cooking: { ...settings.cooking, moodId: e.target.value || null } })}>
              <option value="">No music</option>
              {settings.moods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-600 mb-2">Lights</span>
            <select className={inputClass} value={settings.cooking.lights} onChange={e => update({ cooking: { ...settings.cooking, lights: e.target.value } })}>
              <option value="">Leave the lights alone</option>
              {lights.map(l => <option key={l.id} value={l.id}>{l.name}{l.isGroup ? ' (group)' : ''}</option>)}
            </select>
          </label>
          {settings.cooking.lights && (
            <>
              <div>
                <span className="block text-sm font-semibold text-slate-600 mb-2">Brightness</span>
                <FillSlider className="h-11" value={settings.cooking.brightness} onCommit={v => update({ cooking: { ...settings.cooking, brightness: v } })} label="Brightness" />
              </div>
              <div>
                <span className="block text-sm font-semibold text-slate-600 mb-2">Colour: {kelvinLabel(settings.cooking.kelvin)} ({settings.cooking.kelvin}K)</span>
                <div className="grid grid-cols-3 gap-2">
                  {[['Warm', 2700], ['Neutral', 4000], ['Daylight', 5500]].map(([label, k]) => (
                    <button key={label} onClick={() => update({ cooking: { ...settings.cooking, kelvin: k as number } })}
                      className={`py-3 rounded-xl text-sm font-bold ${settings.cooking.kelvin === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* DINNER'S READY */}
      <Card
        title="Dinner's ready button"
        action={
          <button onClick={() => { callDinner(); flash('dinner'); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tested === 'dinner' ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {tested === 'dinner' ? 'Announced' : 'Try it'}
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="block md:col-span-2">
            <span className="block text-sm font-semibold text-slate-600 mb-2">What it says (on every speaker)</span>
            <input className={inputClass} value={settings.dinner.message} onChange={e => update({ dinner: { ...settings.dinner, message: e.target.value } })} />
          </label>
          <div>
            <span className="block text-sm font-semibold text-slate-600 mb-2">Announcement volume</span>
            <FillSlider className="h-11" tone="indigo" value={settings.dinner.volume} onCommit={v => update({ dinner: { ...settings.dinner, volume: v } })} label="Volume" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-slate-600 mb-2">Flash these lights</span>
            <div className="flex flex-wrap gap-2">
              {settings.rooms.map(r => {
                const onList = settings.dinner.flashLights.includes(r.entity);
                return (
                  <button key={r.id}
                    onClick={() => update({ dinner: { ...settings.dinner, flashLights: onList ? settings.dinner.flashLights.filter(x => x !== r.entity) : [...settings.dinner.flashLights, r.entity] } })}
                    className={`px-3.5 py-2.5 rounded-xl text-sm font-bold ${onList ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* TIMERS */}
      <Card title="Timers">
        <label className="block max-w-md">
          <span className="block text-sm font-semibold text-slate-600 mb-2">When a timer finishes, also announce it on</span>
          <select className={inputClass} value={settings.timers.speaker} onChange={e => update({ timers: { speaker: e.target.value } })}>
            <option value="">No speaker (chime on the screen only)</option>
            {HOME.music.speakers.map(s => <option key={s.entity} value={s.entity}>{s.name}</option>)}
            <option value={HOME.music.group}>Kitchen & family room together</option>
          </select>
        </label>
        <p className="text-xs font-semibold text-slate-400 mt-3">Tap any time in a recipe's method (like "simmer 20 minutes") to start a timer, or use the Timer button in the corner.</p>
      </Card>

      {/* CALENDAR */}
      <Card title="Family calendar">
        {calendar.status === 'loading' && <p className="text-sm font-semibold text-slate-400">Loading your calendars…</p>}
        {calendar.status === 'no-access' && (
          <p className="text-sm font-semibold text-amber-700 bg-amber-50 rounded-2xl p-4">
            Homedash's Google login doesn't have calendar access yet. The Google account behind the Sheet needs to be reconnected with calendar permission. Ask Claude to help with this.
          </p>
        )}
        {calendar.status === 'error' && <p className="text-sm font-semibold text-red-600">Couldn't load your calendars just now. It'll try again shortly.</p>}
        {calendar.status === 'ok' && (
          <>
            <p className="text-sm font-semibold text-slate-500 mb-3">Show events from:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {calendar.calendars.map(c => {
                const chosen = settings.calendars ?? calendar.calendars.filter(x => x.selected || x.primary).map(x => x.id);
                const on = chosen.includes(c.id);
                return (
                  <button key={c.id}
                    onClick={() => update({ calendars: on ? chosen.filter(x => x !== c.id) : [...chosen, c.id] })}
                    className={`flex items-center gap-3 p-3 rounded-2xl text-left ${on ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                    <span className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ background: on ? c.color : '#e2e8f0' }}>{on ? '✓' : ''}</span>
                    <span className="font-bold text-slate-800 truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* NIGHT MODE */}
      <Card
        title="Night mode"
        action={<Switch tone="indigo" on={settings.night.enabled} onToggle={() => update({ night: { ...settings.night, enabled: !settings.night.enabled } })} label="Night mode on or off" />}
      >
        <p className="text-sm font-semibold text-slate-500 mb-4">At night, after a few minutes without a touch, the kitchen screen switches to a dark clock. Touch it to wake.</p>
        <div className={`grid grid-cols-3 gap-4 ${settings.night.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-600 mb-2">From</span>
            <input type="time" className={inputClass} value={settings.night.start} onChange={e => update({ night: { ...settings.night, start: e.target.value } })} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-600 mb-2">Until</span>
            <input type="time" className={inputClass} value={settings.night.end} onChange={e => update({ night: { ...settings.night, end: e.target.value } })} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-600 mb-2">After</span>
            <select className={inputClass} value={settings.night.idleMinutes} onChange={e => update({ night: { ...settings.night, idleMinutes: Number(e.target.value) } })}>
              {[1, 2, 5, 10, 15].map(m => <option key={m} value={m}>{m} minute{m > 1 ? 's' : ''} idle</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* THIS DEVICE */}
      <Card title="This device">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="font-bold text-slate-800">Full screen</p>
            <p className="text-sm font-semibold text-slate-500">Hide Home Assistant's top bar and side menu on this screen only. Turn it off here to get them back.</p>
          </div>
          <Switch tone="indigo" on={fullscreen} onToggle={() => setFullscreen(!fullscreen)} label="Full screen on or off" />
        </div>
      </Card>

      {/* ROOMS */}
      <Card
        title="Lights on the home screen"
        action={
          <button onClick={addRoom} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">
            <HomeIcons.Plus className="w-4 h-4" /> Add
          </button>
        }
      >
        <div className="space-y-2">
          {settings.rooms.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50">
              <input value={r.name} onChange={e => setRoom(i, { name: e.target.value })} className={`${inputClass} !bg-white flex-1`} aria-label="Room name" />
              <select value={r.entity} onChange={e => setRoom(i, { entity: e.target.value })} className={`${inputClass} !bg-white flex-1`} aria-label="Light">
                {!lights.some(l => l.id === r.entity) && <option value={r.entity}>{r.entity}</option>}
                {lights.map(l => <option key={l.id} value={l.id}>{l.name}{l.isGroup ? ' (group)' : ''}</option>)}
              </select>
              <button className={smallBtn} aria-label="Move up" disabled={i === 0} onClick={() => update({ rooms: move(settings.rooms, i, i - 1) })}><HomeIcons.Up className="w-5 h-5" /></button>
              <button className={smallBtn} aria-label="Move down" disabled={i === settings.rooms.length - 1} onClick={() => update({ rooms: move(settings.rooms, i, i + 1) })}><HomeIcons.Down className="w-5 h-5" /></button>
              <button className={`${smallBtn} hover:!text-red-500`} aria-label="Remove" disabled={settings.rooms.length <= 1} onClick={() => update({ rooms: settings.rooms.filter((_, j) => j !== i) })}><HomeIcons.Trash className="w-5 h-5" /></button>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold text-slate-400 mt-3">Pick a light group to control a whole room at once. Light groups are made in Home Assistant under Settings → Devices & services → Helpers.</p>
      </Card>

      {editing && (
        <MoodEditor
          key={editing.mood.id || 'new'}
          mood={editing.mood}
          isNew={editing.isNew}
          canDelete={settings.moods.length > 1}
          onSave={saveMood}
          onDelete={() => deleteMood(editing.mood.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default SettingsView;
