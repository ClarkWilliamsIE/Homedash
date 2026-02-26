import React, { useState } from 'react';

const SpotifyWidget: React.FC = () => {
  // Default to a functional playlist (e.g., Coffee Shop Vibes)
  const [playlistUrl, setPlaylistUrl] = useState('https://open.spotify.com/playlist/37i9dQZF1DX9uKNf5pS8vG'); 
  const [isEditing, setIsEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(playlistUrl);

  // Convert standard Spotify URLs to the required Embed format
  const getEmbedUrl = (url: string) => {
    try {
      // Handles formats like: https://open.spotify.com/playlist/ID or https://open.spotify.com/album/ID
      const parts = url.split('/');
      const type = parts[3]; 
      const id = parts[4].split('?')[0];
      return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
    } catch (e) {
      // Fallback if URL is malformed
      return `https://open.spotify.com/embed/playlist/37i9dQZF1DX9uKNf5pS8vG?utm_source=generator&theme=0`;
    }
  };

  const handleUpdate = () => {
    setPlaylistUrl(tempUrl);
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full min-h-[400px]">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.485 17.303c-.216.354-.675.467-1.03.25-2.85-1.74-6.436-2.134-10.662-1.168-.404.093-.81-.16-.902-.563-.093-.404.162-.81.564-.903 4.62-1.056 8.583-.615 11.778 1.336.355.216.468.674.252 1.03zm1.465-3.26c-.273.444-.852.585-1.296.312-3.262-2.003-8.236-2.587-12.095-1.416-.5.152-1.026-.13-1.18-.63-.15-.5.132-1.026.63-1.18 4.41-1.338 9.894-.69 13.633 1.605.444.273.585.852.312 1.296zm.126-3.393c-3.912-2.323-10.363-2.537-14.125-1.396-.6.182-1.233-.163-1.415-.762-.182-.6.163-1.233.762-1.415 4.316-1.31 11.437-1.053 15.96 1.63.538.32.715 1.018.395 1.556-.32.54-1.018.717-1.557.397z"/>
          </svg>
          Family Radio
        </h3>
        <button 
          onClick={() => setIsEditing(!isEditing)} 
          className="text-[10px] font-bold uppercase text-slate-400 hover:text-indigo-600 tracking-widest"
        >
          {isEditing ? 'Cancel' : 'Change Station'}
        </button>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden bg-slate-50 relative">
        {isEditing && (
          <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm p-6 flex flex-col justify-center items-center text-center">
            <p className="text-sm font-bold text-slate-800 mb-4">Paste Spotify Playlist or Album URL</p>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs mb-4 outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="https://open.spotify.com/playlist/..."
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
            />
            <button 
              onClick={handleUpdate}
              className="px-6 py-2 bg-[#1DB954] text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 active:scale-95 transition-all"
            >
              Update Widget
            </button>
          </div>
        )}
        
        <iframe 
          src={getEmbedUrl(playlistUrl)} 
          width="100%" 
          height="100%" 
          frameBorder="0" 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default SpotifyWidget;
