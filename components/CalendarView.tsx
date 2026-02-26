// components/CalendarView.tsx

import React, { useState } from 'react';
import { CalendarEvent } from '../types';

interface CalendarViewProps {
  events: CalendarEvent[];
  onAddEvent: (event: { summary: string; start: string; allDay: boolean }) => Promise<boolean>;
}

const CalendarView: React.FC<CalendarViewProps> = ({ events, onAddEvent }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isAdding, setIsAdding] = useState(false);
  // Default to just the date string, removed 'time' and 'allDay' toggles
  const [newEvent, setNewEvent] = useState({ summary: '', date: new Date().toISOString().split('T')[0] });

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const getEventsForDay = (day: number) => {
    return events.filter(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date || '');
      return eventDate.getDate() === day && eventDate.getMonth() === month && eventDate.getFullYear() === year;
    });
  };

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Simplified: Always sends as allDay: true with just the date string
    const success = await onAddEvent({ summary: newEvent.summary, start: newEvent.date, allDay: true });
    if (success) {
      setIsAdding(false);
      setNewEvent({ ...newEvent, summary: '' });
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-100 flex flex-col h-full relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">
            {currentDate.toLocaleString('default', { month: 'long' })} <span className="text-indigo-600">{year}</span>
          </h3>
          <p className="text-slate-500 font-medium">Monthly family schedule.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAdding(true)} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all">+ New Event</button>
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-white rounded-lg">←</button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-xs font-bold">Today</button>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-white rounded-lg">→</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {daysOfWeek.map(day => <div key={day} className="text-center py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{day}</div>)}
      </div>

      <div className="grid grid-cols-7 grid-rows-5 gap-px bg-slate-100 border border-slate-100 rounded-3xl overflow-hidden flex-1 min-h-[500px]">
        {blanks.map(i => <div key={`blank-${i}`} className="bg-slate-50/50" />)}
        {days.map(day => {
          const dayEvents = getEventsForDay(day);
          const active = isToday(day);
          return (
            <div key={day} className={`bg-white p-2 min-h-[100px] group transition-colors hover:bg-indigo-50/30 ${active ? 'ring-2 ring-inset ring-indigo-500 z-10' : ''}`}>
              <span className={`text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full ${active ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>{day}</span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.map(event => (
                  <div key={event.id} className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-bold text-indigo-700 truncate" title={event.summary}>
                    {event.summary}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-bold mb-6">Create New Event</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Event Summary</label>
                <input required type="text" placeholder="e.g. Doctor Appointment" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2" value={newEvent.summary} onChange={e => setNewEvent({...newEvent, summary: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Date</label>
                <input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              </div>
              
              <p className="text-[10px] text-slate-400 italic">All events are added as all-day notifications.</p>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">Add Event</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
