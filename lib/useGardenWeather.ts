// lib/useGardenWeather.ts
// The next few days for the garden (Open-Meteo, Waikanae): rain, frost, wind and heat.
import { useEffect, useState } from 'react';

export type GardenDay = { date: string; rain: number; min: number; max: number; gust: number };

export const useGardenWeather = () => {
  const [days, setDays] = useState<GardenDay[] | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=-40.87&longitude=175.06'
          + '&daily=precipitation_sum,temperature_2m_min,temperature_2m_max,wind_gusts_10m_max&forecast_days=4&timezone=Pacific/Auckland';
        const d = (await (await fetch(url)).json()).daily;
        setDays(d.time.map((date: string, i: number) => ({
          date,
          rain: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
          min: Math.round(d.temperature_2m_min[i]),
          max: Math.round(d.temperature_2m_max[i]),
          gust: Math.round(d.wind_gusts_10m_max[i] ?? 0),
        })));
      } catch {
        setDays([]);
      }
    };
    load();
    const t = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return days;
};
