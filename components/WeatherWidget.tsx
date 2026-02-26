import React, { useState, useEffect } from 'react';

interface ForecastDay {
  day: string;
  high: number;
  low: number;
  condition: string;
}

interface WeatherData {
  currentTemp: number;
  condition: string;
  high: number;
  low: number;
  forecast: ForecastDay[];
}

const WeatherWidget: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  // Map Open-Meteo codes to friendly text
  const getConditionText = (code: number) => {
    if (code === 0) return "Clear Sky";
    if (code <= 3) return "Partly Cloudy";
    if (code <= 48) return "Foggy";
    if (code <= 55) return "Drizzle";
    if (code <= 65) return "Rainy";
    if (code <= 82) return "Showers";
    return "Cloudy";
  };

  const fetchWeather = async () => {
    try {
      // Waikanae Coordinates: -40.87, 175.06
      const url = "https://api.open-meteo.com/v1/forecast?latitude=-40.87&longitude=175.06&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Pacific/Auckland";
      const res = await fetch(url);
      const data = await res.json();
      
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      
      setWeather({
        currentTemp: Math.round(data.current_weather.temperature),
        condition: getConditionText(data.current_weather.weathercode),
        high: Math.round(data.daily.temperature_2m_max[0]),
        low: Math.round(data.daily.temperature_2m_min[0]),
        forecast: [
          { 
            day: days[new Date(data.daily.time[1]).getDay()], 
            high: Math.round(data.daily.temperature_2m_max[1]), 
            low: Math.round(data.daily.temperature_2m_min[1]), 
            condition: getConditionText(data.daily.weathercode[1]) 
          },
          { 
            day: days[new Date(data.daily.time[2]).getDay()], 
            high: Math.round(data.daily.temperature_2m_max[2]), 
            low: Math.round(data.daily.temperature_2m_min[2]), 
            condition: getConditionText(data.daily.weathercode[2]) 
          }
        ]
      });
    } catch (err) {
      console.error("Weather fetch failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 30 * 60 * 1000); // Update every 30 mins
    
    return () => {
      clearInterval(timer);
      clearInterval(weatherTimer);
    };
  }, []);

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100 flex flex-col gap-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
        <div className="flex flex-col items-center md:items-start">
          <p className="text-indigo-100 font-medium mb-1">
            {time.toLocaleDateString('en-NZ', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-6xl font-black tracking-tighter mb-4">
            {time.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </h2>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl backdrop-blur-md">
            <svg className="w-5 h-5 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span className="text-sm font-semibold tracking-wide">Waikanae, NZ</span>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse flex gap-4 items-center">
            <div className="w-16 h-16 bg-white/20 rounded-full"></div>
            <div className="h-8 w-24 bg-white/20 rounded-lg"></div>
          </div>
        ) : (
          <div className="text-center md:text-right">
            <div className="flex items-center justify-center md:justify-end gap-3">
              <span className="text-6xl font-black tracking-tighter">{weather?.currentTemp}°</span>
              <div className="w-14 h-14 bg-yellow-400 rounded-2xl shadow-lg shadow-yellow-400/40 flex items-center justify-center">
                 <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" /></svg>
              </div>
            </div>
            <p className="text-lg font-bold text-indigo-100 mt-1">{weather?.condition}</p>
            <p className="text-sm text-indigo-200 font-medium">H: {weather?.high}° L: {weather?.low}°</p>
          </div>
        )}
      </div>

      {!loading && (
        <div className="grid grid-cols-2 gap-4 relative z-10 pt-6 border-t border-white/10">
          {weather?.forecast.map((f, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-3xl p-4 flex justify-between items-center border border-white/5">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-1">{f.day}</p>
                <p className="text-sm font-bold">{f.condition}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black">{f.high}°</p>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-tighter">Low {f.low}°</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl"></div>
    </div>
  );
};

export default WeatherWidget;
