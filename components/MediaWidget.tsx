// components/MediaWidget.tsx

import React, { useState, useRef, useEffect } from 'react';

type AudioMode = 'spotify' | 'radio' | 'apple';

interface RadioStation {
  id: string;
  name: string;
  url: string;
  color: string;
  darkColor?: string;
}

// Stream URLs for NZ Stations
const STATIONS: RadioStation[] = [
  { 
    id: 'national', 
    name: 'RNZ National', 
    url: 'https://stream-ice.radionz.co.nz/national_aac64', 
    color: 'bg-red-100 border-red-200',
    darkColor: 'text-red-700'
  },
  { 
    id: 'concert', 
    name: 'RNZ Concert', 
    url: 'https://stream-ice.radionz.co.nz/concert_aac64', 
    color: 'bg-teal-100 border-teal-200',
    darkColor: 'text-teal-700'
  },
  { 
    id: 'channelx', 
    name: 'Channel X', 
    // Best guess standard MediaWorks stream. 
    // If this fails, inspect network on rova.nz to find the exact .aac/.m3u8 link
    url: 'https://ais-nz.streamguys1.com/nz_channelx_aac', 
    color: 'bg-green-100 border-green-200',
    darkColor: 'text-green-700'
  }
];

const MediaWidget: React.FC = () => {
  const [mode, setMode] = useState<AudioMode>('spotify');
  const [playingStation, setPlayingStation] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Default Spotify Playlist (Coffee Shop Vibes)
  const spotifyUrl = "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M";
  
  // Apple Music 1 Live Radio Embed
  const appleRadioUrl = "https://embed.music.apple.com/nz/station/apple-music-1/ra.978194965?theme=auto";

  // Handle Radio Toggles
  const toggleRadio = (url: string, id: string) => {
    if (!audioRef.current) return;

    if (playingStation === id) {
      audioRef.current.pause();
      setPlayingStation(null);
    } else {
      audioRef.current.src = url;
      audioRef.current.play().catch(e => {
        console.error("Stream failed", e);
        alert("Could not load stream. It might be blocked by browser security or offline.");
      });
      setPlayingStation(id);
    }
  };

  // iOS Shortcut Trigger
  const connectSpeaker = () => {
    window.location.href = 'shortcuts://run-shortcut?name=Connect%20Sonos';
  };

  // Stop radio if switching modes
  useEffect(() => {
    if (mode !== 'radio' && audioRef.current) {
      audioRef.current.pause();
      setPlayingStation(null);
    }
  }, [mode]);

  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full min-h-[400px]">
      
      {/* Hidden HTML5 Audio Player for Radio */}
      <audio ref={audioRef} className="hidden" />

      {/* Header / Tabs */}
      <div className="p-4 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/50">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {mode === 'spotify' && <span className="text-[#1DB954]">Spotify</span>}
            {mode === 'radio' && <span className="text-red-600">Live Radio</span>}
            {mode === 'apple' && <span className="text-pink-600">Apple Radio</span>}
          </h3>
          
          {/* iOS Speaker Button */}
          <button 
             onClick={connectSpeaker}
             className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
           >
             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
             To Sonos
           </button>
        </div>

        <div className="flex p-1 bg-slate-200/60 rounded-xl">
          {(['spotify', 'radio', 'apple'] as AudioMode[]).map((m) => (
            <button 
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg capitalize transition-all ${mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-slate-50 overflow-hidden">
        
        {/* SPOTIFY IFRAME */}
        {mode === 'spotify' && (
          <iframe 
            src={spotifyUrl} 
            width="100%" 
            height="100%" 
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
            loading="lazy"
            className="border-none"
          />
        )}

        {/* APPLE RADIO IFRAME */}
        {mode === 'apple' && (
          <div className="w-full h-full flex flex-col">
            <iframe 
              src={appleRadioUrl} 
              width="100%" 
              height="100%" 
              allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" 
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
              loading="lazy"
              className="border-none flex-1"
            />
            <p className="text-[10px] text-center text-slate-400 py-2 bg-white border-t border-slate-100">
              Free Live Radio • Requires Apple ID sign-in
            </p>
          </div>
        )}

        {/* LIVE RADIO LIST */}
        {mode === 'radio' && (
          <div className="absolute inset-0 p-6 flex flex-col gap-3 overflow-y-auto">
             {STATIONS.map(station => {
               const isPlaying = playingStation === station.id;
               return (
                 <button 
                   key={station.id}
                   onClick={() => toggleRadio(station.url, station.id)}
                   className={`group relative w-full p-4 rounded-2xl border-2 text-left transition-all ${isPlaying ? 'bg-white border-red-500 shadow-md ring-2 ring-red-100' : `bg-white ${station.color} hover:shadow-md`}`}
                 >
                   <div className="flex items-center gap-4">
                     {/* Icon / Animation */}
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-transform ${isPlaying ? 'bg-red-500 scale-110' : 'bg-slate-300'}`}>
                       {isPlaying ? (
                         <div className="flex gap-0.5 items-end h-3">
                            <div className="w-1 bg-white animate-[bounce_1s_infinite]"></div>
                            <div className="w-1 bg-white animate-[bounce_1.2s_infinite]"></div>
                            <div className="w-1 bg-white animate-[bounce_0.8s_infinite]"></div>
                         </div>
                       ) : (
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 3l14 9-14 9V3z" /></svg>
                       )}
                     </div>
                     
                     <div>
                       <h4 className={`font-black text-sm ${isPlaying ? 'text-red-600' : station.darkColor}`}>{station.name}</h4>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{isPlaying ? 'On Air' : 'Tune In'}</p>
                     </div>
                   </div>
                 </button>
               );
             })}
             
             <div className="mt-auto pt-6 text-center">
               <p className="text-[10px] text-slate-300 font-medium">
                 Streams provided by RNZ & MediaWorks
               </p>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MediaWidget;
