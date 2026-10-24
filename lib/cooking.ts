// lib/cooking.ts
import { callService, runScript } from './hass';
import { settingsStore } from './settings';

/** "Start cooking": run the chosen music mood and bring the kitchen lights up (see Settings). */
export const startCooking = () => {
  const { cooking } = settingsStore.get();
  if (cooking.moodId) runScript(`script.${cooking.moodId}`);
  if (cooking.lights) {
    callService(
      'light',
      'turn_on',
      { brightness_pct: cooking.brightness, color_temp_kelvin: cooking.kelvin },
      { entity_id: cooking.lights }
    );
  }
};
