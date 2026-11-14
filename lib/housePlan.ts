// lib/housePlan.ts
// A plan of 83 Belvedere Avenue for the live floor plan. The outline is the house's real
// footprint from the 1987 drain plan in the LIM (page 31): the double garage pokes out towards
// the street, and the back of the house steps up towards the garden. Rooms inside it are placed
// from the video walk-through, so they're approximate. Units are metres; the street is at the
// bottom, the back garden at the top. Nudge a room by changing its x/y/w/h.

export type PlanRoom = {
  id: string;
  name: string;
  floor: 0 | 1;
  x: number; y: number; w: number; h: number;
  /** How the floor looks: indoors, tiled (kitchen, bathroom, laundry), garage concrete, deck, garden. */
  surface?: 'carpet' | 'tile' | 'concrete' | 'deck' | 'garden';
  light?: string;          // a light or light group for the room
  speaker?: string;        // a Music Assistant speaker (from home.config)
  speakerDirect?: string;  // the same speaker's own Sonos entity
  tv?: string;
  motion?: string;
  temperature?: string;
  humidity?: string;
  soil?: string;
  stairs?: boolean;
};

export const PLAN_W = 21.5;
export const PLAN_H = 20.5;

export const PLAN: PlanRoom[] = [
  // Ground floor. Back of the house (garden side) at the top.
  { id: 'deck', name: 'Deck', floor: 0, x: 11.5, y: 0.4, w: 9.5, h: 2.6, surface: 'deck' },
  { id: 'garden', name: 'Vege garden', floor: 0, x: 0, y: 3, w: 3.6, h: 7.5, surface: 'garden', soil: 'sensor.garden_soil_moisture', temperature: 'sensor.garden_temperature' },
  {
    id: 'lounge', name: 'Lounge', floor: 0, x: 15.8, y: 3, w: 5.2, h: 6.4,
    light: 'light.lounge_lights', speaker: 'media_player.living_room_3', tv: 'media_player.living_room_tv',
  },
  {
    id: 'family', name: 'Family room', floor: 0, x: 11.5, y: 4.2, w: 4.3, h: 6.3,
    light: 'light.family_room_lights', speaker: 'media_player.family_room', speakerDirect: 'media_player.family_room_family_room',
  },
  {
    id: 'kitchen', name: 'Kitchen', floor: 0, x: 7.5, y: 5.5, w: 4, h: 5, surface: 'tile',
    light: 'light.kitchen_lights', speaker: 'media_player.kitchen', speakerDirect: 'media_player.kitchen_kitchen',
    motion: 'binary_sensor.human_kitchen', temperature: 'sensor.human_kitchen_temperature', humidity: 'sensor.human_kitchen_humidity',
  },
  { id: 'playroom', name: 'Playroom', floor: 0, x: 4, y: 5.5, w: 3.5, h: 5, stairs: true },
  { id: 'kids', name: 'Kids room', floor: 0, x: 15.8, y: 9.4, w: 3.6, h: 4.2, light: 'light.kids_lights' },
  { id: 'hallway', name: 'Hallway', floor: 0, x: 4, y: 10.5, w: 11.8, h: 1.3, light: 'light.hallway_lights' },
  { id: 'spare', name: 'Spare room', floor: 0, x: 13.3, y: 11.8, w: 2.5, h: 2.1 },
  { id: 'bathroom', name: 'Bathroom', floor: 0, x: 10.6, y: 11.8, w: 2.7, h: 2.1, surface: 'tile' },
  { id: 'toilet', name: 'Toilet', floor: 0, x: 9.3, y: 11.8, w: 1.3, h: 2.1, surface: 'tile' },
  { id: 'laundry', name: 'Laundry', floor: 0, x: 6.9, y: 11.8, w: 2.4, h: 2.1, surface: 'tile' },
  { id: 'entry', name: 'Entry', floor: 0, x: 4, y: 11.8, w: 2.9, h: 2.1 },
  { id: 'garage', name: 'Garage', floor: 0, x: 0, y: 13.9, w: 6.9, h: 6.3, surface: 'concrete' },

  // Upstairs: the raised middle section, over the kitchen and family room.
  { id: 'balcony', name: 'Balcony', floor: 1, x: 7.5, y: 2, w: 8.3, h: 2.6, surface: 'deck' },
  { id: 'landing', name: 'Stairs', floor: 1, x: 4.5, y: 5.5, w: 3, h: 4, stairs: true },
  { id: 'master', name: 'Bedroom', floor: 1, x: 7.5, y: 4.6, w: 5.8, h: 5.9, speaker: 'media_player.bedroom', speakerDirect: 'media_player.bedroom_bedroom' },
  { id: 'ensuite', name: 'Ensuite', floor: 1, x: 13.3, y: 5.6, w: 2.5, h: 3.4, surface: 'tile' },
];
