// components/home/MusicView.tsx
import React, { useState } from 'react';
import { HOME } from '../../home.config';
import { friendlyError, playSource, Source } from '../../lib/musicLibrary';
import { useSettings } from '../../lib/settings';
import { Card } from './controls';
import { HomeIcons } from './icons';
import { AlsoPlaying, NowPlaying, ProfileGrid, SpeakerMixer } from './music';
import MusicBrowser from './MusicBrowser';

const SOURCES = HOME.music.sources as unknown as Source[];
const SPEAKERS = HOME.music.speakers;
const LAST_KEY = 'homedash_source_speakers';

const lastSpeakers = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* ignore */ }
  return [SPEAKERS[0].entity];
};

/** Radio, playlist or podcast: tap it, pick the speakers, play. */
const PlaySomething: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(lastSpeakers);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const go = async (src: Source) => {
    // Play in speaker order, so the lead speaker is predictable.
    const speakers = SPEAKERS.map(s => s.entity).filter(id => picked.includes(id));
    setBusy(true); setMsg(null);
    try {
      await playSource(src, speakers);
      try { localStorage.setItem(LAST_KEY, JSON.stringify(speakers)); } catch { /* ignore */ }
      setMsg({ text: `Playing ${src.name}` });
      setOpen(null);
    } catch (e) {
      setMsg({ text: friendlyError(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {SOURCES.map(s => {
        const isOpen = open === s.name;
        return (
          <div key={s.name} className={`rounded-2xl transition-colors ${isOpen ? 'bg-indigo-50' : 'bg-slate-50'}`}>
            <button onClick={() => { setOpen(isOpen ? null : s.name); setMsg(null); }} aria-expanded={isOpen}
              className="w-full flex items-center gap-3 p-3 text-left">
              <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center"><HomeIcons.Radio className="w-5 h-5" /></span>
              <span className="flex-1 font-bold text-slate-800">{s.name}</span>
              <HomeIcons.Chevron className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3 pb-3">
                <p className="text-sm font-semibold text-slate-500 mb-2">Play it on</p>
                <div className="flex flex-wrap gap-2">
                  {SPEAKERS.map(sp => {
                    const on = picked.includes(sp.entity);
                    return (
                      <button key={sp.entity} aria-pressed={on} onClick={() => toggle(sp.entity)}
                        className={`h-10 px-4 rounded-full text-sm font-semibold border ${on ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                        {sp.name}
                      </button>
                    );
                  })}
                </div>
                <button disabled={busy || !picked.length} onClick={() => go(s)}
                  className="mt-3 w-full h-11 rounded-xl bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                  {busy ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <HomeIcons.Play className="w-4 h-4" />}
                  {busy ? 'Starting…' : `Play ${s.name}`}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {msg && <p className={`text-sm font-semibold ${msg.error ? 'text-rose-700' : 'text-emerald-700'}`}>{msg.text}</p>}
    </div>
  );
};

const MoodsCard: React.FC = () => {
  const { showMoods } = useSettings();
  if (!showMoods) return null;
  return (
    <Card title="Moods">
      <ProfileGrid large />
    </Card>
  );
};

const MusicView: React.FC = () => (
  <div className="space-y-6 max-w-6xl">
    <Card className="!p-8">
      <NowPlaying large />
      <div className="mt-6 empty:hidden"><AlsoPlaying /></div>
    </Card>

    <MoodsCard />

    <MusicBrowser />

    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
      <Card title="Speakers">
        <SpeakerMixer />
      </Card>
      <Card title="Play something">
        <PlaySomething />
      </Card>
    </div>
  </div>
);

export default MusicView;
