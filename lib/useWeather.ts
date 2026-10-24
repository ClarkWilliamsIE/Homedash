// lib/useWeather.ts
// Same Open-Meteo source as WeatherWidget (Waikanae), as a hook for the compact home card.
import { useEffect, useState } from 'react';

export interface Weather {
  temp: number;
  condition: string;
  code: number;
  high: number;
  low: number;
  tomorrow: { high: number; low: number; condition: string };
}

export const conditionText = (code: number) => {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 82) return 'Showers';
  return 'Cloudy';
};

export const useWeather = () => {
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-40.87&longitude=175.06&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Pacific/Auckland';
        const data = await (await fetch(url)).json();
        setWeather({
          temp: Math.round(data.current_weather.temperature),
          code: data.current_weather.weathercode,
          condition: conditionText(data.current_weather.weathercode),
          high: Math.round(data.daily.temperature_2m_max[0]),
          low: Math.round(data.daily.temperature_2m_min[0]),
          tomorrow: {
            high: Math.round(data.daily.temperature_2m_max[1]),
            low: Math.round(data.daily.temperature_2m_min[1]),
            condition: conditionText(data.daily.weathercode[1]),
          },
        });
      } catch (err) { console.error('Weather fetch failed', err); }
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return weather;
};

export const useClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15 * 1000);
    return () => clearInterval(t);
  }, []);
  return now;
};
