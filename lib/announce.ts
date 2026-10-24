// lib/announce.ts
// Spoken announcements through Music Assistant (music pauses, the message plays, music resumes).

import { HOME } from '../home.config';
import { callService, hassStore } from './hass';
import { settingsStore } from './settings';

/** The first text-to-speech engine in Home Assistant (currently Google Translate). */
const ttsEntity = () => Object.keys(hassStore.get()?.states || {}).find(id => id.startsWith('tts.'));

/** Speakers that are always in the Kitchen & Family Room sync group. */
const GROUP_MEMBERS = ['media_player.kitchen', 'media_player.family_room', 'media_player.living_room_3'];

/** Every speaker, without announcing twice on one that's already joined to the group. */
export const allSpeakers = () => {
  const group = hassStore.get()?.states[HOME.music.group];
  const joined: string[] = group?.attributes.group_members || [];
  const extras = HOME.music.speakers.map(s => s.entity).filter(e => !GROUP_MEMBERS.includes(e) && !joined.includes(e));
  return [HOME.music.group, ...extras];
};

export const announce = (message: string, speakers: string | string[], volume?: number) =>
  callService(
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

/** "Dinner's ready": announce on every speaker and flash the chosen lights. */
export const callDinner = () => {
  const { dinner } = settingsStore.get();
  announce(dinner.message, allSpeakers(), dinner.volume);
  if (dinner.flashLights.length) {
    callService('light', 'turn_on', { flash: 'long' }, { entity_id: dinner.flashLights });
  }
};
