// components/FridgeNotes.tsx
import React, { useState } from 'react';
import { FamilyNote } from '../types';

interface FridgeNotesProps {
  notes: FamilyNote[];
  onAddNote: (text: string) => void;
  onRemoveNote: (id: string) => void;
  className?: string;
}

const FridgeNotes: React.FC<FridgeNotesProps> = ({ notes, onAddNote, onRemoveNote, className = '' }) => {
  const [noteText, setNoteText] = useState('');
  const submit = () => {
    if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(''); }
  };

  return (
    <div className={`bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col ${className}`}>
      <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
        Fridge Notes
      </h3>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1 mb-6">
        {notes.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No notes yet.</p>}
        {notes.map(note => (
          <div key={note.id} className={`${note.color} p-4 rounded-2xl shadow-sm relative group rotate-[-1deg] hover:rotate-0 transition-transform`}>
            <button aria-label="Remove note" onClick={() => onRemoveNote(note.id)} className="touch-show absolute top-1 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            <p className="text-sm font-medium text-slate-700 leading-relaxed pr-4">{note.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-auto relative">
        <input
          type="text"
          placeholder="Post a note..."
          className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button aria-label="Add note" onClick={submit} className="absolute right-2 top-2 p-1 text-indigo-600 hover:bg-white rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
    </div>
  );
};

export default FridgeNotes;
