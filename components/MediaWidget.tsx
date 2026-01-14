// components/MediaWidget.tsx

import React, { useState, useRef } from 'react';

type AudioMode = 'spotify' | 'radio';

const STATIONS = [
  { 
    id: 'national', 
    name: 'RNZ National', 
    url: 'https://stream-ice.radionz.co.nz/national_aac64', // HTTPS stream
    color: 'bg-red-600'
  },
  { 
    id: 'concert', 
    name: 'RNZ Concert', 
    url: 'https://stream-ice.radionz.co.nz/concert_aac64', 
    color: 'bg-teal-600'
  }
];

const MediaWidget: React.FC = () => {
  const [mode, setMode] = useState<AudioMode>('spotify');
  const [playingStation, setPlayingStation] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Default Spotify Playlist (Coffee Shop Vibes or similar)
  // You can change the 'src' to any Spotify Embed URL
  const spotifyUrl = "https://open.spotify.com/embed/playlist/37i9dQZF1DwZHbFZcy5f27?utm_source=generator&theme=0";

  const toggleRadio = (url: string, id: string) => {
    if (!audioRef.current) return;

    if (playingStation === id) {
      // Pause
      audioRef.current.pause();
      setPlayingStation(null);
    } else {
      // Play new
      audioRef.current.src = url;
      audioRef.current.play();
      setPlayingStation(id);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full min-h-[350px]">
      
      {/* Hidden HTML5 Audio Player for Radio */}
      <audio ref={audioRef} className="hidden" />

      {/* Header / Toggle */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          {mode === 'spotify' ? (
            <svg className="w-6 h-6 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.118-.961-.539-.12-.42.12-.84.54-.96 4.68-1.079 8.64-.66 11.82 1.26.36.24.48.66.182 1.14zm1.479-3.36c-.3.48-.842.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.38-1.38 9.841-.66 13.441 1.56.48.24.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.24z"/></svg>
          ) : (
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          )}
          {mode === 'spotify' ? 'Spotify' : 'Live Radio'}
        </h3>

        <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
          <button 
            onClick={() => { setMode('spotify'); if(audioRef.current) audioRef.current.pause(); setPlayingStation(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'spotify' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Spotify
          </button>
          <button 
            onClick={() => setMode('radio')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'radio' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Radio
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-slate-50">
        
        {/* SPOTIFY IFRAME */}
        <div className={`absolute inset-0 transition-opacity duration-500 ${mode === 'spotify' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <iframe 
            src={spotifyUrl} 
            width="100%" 
            height="100%" 
            frameBorder="0" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
            className="rounded-b-[2rem]"
          />
        </div>

        {/* RADIO CONTROLS */}
        <div className={`absolute inset-0 p-6 flex flex-col gap-4 overflow-y-auto transition-opacity duration-500 ${mode === 'radio' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
           {STATIONS.map(station => {
             const isPlaying = playingStation === station.id;
             return (
               <button 
                 key={station.id}
                 onClick={() => toggleRadio(station.url, station.id)}
                 className={`group relative w-full p-4 rounded-2xl border-2 text-left transition-all ${isPlaying ? 'bg-white border-red-500 shadow-md' : 'bg-white border-slate-100 hover:border-slate-300'}`}
               >
                 <div className="flex items-center gap-4">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105 ${isPlaying ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}>
                     {isPlaying ? (
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     ) : (
                       <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     )}
                   </div>
                   <div>
                     <h4 className={`font-bold text-lg ${isPlaying ? 'text-red-600' : 'text-slate-700'}`}>{station.name}</h4>
                     <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{isPlaying ? 'Live • Streaming' : 'Click to Listen'}</p>
                   </div>
                   {isPlaying && (
                      <div className="ml-auto flex gap-1 items-end h-4">
                        <span className="w-1 bg-red-500 rounded-full animate-[bounce_1s_infinite] h-2"></span>
                        <span className="w-1 bg-red-500 rounded-full animate-[bounce_1.2s_infinite] h-4"></span>
                        <span className="w-1 bg-red-500 rounded-full animate-[bounce_0.8s_infinite] h-3"></span>
                      </div>
                   )}
                 </div>
               </button>
             );
           })}
           
           <div className="mt-auto pt-4 text-center">
             <p className="text-[10px] text-slate-400 uppercase tracking-widest">
               Powered by RNZ Digital
             </p>
           </div>
        </div>

      </div>
    </div>
  );
};

export default MediaWidget;
