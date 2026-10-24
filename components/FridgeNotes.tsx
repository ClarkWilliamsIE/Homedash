// components/FridgeNotes.tsx
import React, { useState } from 'react';
import { FamilyNote } from '../types';
import { Btn, Icon, Panel } from './ui';

interface FridgeNotesProps {
  notes: FamilyNote[];
  onAddNote: (text: string) => void;
  onRemoveNote: (id: string) => void;
  className?: string;
}

// Paper colours for the notes, picked from the note's id so each keeps its colour.
const PAPERS = ['#f7ecc9', '#e6efe3', '#f6e2d6', '#ece6f2'];
const paperFor = (id: string) => PAPERS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PAPERS.length];

const FridgeNotes: React.FC<FridgeNotesProps> = ({ notes, onAddNote, onRemoveNote, className = '' }) => {
  const [noteText, setNoteText] = useState('');
  const submit = () => {
    if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(''); }
  };

  return (
    <Panel title="Fridge notes" className={`flex flex-col ${className}`} bodyClassName="flex-1 flex flex-col">
      <ul className="flex-1 space-y-2.5 mb-4">
        {notes.length === 0 && <li className="text-slate-500">Leave a note for the family.</li>}
        {notes.map((note, i) => (
          <li
            key={note.id}
            className="relative flex items-start gap-2 pl-4 pr-1.5 py-3 rounded-xl shadow-sm"
            style={{ background: paperFor(note.id), transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}
          >
            <p className="flex-1 text-[15px] text-slate-800 leading-relaxed">{note.text}</p>
            <button aria-label="Remove note" onClick={() => onRemoveNote(note.id)} className="w-8 h-8 shrink-0 rounded-full text-slate-500 hover:bg-black/5 hover:text-slate-900">✕</button>
          </li>
        ))}
      </ul>

      <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input
          type="text"
          placeholder="Write a note…"
          aria-label="New note"
          className="flex-1 min-w-0 h-12 bg-slate-100 rounded-2xl px-4 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
        />
        <Btn type="submit" variant="secondary" className="!h-12 w-12 !px-0" aria-label="Add note" icon={<Icon.Plus className="w-5 h-5" />} />
      </form>
    </Panel>
  );
};

export default FridgeNotes;
