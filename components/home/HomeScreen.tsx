// components/home/HomeScreen.tsx
// The kitchen iPad's front page: time & weather, tonight's dinner, music, lights,
// bins, a quick shopping-list add and the fridge notes, all on one screen.

import React, { useMemo, useState } from 'react';
import { CalendarEvent, FamilyNote, Recipe, View, WeeklyPlan } from '../../types';
import { ManualItem } from '../../lib/merge';
import { HOME } from '../../home.config';
import { useEntities, useEntity, callService } from '../../lib/hass';
import { startCooking } from '../../lib/cooking';
import { useSettings } from '../../lib/settings';
import { useClock, useWeather } from '../../lib/useWeather';
import { callDinner } from '../../lib/announce';
import { eventsOn, eventTime } from '../../lib/calendar';
import BinNotifier from '../BinNotifier';
import FridgeNotes from '../FridgeNotes';
import RecipePicker from '../RecipePicker';
import { Card, LightRow, MoreLink } from './controls';
import { HomeIcons } from './icons';
import { NowPlaying, ProfileGrid } from './music';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface HomeScreenProps {
  weeklyPlan: WeeklyPlan;
  recipes: Recipe[];
  notes: FamilyNote[];
  manualItems: ManualItem[];
  onAddNote: (text: string) => void;
  onRemoveNote: (id: string) => void;
  onAddShoppingItem: (name: string) => void;
  onAddMeal: (day: string, recipe: Recipe) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onNavigate: (view: View) => void;
  events: CalendarEvent[];
}

const Agenda: React.FC<{ events: CalendarEvent[]; now: Date }> = ({ events, now }) => {
  const today = eventsOn(events, now).filter(e => !e.end.dateTime || new Date(e.end.dateTime) > now);
  const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = eventsOn(events, tomorrowDate);
  if (!today.length && !tomorrow.length) return <p className="text-sm font-semibold text-indigo-200">Nothing on the calendar today or tomorrow.</p>;
  const row = (e: CalendarEvent, prefix?: string) => (
    <li key={e.id} className="flex items-center gap-2.5 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color || '#fff' }} />
      <span className="text-xs font-black text-indigo-200 w-[6.5rem] shrink-0 whitespace-nowrap">{prefix || eventTime(e)}</span>
      <span className="text-sm font-bold truncate">{e.summary}</span>
    </li>
  );
  return (
    <ul className="space-y-1.5">
      {today.slice(0, 3).map(e => row(e))}
      {today.length > 3 && <li className="text-xs font-bold text-indigo-200 pl-[1.1rem]">+{today.length - 3} more today</li>}
      {today.length < 3 && tomorrow.slice(0, 3 - today.length).map(e => row(e, `Tmrw ${eventTime(e)}`))}
    </ul>
  );
};

const ClockWeather: React.FC<{ events: CalendarEvent[] }> = ({ events }) => {
  const now = useClock();
  const weather = useWeather();
  return (
    <div className="h-full bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] p-7 text-white shadow-xl shadow-indigo-100 relative overflow-hidden flex flex-col justify-between">
      <div className="relative z-10">
        <p className="text-indigo-100 font-semibold">{now.toLocaleDateString('en-NZ', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p className="text-6xl font-black tracking-tighter leading-none mt-1">
          {now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </p>
        <div className="mt-5"><Agenda events={events} now={now} /></div>
      </div>
      <div className="relative z-10 flex items-end justify-between gap-4 mt-6">
        {weather ? (
          <>
            <div>
              <p className="text-4xl font-black tracking-tight leading-none">{weather.temp}°</p>
              <p className="text-sm font-bold text-indigo-100 mt-1">{weather.condition} · H {weather.high}° L {weather.low}°</p>
            </div>
            <div className="text-right bg-white/10 rounded-2xl px-4 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Tomorrow</p>
              <p className="text-sm font-bold">{weather.tomorrow.condition}</p>
              <p className="text-xs font-semibold text-indigo-200">{weather.tomorrow.high}° / {weather.tomorrow.low}°</p>
            </div>
          </>
        ) : (
          <div className="h-12 w-40 bg-white/15 rounded-xl animate-pulse" />
        )}
      </div>
      <div className="absolute -top-16 -left-10 w-56 h-56 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-16 -right-10 w-56 h-56 bg-indigo-400/20 rounded-full blur-3xl" />
    </div>
  );
};

const DinnerButton: React.FC = () => {
  const [called, setCalled] = useState(false);
  return (
    <button
      onClick={() => { callDinner(); setCalled(true); setTimeout(() => setCalled(false), 4000); }}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${called ? 'bg-emerald-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
    >
      <HomeIcons.Bell className="w-4 h-4" /> {called ? 'Called!' : "Dinner's ready"}
    </button>
  );
};

const Tonight: React.FC<{
  meals: Recipe[];
  onOpen: (r: Recipe) => void;
  onPlan: () => void;
}> = ({ meals, onOpen, onPlan }) => {
  const main = meals[0];
  const { moods, cooking } = useSettings();
  const mood = moods.find(m => m.id === cooking.moodId);
  const whatItDoes = [mood && `puts on the ${mood.name} music`, cooking.lights && 'turns the kitchen lights up'].filter(Boolean).join(' and ');
  return (
    <div className="h-full bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex">
      {main ? (
        <>
          <button onClick={() => onOpen(main)} className="relative w-[36%] shrink-0 bg-slate-100">
            <img src={main.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </button>
          <div className="flex-1 p-7 flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-3 -mt-1">
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-500">Tonight's dinner</p>
              <DinnerButton />
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mt-1 line-clamp-2">{main.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {main.tags.slice(0, 3).map(t => <span key={t} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase">{t}</span>)}
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full uppercase">{main.ingredients.length} ingredients</span>
            </div>
            {meals.length > 1 && <p className="text-xs font-semibold text-slate-400 mt-2">Also: {meals.slice(1).map(m => m.name).join(', ')}</p>}
            <div className="mt-auto pt-5 flex flex-wrap gap-2.5">
              <button
                onClick={() => { startCooking(); onOpen(main); }}
                className="flex items-center gap-2 px-4 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold whitespace-nowrap shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all"
              >
                <HomeIcons.Chef className="w-5 h-5" /> Start cooking
              </button>
              <button onClick={() => onOpen(main)} className="px-4 py-3.5 rounded-2xl whitespace-nowrap bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">
                View recipe
              </button>
            </div>
            {whatItDoes && <p className="text-xs font-semibold text-slate-400 mt-3">Start cooking {whatItDoes}.</p>}
          </div>
        </>
      ) : (
        <div className="flex-1 p-7 flex flex-col items-start justify-center relative">
          <div className="absolute top-6 right-6"><DinnerButton /></div>
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-500">Tonight's dinner</p>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight mt-1">Nothing planned yet</h2>
          <p className="text-slate-500 font-medium mt-1">Pick something from the recipe book.</p>
          <button onClick={onPlan} className="mt-5 flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200">
            <HomeIcons.Plus className="w-5 h-5" /> Plan tonight
          </button>
        </div>
      )}
    </div>
  );
};

const LightsCard: React.FC<{ onMore: () => void }> = ({ onMore }) => {
  const { rooms: roomList } = useSettings();
  const rooms = useEntities(roomList.map(r => r.entity));
  const party = useEntity(HOME.partyMode);
  const anyOn = rooms.some(e => e?.state === 'on');
  return (
    <Card
      title="Lights"
      action={<MoreLink onClick={onMore}>Every light</MoreLink>}
      className="h-full flex flex-col"
    >
      <div className="space-y-2 flex-1">
        {roomList.map((r, i) => <LightRow key={r.id} name={r.name} entityId={r.entity} entity={rooms[i]} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={() => callService('input_boolean', 'toggle', undefined, { entity_id: HOME.partyMode })}
          className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all ${party?.state === 'on' ? 'bg-pink-500 text-white shadow-lg shadow-pink-200' : 'bg-slate-100 text-slate-600'}`}
        >
          <HomeIcons.Party className="w-4 h-4" /> Party {party?.state === 'on' ? 'on' : 'mode'}
        </button>
        <button
          disabled={!anyOn}
          onClick={() => callService('light', 'turn_off', undefined, { entity_id: roomList.map(r => r.entity) })}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-slate-900 text-white disabled:opacity-30"
        >
          <HomeIcons.Power className="w-4 h-4" /> All off
        </button>
      </div>
    </Card>
  );
};

const ShoppingCard: React.FC<{ items: ManualItem[]; onAdd: (name: string) => void; onMore: () => void }> = ({ items, onAdd, onMore }) => {
  const [text, setText] = useState('');
  const open = items.filter(i => !i.checked);
  const submit = () => { if (text.trim()) { onAdd(text.trim()); setText(''); } };
  return (
    <Card title="Shopping list" action={<MoreLink onClick={onMore}>Open list</MoreLink>}>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="We're out of…"
          className="flex-1 min-w-0 bg-slate-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button aria-label="Add to shopping list" onClick={submit} className="w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0"><HomeIcons.Plus className="w-5 h-5" /></button>
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {open.slice(0, 8).map(i => <span key={i.id} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">{i.name}</span>)}
          {open.length > 8 && <span className="text-xs font-bold text-slate-400 px-1 py-1">+{open.length - 8} more</span>}
        </div>
      )}
    </Card>
  );
};

const HomeScreen: React.FC<HomeScreenProps> = ({
  weeklyPlan, recipes, notes, manualItems, onAddNote, onRemoveNote, onAddShoppingItem, onAddMeal, onOpenRecipe, onNavigate, events,
}) => {
  const [picking, setPicking] = useState(false);
  const today = DAYS[new Date().getDay()];
  const tomorrowName = DAYS[(new Date().getDay() + 1) % 7];

  // Use the latest copy of each recipe (the plan stores a snapshot from when it was planned).
  const fresh = (r: Recipe) => recipes.find(x => x.id === r.id) || r;
  const tonight = useMemo(() => (weeklyPlan[today] || []).map(fresh), [weeklyPlan, recipes, today]);
  const tomorrow = useMemo(() => (weeklyPlan[tomorrowName] || []).map(fresh), [weeklyPlan, recipes, tomorrowName]);

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[1500px]">
      <div className="col-span-12 lg:col-span-5"><ClockWeather events={events} /></div>
      <div className="col-span-12 lg:col-span-7 min-h-[15rem]">
        <Tonight meals={tonight} onOpen={onOpenRecipe} onPlan={() => setPicking(true)} />
      </div>

      <div className="col-span-12 md:col-span-6 lg:col-span-4 space-y-5">
        <Card title="Music" action={<MoreLink onClick={() => onNavigate(View.Music)}>Speakers</MoreLink>}>
          <NowPlaying />
          <div className="mt-5"><ProfileGrid /></div>
        </Card>
        <ShoppingCard items={manualItems} onAdd={onAddShoppingItem} onMore={() => onNavigate(View.ShoppingList)} />
      </div>

      <div className="col-span-12 md:col-span-6 lg:col-span-4">
        <LightsCard onMore={() => onNavigate(View.Lights)} />
      </div>

      <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
        <BinNotifier />
        {tomorrow.length > 0 && (
          <button onClick={() => onOpenRecipe(tomorrow[0])} className="flex items-center gap-3 bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 text-left">
            <img src={tomorrow[0].imageUrl} alt="" className="w-14 h-14 rounded-2xl object-cover" />
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Tomorrow</span>
              <span className="block font-bold text-slate-800 truncate">{tomorrow.map(t => t.name).join(', ')}</span>
            </span>
          </button>
        )}
        <FridgeNotes notes={notes} onAddNote={onAddNote} onRemoveNote={onRemoveNote} className="flex-1 min-h-[16rem] !p-6" />
      </div>

      {picking && (
        <RecipePicker
          recipes={recipes}
          onSelect={(r: Recipe) => { onAddMeal(today, r); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

export default HomeScreen;
