
import React from 'react';
import { Recipe } from '../types';

interface MealDayProps {
  day: string;
  meal: Recipe | null;
  onAdd: () => void;
  onRemove: () => void;
  onDragDrop: (source: string, target: string) => void;
}

const MealDay: React.FC<MealDayProps> = ({ day, meal, onAdd, onRemove, onDragDrop }) => {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('sourceDay', day);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sourceDay = e.dataTransfer.getData('sourceDay');
    if (sourceDay && sourceDay !== day) {
      onDragDrop(sourceDay, day);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative flex flex-col h-48 rounded-2xl transition-all p-3 border-2 ${
        meal ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-50 border-dashed border-slate-200'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${meal ? 'text-indigo-600' : 'text-slate-400'}`}>
          {day}
        </span>
        {meal && (
          <button onClick={onRemove} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center overflow-hidden">
        {meal ? (
          <div 
            draggable 
            onDragStart={handleDragStart}
            className="w-full text-center cursor-move group"
          >
            <div className="relative w-16 h-16 mx-auto mb-2 overflow-hidden rounded-xl shadow-sm">
               <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{meal.name}</h4>
          </div>
        ) : (
          <button 
            onClick={onAdd}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MealDay;
