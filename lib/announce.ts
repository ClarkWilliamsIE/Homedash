// lib/announce.ts
// Spoken announcements through Music Assistant (music dips, the message plays, music carries on;
// if nothing was playing, nothing plays afterwards).

import { HOME } from '../home.config';
import { callService, hassStore } from './hass';
import { settingsStore } from './settings';

/** The first text-to-speech engine in Home Assistant (currently Google Translate). */
const ttsEntity = () => Object.keys(hassStore.get()?.states || {}).find(id => id.startsWith('tts.'));

/** Speakers that are always in the Kitchen & Family Room sync group. */
const GROUP_MEMBERS = ['media_player.kitchen', 'media_player.family_room', 'media_player.living_room_3'];

const PLAYERS = () => [HOME.music.group, ...HOME.music.speakers.map(s => s.entity)];
const playingNow = () => {
  const st = hassStore.get()?.states || {};
  return PLAYERS().filter(id => st[id]?.state === 'playing');
};

/** Every speaker, without announcing twice on one that's in the group. When the group is playing,
 *  announce through it (the music dips and carries on); otherwise talk to each speaker directly,
 *  because waking the group up makes Music Assistant start its music again. */
export const allSpeakers = () => {
  const st = hassStore.get()?.states || {};
  const group = st[HOME.music.group];
  const available = HOME.music.speakers.map(s => s.entity).filter(e => st[e] && st[e].state !== 'unavailable');
  if (group?.state !== 'playing') return available;
  const joined: string[] = group.attributes.group_members || [];
  return [HOME.music.group, ...available.filter(e => !GROUP_MEMBERS.includes(e) && !joined.includes(e))];
};

/** Speak a message. Anything that wasn't playing beforehand is paused again afterwards, so an
 *  announcement never leaves music playing that nobody asked for. */
export const announce = async (message: string, speakers: string | string[], volume?: number) => {
  const before = new Set(playingNow());
  await callService(
    'music_assistant',
    'play_announcement',
    {
      message,
      ...(ttsEntity() ? { tts_entity_id: ttsEntity() } : {}),
      use_pre_announce: true,
      ...(volume ? { announce_volume: Math.round(volume) } : {}),
    },
    { entity_id: speakers }
  );
  const tidyUp = () => {
    const started = playingNow().filter(id => !before.has(id));
    if (started.length) callService('media_player', 'media_pause', undefined, { entity_id: started });
  };
  // Wait until the message has surely finished (chime + roughly half a second a word),
  // then check twice, as Music Assistant can take a moment to "resume".
  const spoken = 4000 + message.split(/\s+/).length * 450;
  setTimeout(tidyUp, spoken + 1500);
  setTimeout(tidyUp, spoken + 8000);
};

/** "Dinner's ready": announce on every speaker and flash the chosen lights. */
export const callDinner = () => {
  const { dinner } = settingsStore.get();
  announce(dinner.message, allSpeakers(), dinner.volume);
  if (dinner.flashLights.length) {
    callService('light', 'turn_on', { flash: 'long' }, { entity_id: dinner.flashLights });
  }
};
