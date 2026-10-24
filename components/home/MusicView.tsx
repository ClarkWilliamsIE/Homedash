// components/home/MusicView.tsx
import React from 'react';
import { HOME } from '../../home.config';
import { runScript } from '../../lib/hass';
import { Card } from './controls';
import { HomeIcons } from './icons';
import { NowPlaying, ProfileGrid, SpeakerMixer } from './music';
import MusicBrowser from './MusicBrowser';

const MusicView: React.FC = () => (
  <div className="space-y-6 max-w-6xl">
    <Card className="!p-8">
      <NowPlaying large />
    </Card>

    <Card title="Moods">
      <ProfileGrid large />
    </Card>

    <MusicBrowser />

    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
      <Card title="Speakers">
        <SpeakerMixer />
      </Card>
      <Card title="Play something">
        <div className="space-y-2.5">
          {HOME.music.sources.map(s => (
            <button key={s.script} onClick={() => runScript(s.script)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50 text-left transition-colors">
              <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center"><HomeIcons.Radio className="w-5 h-5" /></span>
              <span className="flex-1 font-bold text-slate-800">{s.name}</span>
              <HomeIcons.Play className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

export default MusicView;
