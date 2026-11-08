// components/home/MusicView.tsx
import React from 'react';
import { useSettings } from '../../lib/settings';
import { Card } from './controls';
import { AlsoPlaying, ProfileGrid, useStreams } from './music';
import MusicBrowser from './MusicBrowser';
import MusicStage from './MusicStage';
import Jukebox from './Jukebox';

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
    <MusicStage>
      <Jukebox />
    </MusicStage>

    <AlsoPlayingCard />

    <MoodsCard />

    <MusicBrowser />
  </div>
);

/** Something else playing in another room (Lilly's story, say), with its own speaker buttons. */
const AlsoPlayingCard: React.FC = () => {
  const streams = useStreams();
  if (streams.length < 2) return null;
  return <Card><AlsoPlaying /></Card>;
};

export default MusicView;
