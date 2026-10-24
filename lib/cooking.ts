// lib/cooking.ts
import { HOME } from '../home.config';
import { callService, runScript } from './hass';

/** "Start cooking": play the Cooking music profile and bring the kitchen lights up to bright white. */
export const startCooking = () => {
  runScript(HOME.cooking.script);
  callService(
    'light',
    'turn_on',
    { brightness_pct: 100, color_temp_kelvin: HOME.cooking.colorTempKelvin },
    { entity_id: HOME.cooking.lights }
  );
};
