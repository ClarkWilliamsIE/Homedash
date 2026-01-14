// components/Dashboard.tsx

import React, { useState } from 'react';
import { CalendarEvent, Recipe, WeeklyPlan, DayOfWeek, FamilyNote } from '../types';
import WeatherWidget from './WeatherWidget';
import MediaWidget from './MediaWidget';
import MealDay from './MealDay';
import RecipePicker from './RecipePicker';
import BinNotifier from './BinNotifier';

interface DashboardProps {
  events: CalendarEvent[];
  weeklyPlan: WeeklyPlan;
  recipes: Recipe[];
  // Updated Prop Signatures
  onAddMeal: (day: string, recipe: Recipe) => void;
  onRemoveMeal: (day: string, recipeId: string) => void;
  onMoveMeal: (source: string, target: string, recipeId: string) => void;
  
  notes: FamilyNote[];
  onAddNote: (text: string) => void;
  onRemoveNote: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  events, 
  weeklyPlan, 
  recipes, 
  onAddMeal, 
  onRemoveMeal,
  onMoveMeal,
  notes,
  onAddNote,
  onRemoveNote
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const days: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const openPicker = (day: string) => {
    setActiveDay(day);
    setIsPickerOpen(true);
  };

  const handleSelectRecipe = (recipe: Recipe) => {
    if (activeDay) {
      onAddMeal(activeDay, recipe); // Changed to ADD
      setIsPickerOpen(false);
      setActiveDay(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      {/* Main Column */}
      <div className="xl:col-span-3 space-y-8">
        <WeatherWidget />

        {/* Weekly Planner */}
        <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-slate-900">Weekly Meal Planner</h3>
            <div className="text-sm text-slate-400 font-medium bg-slate-50 px-3 py-1 rounded-full">
               Drag meals to move days
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {days.map(day => (
              <MealDay 
                key={day} 
                day={day} 
                meals={weeklyPlan[day] || []} // Default to empty array
                onAdd={() => openPicker(day)}
                onRemove={(recipeId) => onRemoveMeal(day, recipeId)}
                onDragDrop={onMoveMeal}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Calendar Widget */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Today's Agenda</h3>
            <div className="space-y-4">
              {events.filter(e => {
                const start = new Date(e.start.dateTime || e.start.date || '');
                const today = new Date();
                return start.toDateString() === today.toDateString();
              }).length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-slate-400 text-sm">No events today.</p>
                </div>
              ) : (
                events.filter(e => {
                  const start = new Date(e.start.dateTime || e.start.date || '');
                  const today = new Date();
                  return start.toDateString() === today.toDateString();
                }).map(event => {
                  const date = new Date(event.start.dateTime || event.start.date || '');
                  return (
                    <div key={event.id} className="flex gap-4 border-l-4 border-indigo-400 pl-4 py-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-800 truncate text-sm">{event.summary}</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{event.start.dateTime ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ... inside the grid ... */}
          <MediaWidget />
        </div>
      </div>

      {/* Right Column (Utilities) */}
      <div className="space-y-8 flex flex-col">
        <BinNotifier />

        {/* Fridge Notes */}
        <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col flex-1 min-h-[500px]">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
            Fridge Notes
          </h3>
          
          <div className="flex-1 space-y-4 overflow-y-auto pr-1 mb-6">
            {notes.map(note => (
              <div key={note.id} className={`${note.color} p-4 rounded-2xl shadow-sm relative group rotate-[-1deg] hover:rotate-0 transition-transform`}>
                <button onClick={() => onRemoveNote(note.id)} className="absolute top-1 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                <p className="text-sm font-medium text-slate-700 leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Post a note..." 
                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && noteText.trim()) {
                    onAddNote(noteText.trim());
                    setNoteText('');
                  }
                }}
              />
              <button 
                onClick={() => { if(noteText.trim()){ onAddNote(noteText.trim()); setNoteText(''); } }}
                className="absolute right-2 top-2 p-1 text-indigo-600 hover:bg-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isPickerOpen && (
        <RecipePicker 
          recipes={recipes} 
          onSelect={handleSelectRecipe} 
          onClose={() => setIsPickerOpen(false)} 
        />
      )}
    </div>
  );
};

export default Dashboard;
