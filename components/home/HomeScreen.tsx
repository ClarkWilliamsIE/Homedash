// components/home/HomeScreen.tsx
// The front page. Tonight's dinner leads; around it the clock and weather, the shopping list,
// the rest of the week and the fridge notes. At home (inside Home Assistant) it also shows
// the music and lights.

import React, { useMemo, useState } from 'react';
import { CalendarEvent, FamilyNote, Recipe, View, WeeklyPlan } from '../../types';
import { HOME } from '../../home.config';
import { useEntities, useEntity, callService, useIsHome } from '../../lib/hass';
import { startCooking } from '../../lib/cooking';
import { useSettings } from '../../lib/settings';
import { useClock, useWeather } from '../../lib/useWeather';
import { callDinner } from '../../lib/announce';
import { eventsOn, eventTime } from '../../lib/calendar';
import BinNotifier from '../BinNotifier';
import FridgeNotes from '../FridgeNotes';
import RecipePicker from '../RecipePicker';
import { Btn, Icon, MealPhoto, Panel } from '../ui';
import { LightRow, MoreLink } from './controls';
import { HomeIcons } from './icons';
import { NowPlaying, ProfileGrid } from './music';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface HomeScreenProps {
  weeklyPlan: WeeklyPlan;
  recipes: Recipe[];
  notes: FamilyNote[];
  shoppingLeft: number;
  onAddNote: (text: string) => void;
  onRemoveNote: (id: string) => void;
  onAddShoppingItem: (name: string) => void;
  onAddMeal: (day: string, recipe: Recipe) => void;
  onOpenRecipe: (recipe: Recipe, cook?: boolean) => void;
  onNavigate: (view: View) => void;
  events: CalendarEvent[];
}

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

/** Date, time, weather, bins and anything on the calendar: set straight on the page, not in a card. */
const Masthead: React.FC<{ events: CalendarEvent[] }> = ({ events }) => {
  const now = useClock();
  const weather = useWeather();
  const today = eventsOn(events, now).filter(e => !e.end.dateTime || new Date(e.end.dateTime) > now);
  const tomorrowDate = new Date(now); tomorrowDate.setDate(now.getDate() + 1);
  const upcoming = [...today.map(e => ({ e, when: eventTime(e) })), ...eventsOn(events, tomorrowDate).map(e => ({ e, when: `Tomorrow ${eventTime(e)}` }))].slice(0, 3);

  return (
    <header className="flex flex-col md:flex-row md:items-end gap-3 md:gap-8 mb-5 md:mb-6">
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 font-medium">{now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="font-display text-slate-900 leading-none mt-1 flex items-baseline gap-4 flex-wrap">
          <span className="text-[2.6rem] md:text-6xl tabular-nums">{now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ')}</span>
          <span className="hidden md:inline text-3xl text-slate-400">{greeting(now.getHours())}</span>
        </h1>
      </div>
      <div className="md:text-right text-[15px] text-slate-600 space-y-1">
        {weather && (
          <p>
            <span className="font-semibold text-slate-900">{weather.temp}°</span> {weather.condition.toLowerCase()}, high {weather.high}° low {weather.low}°
            <span className="text-slate-400"> · tomorrow {weather.tomorrow.condition.toLowerCase()}, {weather.tomorrow.high}°</span>
          </p>
        )}
        {upcoming.map(({ e, when }) => (
          <p key={e.id} className="flex md:justify-end items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color || 'var(--color-indigo-500)' }} />
            <span className="text-slate-500 whitespace-nowrap">{when}</span>
            <span className="font-medium text-slate-800 truncate">{e.summary}</span>
          </p>
        ))}
        <BinNotifier className="text-slate-500" />
      </div>
    </header>
  );
};

const DinnerButton: React.FC = () => {
  const [called, setCalled] = useState(false);
  return (
    <Btn
      size="lg"
      className="w-full md:w-auto"
      variant={called ? 'secondary' : 'clay'}
      onClick={() => { callDinner(); setCalled(true); setTimeout(() => setCalled(false), 4000); }}
      icon={<HomeIcons.Bell className="w-5 h-5" />}
    >
      {called ? 'Everyone called' : "Dinner's ready"}
    </Btn>
  );
};

const Tonight: React.FC<{
  meals: Recipe[];
  favourites: Recipe[];
  onOpen: (r: Recipe, cook?: boolean) => void;
  onPlan: () => void;
  onQuickPlan: (r: Recipe) => void;
}> = ({ meals, favourites, onOpen, onPlan, onQuickPlan }) => {
  const isHome = useIsHome();
  const { moods, cooking } = useSettings();
  const main = meals[0];
  const mood = moods.find(m => m.id === cooking.moodId);
  const whatItDoes = [mood && `puts on the ${mood.name} music`, cooking.lights && 'turns the kitchen lights up'].filter(Boolean).join(' and ');

  if (!main) {
    return (
      <section className="bg-white rounded-3xl border border-slate-200/70 shadow-sm p-6 md:p-8">
        <p className="font-semibold text-orange-600">Tonight</p>
        <h2 className="font-display text-3xl md:text-4xl text-slate-900 mt-1">Nothing planned yet</h2>
        <div className="flex flex-wrap gap-2 mt-5">
          <Btn size="lg" onClick={onPlan} icon={<Icon.Plus className="w-5 h-5" />}>Choose tonight's dinner</Btn>
          {isHome && <DinnerButton />}
        </div>
        {favourites.length > 0 && (
          <>
            <p className="text-slate-500 mt-6 mb-2.5">Or one of the favourites:</p>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {favourites.map(r => (
                <button key={r.id} onClick={() => onQuickPlan(r)} className="shrink-0 w-36 text-left group">
                  <img src={r.imageUrl} alt="" className="w-36 h-24 rounded-2xl object-cover" />
                  <span className="block text-sm font-semibold text-slate-800 mt-1.5 line-clamp-2 group-hover:text-indigo-700">{r.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  if (main.isCustom) {
    // A one-off meal (out for a BBQ, takeaways): no photo or method, just the plan and what to bring.
    return (
      <section className="bg-white rounded-3xl border border-slate-200/70 shadow-sm p-6 md:p-8 flex gap-5 md:gap-8 items-start">
        <MealPhoto meal={main} big className="hidden md:flex w-40 h-40 rounded-3xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-orange-600">Tonight</p>
          <h2 className="font-display text-[2rem] md:text-[2.6rem] leading-[1.1] text-slate-900 mt-1">{main.name}</h2>
          {main.ingredients.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-3">
              {main.ingredients.map((i, k) => <li key={k} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{i.item}</li>)}
            </ul>
          )}
          {meals.length > 1 && <p className="text-slate-500 mt-3">Also {meals.slice(1).map(m => m.name).join(', ')}</p>}
          <div className="flex flex-wrap gap-2 mt-6">
            <Btn size="lg" variant="secondary" onClick={() => onOpen(main)}>Change</Btn>
            {isHome && <DinnerButton />}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <button onClick={() => onOpen(main)} className="block relative bg-slate-200 aspect-[16/10] md:aspect-auto md:min-h-[19rem] w-full" aria-label={`Open ${main.name}`}>
        <img src={main.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      </button>
      <div className="p-5 md:p-8 flex flex-col min-w-0">
        <p className="font-semibold text-orange-600">Tonight</p>
        <h2 className="font-display text-[2rem] md:text-[2.6rem] leading-[1.1] text-slate-900 mt-1 line-clamp-3">{main.name}</h2>
        <p className="text-slate-500 mt-2">
          {[main.tags.slice(0, 2).join(', '), `${main.ingredients.length} ingredients`].filter(Boolean).join(' · ')}
        </p>
        {meals.length > 1 && <p className="text-slate-500 mt-1">Also {meals.slice(1).map(m => m.name).join(', ')}</p>}
        <div className="mt-auto pt-6 grid grid-cols-2 md:flex md:flex-wrap gap-2">
          <Btn size="lg" onClick={() => { if (isHome) startCooking(); onOpen(main, true); }} icon={<HomeIcons.Chef className="w-5 h-5" />}>Start cooking</Btn>
          <Btn size="lg" variant="secondary" onClick={() => onOpen(main)}>Recipe</Btn>
          {isHome && <div className="col-span-2 md:contents"><DinnerButton /></div>}
        </div>
        {isHome && whatItDoes && <p className="text-sm text-slate-500 mt-3">Start cooking {whatItDoes}.</p>}
      </div>
    </section>
  );
};

const LightsCard: React.FC<{ onMore: () => void }> = ({ onMore }) => {
  const { rooms: roomList } = useSettings();
  const rooms = useEntities(roomList.map(r => r.entity));
  const party = useEntity(HOME.partyMode);
  const anyOn = rooms.some(e => e?.state === 'on');
  return (
    <Panel title="Lights" action={<MoreLink onClick={onMore}>Every light</MoreLink>} className="h-full flex flex-col" bodyClassName="flex-1 flex flex-col">
      <div className="space-y-2 flex-1">
        {roomList.map((r, i) => <LightRow key={r.id} name={r.name} entityId={r.entity} entity={rooms[i]} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Btn
          variant={party?.state === 'on' ? 'clay' : 'secondary'}
          onClick={() => callService('input_boolean', 'toggle', undefined, { entity_id: HOME.partyMode })}
          icon={<HomeIcons.Party className="w-4 h-4" />}
        >
          Party {party?.state === 'on' ? 'on' : 'mode'}
        </Btn>
        <Btn
          variant="secondary"
          disabled={!anyOn}
          onClick={() => callService('light', 'turn_off', undefined, { entity_id: roomList.map(r => r.entity) })}
          icon={<HomeIcons.Power className="w-4 h-4" />}
        >
          All off
        </Btn>
      </div>
    </Panel>
  );
};

const ShoppingCard: React.FC<{ left: number; onAdd: (name: string) => void; onOpen: () => void }> = ({ left, onAdd, onOpen }) => {
  const [text, setText] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const submit = () => {
    const name = text.trim();
    if (!name) return;
    onAdd(name.charAt(0).toUpperCase() + name.slice(1));
    setText('');
    setAdded(name);
    setTimeout(() => setAdded(null), 2500);
  };
  return (
    <Panel title="Shopping list" action={<MoreLink onClick={onOpen}>Open</MoreLink>}>
      <button onClick={onOpen} className="flex items-baseline gap-2 mb-4 text-left">
        <span className="font-display text-5xl text-slate-900 leading-none">{left}</span>
        <span className="text-slate-500">{left === 1 ? 'thing to get' : 'things to get'}</span>
      </button>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="We've run out of…"
          aria-label="Add to the shopping list"
          className="flex-1 min-w-0 h-12 bg-slate-100 rounded-2xl px-4 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
        />
        <Btn type="submit" className="!h-12 w-12 !px-0" aria-label="Add" icon={<Icon.Plus className="w-5 h-5" />} />
      </form>
      <p className="text-sm text-slate-500 mt-2 h-5">{added ? `Added ${added}` : ''}</p>
    </Panel>
  );
};

const ComingUp: React.FC<{ plan: WeeklyPlan; fresh: (r: Recipe) => Recipe; onOpen: (r: Recipe) => void; onPlanWeek: () => void }> = ({ plan, fresh, onOpen, onPlanWeek }) => {
  const todayIdx = new Date().getDay();
  const days = [1, 2, 3, 4, 5, 6].map(o => ({ o, day: DAYS[(todayIdx + o) % 7] }));
  return (
    <Panel title="Coming up" action={<MoreLink onClick={onPlanWeek}>Plan the week</MoreLink>}>
      <ul className="divide-y divide-slate-100 -my-1">
        {days.map(({ o, day }) => {
          const meals = (plan[day] || []).map(fresh);
          return (
            <li key={day} className="flex items-center gap-3 py-2">
              <span className="w-24 shrink-0 text-slate-500">{o === 1 ? 'Tomorrow' : day}</span>
              {meals.length ? (
                <button onClick={() => onOpen(meals[0])} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                  <MealPhoto meal={meals[0]} className="w-9 h-9 rounded-lg shrink-0 !text-base" />
                  <span className="font-medium text-slate-900 truncate">{meals.map(m => m.name).join(', ')}</span>
                </button>
              ) : (
                <button onClick={onPlanWeek} className="flex-1 text-left text-slate-400">Nothing yet</button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

const HomeScreen: React.FC<HomeScreenProps> = ({
  weeklyPlan, recipes, notes, shoppingLeft, onAddNote, onRemoveNote, onAddShoppingItem, onAddMeal, onOpenRecipe, onNavigate, events,
}) => {
  const isHome = useIsHome();
  const [picking, setPicking] = useState(false);
  const today = DAYS[new Date().getDay()];

  // Use the latest copy of each recipe (the plan stores a snapshot from when it was planned).
  const fresh = (r: Recipe) => recipes.find(x => x.id === r.id) || r;
  const tonight = useMemo(() => (weeklyPlan[today] || []).map(fresh), [weeklyPlan, recipes, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const favourites = useMemo(() => recipes.filter(r => r.isFavorite).sort(() => 0.5 - Math.random()).slice(0, 6), [recipes]);

  const notesPanel = <FridgeNotes notes={notes} onAddNote={onAddNote} onRemoveNote={onRemoveNote} className="h-full" />;
  const shopping = <ShoppingCard left={shoppingLeft} onAdd={onAddShoppingItem} onOpen={() => onNavigate(View.ShoppingList)} />;
  const comingUp = <ComingUp plan={weeklyPlan} fresh={fresh} onOpen={r => onOpenRecipe(r)} onPlanWeek={() => onNavigate(View.Dashboard)} />;

  return (
    <div className="pb-20">
      <Masthead events={events} />

      <Tonight
        meals={tonight}
        favourites={favourites}
        onOpen={onOpenRecipe}
        onPlan={() => setPicking(true)}
        onQuickPlan={r => onAddMeal(today, r)}
      />

      {isHome ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          <Panel title="Music" action={<MoreLink onClick={() => onNavigate(View.Music)}>Browse</MoreLink>}>
            <NowPlaying />
            <div className="mt-5"><ProfileGrid /></div>
          </Panel>
          <LightsCard onMore={() => onNavigate(View.Lights)} />
          <div className="flex flex-col gap-5 md:col-span-2 lg:col-span-1">
            {shopping}
            {notesPanel}
          </div>
          <div className="md:col-span-2 lg:col-span-3">{comingUp}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          {shopping}
          {comingUp}
          <div className="md:col-span-2 lg:col-span-1">{notesPanel}</div>
        </div>
      )}

      {picking && (
        <RecipePicker
          title="Tonight's dinner"
          recipes={recipes}
          onSelect={(r: Recipe) => { onAddMeal(today, r); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

export default HomeScreen;
