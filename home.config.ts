// home.config.ts
// The Home Assistant entities Homedash controls. Change these if you rename things in Home Assistant.

export interface Room {
  id: string;
  name: string;
  /** A light group (or single light) for the whole room. Its members show on the Lights screen. */
  entity: string;
}

export const HOME = {
  rooms: [
    { id: 'kitchen', name: 'Kitchen', entity: 'light.kitchen_lights' },
    { id: 'family', name: 'Family room', entity: 'light.family_room_lights' },
    { id: 'lounge', name: 'Lounge', entity: 'light.lounge_lights' },
    { id: 'hallway', name: 'Hallway', entity: 'light.hallway_lights' },
    { id: 'kids', name: 'Kids room', entity: 'light.kids_lights' },
  ] as Room[],

  partyMode: 'input_boolean.party_mode',

  music: {
    /** The Music Assistant sync group shown as "Now playing". */
    group: 'media_player.kitchen_family_room',
    speakers: [
      // `direct` is the speaker's own Sonos entity, so things started from the Sonos app
      // (RNZ, say) show up too, not just what Music Assistant is playing.
      { entity: 'media_player.kitchen', name: 'Kitchen', direct: 'media_player.kitchen_kitchen' },
      { entity: 'media_player.family_room', name: 'Family room', direct: 'media_player.family_room_family_room' },
      { entity: 'media_player.living_room_3', name: 'Stereo' },
      { entity: 'media_player.bedroom', name: 'Bedroom', direct: 'media_player.bedroom_bedroom' },
    ],
    profiles: [
      { script: 'script.profile_cooking', name: 'Cooking', hint: 'Kitchen loud', tone: 'orange' },
      { script: 'script.profile_dinner', name: 'Dinner', hint: 'Soft, everywhere', tone: 'amber' },
      { script: 'script.profile_whole_house', name: 'Whole house', hint: 'Every speaker', tone: 'violet' },
      { script: 'script.profile_wind_down', name: 'Wind down', hint: 'Bedroom only', tone: 'indigo' },
    ],
    sources: [
      { script: 'script.play_rnz_in_kitchen', name: 'RNZ National' },
      { script: 'script.play_good_playlist', name: '"Good" playlist' },
      { script: 'script.play_but_why_podcast', name: 'But Why podcast' },
    ],
  },

  /** What "Start cooking" does: run this music profile and bring these lights up to bright white. */
  cooking: {
    script: 'script.profile_cooking',
    lights: 'light.kitchen_lights',
    colorTempKelvin: 4000,
  },
};
