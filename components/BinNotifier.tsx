
import React, { useState, useEffect } from 'react';

const BinNotifier: React.FC = () => {
  // Use localStorage to persist the cycle offset in case the user swaps it
  const [cycleOffset, setCycleOffset] = useState<number>(() => {
    const saved = localStorage.getItem('kapiti_bin_offset');
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem('kapiti_bin_offset', cycleOffset.toString());
  }, [cycleOffset]);

  // Logic: Monday morning collection. 
  // We determine "Week A" or "Week B" based on the number of weeks since a reference date.
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  
  // Reference date: Jan 1, 2024 (a Monday)
  const refDate = new Date(2024, 0, 1);
  const diffTime = now.getTime() - refDate.getTime();
  const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  const isAltWeek = (diffWeeks + cycleOffset) % 2 === 0;
  
  // Kāpiti Standard:
  // Week A: Rubbish + Recycling (Yellow)
  // Week B: Rubbish + Glass (Blue)
  const collectionType = isAltWeek ? 'Recycling' : 'Glass';
  const binColorClass = isAltWeek ? 'bg-yellow-400' : 'bg-blue-500';

  const toggleCycle = () => setCycleOffset(prev => prev + 1);

  // If it's Sunday (0), show a "Tonight" alert. Otherwise "Next Collection".
  const isSunday = day === 0;

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-hidden relative group">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Bin Collection</h3>
        <button 
          onClick={toggleCycle}
          className="text-[9px] font-bold text-slate-300 hover:text-indigo-600 uppercase tracking-tighter transition-colors"
        >
          Swap Cycle
        </button>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex gap-1.5">
          {/* Rubbish Bin (Every week) */}
          <div className="w-10 h-14 bg-slate-700 rounded-lg flex flex-col items-center justify-center shadow-lg">
             <div className="w-8 h-1 bg-slate-600 rounded-full mb-1"></div>
             <div className="w-6 h-6 rounded-full border-2 border-slate-600 flex items-center justify-center">
                <span className="text-[8px] font-black text-white">R</span>
             </div>
          </div>
          
          {/* Alternating Bin */}
          <div className={`w-10 h-14 ${binColorClass} rounded-lg flex flex-col items-center justify-center shadow-lg transition-colors duration-500`}>
             <div className="w-8 h-1 bg-black/10 rounded-full mb-1"></div>
             <div className="w-6 h-6 rounded-full border-2 border-black/10 flex items-center justify-center">
                <span className="text-[8px] font-black text-white">{collectionType[0]}</span>
             </div>
          </div>
        </div>

        <div className="flex-1">
          <p className={`text-xs font-bold ${isSunday ? 'text-orange-500 animate-pulse' : 'text-slate-500'}`}>
            {isSunday ? 'BINS OUT TONIGHT!' : 'Next Monday'}
          </p>
          <h4 className="text-lg font-black text-slate-800 leading-tight">
             Rubbish + <br/>
             <span className={isAltWeek ? 'text-yellow-600' : 'text-blue-600'}>{collectionType}</span>
          </h4>
        </div>
      </div>
      
      {isSunday && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-yellow-400"></div>
      )}
    </div>
  );
};

export default BinNotifier;
