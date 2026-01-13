// components/MealDay.tsx

import React from 'react';
import { Recipe } from '../types';

interface MealDayProps {
  day: string;
  meals: Recipe[];
  onAdd: () => void;
  onRemove: (recipeId: string) => void;
  onDragDrop: (sourceDay: string, targetDay: string, recipeId: string) => void;
}

const MealDay: React.FC<MealDayProps> = ({ day, meals, onAdd, onRemove, onDragDrop }) => {
  
  const handleDragStart = (e: React.DragEvent, recipeId: string) => {
    e.dataTransfer.setData('sourceDay', day);
    e.dataTransfer.setData('recipeId', recipeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sourceDay = e.dataTransfer.getData('sourceDay');
    const recipeId = e.dataTransfer.getData('recipeId');
    
    if (sourceDay && recipeId && sourceDay !== day) {
      onDragDrop(sourceDay, day, recipeId);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative flex flex-col min-h-[14rem] rounded-3xl transition-all p-4 border-2 group/day ${
        meals.length > 0 ? 'bg-white border-indigo-50 shadow-sm' : 'bg-slate-50/50 border-dashed border-slate-200'
      }`}
    >
      <div className="flex justify-between items-center mb-3">
        <span className={`text-[10px] font-black uppercase tracking-widest ${meals.length > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
          {day}
        </span>
        <button 
          onClick={onAdd}
          className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
          title="Add another item"
        >
          <span className="text-lg font-bold leading-none">+</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-2">
        {meals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity">
             <button onClick={onAdd} className="text-xs font-bold text-slate-400 hover:text-indigo-600 px-3 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                Add Meal
             </button>
          </div>
        ) : (
          meals.map(meal => (
            <div 
              key={meal.id}
              draggable 
              onDragStart={(e) => handleDragStart(e, meal.id)}
              className="relative flex items-center gap-3 p-2 bg-slate-50 rounded-2xl border border-slate-100 group cursor-move hover:border-indigo-200 hover:shadow-md transition-all"
            >
              <img src={meal.imageUrl} alt={meal.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-700 truncate">{meal.name}</h4>
                <p className="text-[9px] text-slate-400 truncate">{meal.tags[0] || 'Meal'}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(meal.id); }} 
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MealDay;
