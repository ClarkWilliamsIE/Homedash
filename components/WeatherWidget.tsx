
import React, { useState, useEffect } from 'react';

const WeatherWidget: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Use geolocation for dynamic (placeholder) weather
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 flex flex-col sm:flex-row justify-between items-center gap-8 relative overflow-hidden">
      <div className="relative z-10 flex flex-col items-center sm:items-start">
        <p className="text-indigo-100 font-medium mb-1">
          {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h2 className="text-5xl font-black tracking-tighter mb-4">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </h2>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl backdrop-blur-md">
          <svg className="w-5 h-5 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span className="text-sm font-semibold">Home Office</span>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-6">
        <div className="text-center sm:text-right">
          <div className="flex items-center justify-center sm:justify-end gap-2">
            <span className="text-5xl font-black tracking-tighter">72°</span>
            <div className="w-12 h-12 bg-yellow-400 rounded-full shadow-lg shadow-yellow-400/50 flex items-center justify-center">
               <svg className="w-8 h-8 text-white animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
            </div>
          </div>
          <p className="text-indigo-100 font-medium">Mostly Sunny</p>
          <p className="text-xs text-indigo-200 mt-1">H: 78° L: 62°</p>
        </div>
      </div>

      {/* Abstract Shapes */}
      <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl"></div>
    </div>
  );
};

export default WeatherWidget;
