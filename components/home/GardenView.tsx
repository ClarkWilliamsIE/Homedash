// components/home/GardenView.tsx
// The Garden tab: what the soil sensor says today (and whether to water, given the forecast),
// its charts, what to sow, plant and pick this month in Waikanae, and what makes growing here
// different.

import React, { useState } from 'react';
import { useEntity } from '../../lib/hass';
import { LOCAL, MONTHS, MONTH_NAMES } from '../../lib/gardenGuide';
import { GardenDay, useGardenWeather } from '../../lib/useGardenWeather';
import { Panel } from '../ui';
import GardenCard from './GardenCard';
import { HomeIcons } from './icons';

const num = (s?: string) => { const n = parseFloat(s ?? ''); return Number.isFinite(n) ? n : null; };

const dayName = (iso: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400e3);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return d.toLocaleDateString('en-NZ', { weekday: 'long' });
};

type Tone = 'go' | 'ok' | 'warn';
type Note = { tone: Tone; title: string; text: string };

/** Should we water? Soil moisture first, then whether rain is on the way. */
const wateringNote = (m: number | null, days: GardenDay[] | null): Note | null => {
  if (m === null) return null;
  const soon = (days || []).slice(0, 2).reduce((s, d) => s + d.rain, 0);
  const rainy = (days || []).slice(0, 2).find(d => d.rain >= 2);
  const rainText = rainy ? `About ${Math.round(soon)} mm of rain is forecast by ${dayName(days![1].date)}.` : '';
  if (m < 20) {
    return soon >= 10
      ? { tone: 'ok', title: 'Dry, but rain is coming', text: `Soil is at ${Math.round(m)}%. ${rainText} Hold off unless seedlings are wilting.` }
      : { tone: 'warn', title: 'Water today', text: `Soil is at ${Math.round(m)}%, which is dry. Give it a deep soak in the morning or evening.` };
  }
  if (m < 35) {
    return soon >= 5
      ? { tone: 'ok', title: 'Getting dry, rain due', text: `Soil is at ${Math.round(m)}%. ${rainText} You can probably skip watering.` }
      : { tone: 'warn', title: 'Water in the next day or so', text: `Soil is at ${Math.round(m)}% and drying out. A deep water will see it through a few days.` };
  }
  if (m <= 70) return { tone: 'go', title: 'No need to water', text: `Soil is at ${Math.round(m)}%, nicely damp.` };
  return { tone: 'go', title: 'Plenty wet', text: `Soil is at ${Math.round(m)}%. Skip watering and let it drain.` };
};

/** Frost, wind and heat in the next few days. */
const weatherNotes = (days: GardenDay[] | null): Note[] => {
  if (!days) return [];
  const out: Note[] = [];
  const frost = days.find(d => d.min <= 2);
  if (frost) out.push({ tone: 'warn', title: `Frost risk ${dayName(frost.date)}`, text: `A low of ${frost.min}° is forecast. Cover tender plants with frost cloth the evening before.` });
  const wind = days.find(d => d.gust >= 60);
  if (wind) out.push({ tone: 'warn', title: `Strong wind ${dayName(wind.date)}`, text: `Gusts up to ${wind.gust} km/h. Check stakes and ties on tall plants.` });
  const hot = days.find(d => d.max >= 25);
  if (hot) out.push({ tone: 'ok', title: `Hot ${dayName(hot.date)}`, text: `Up to ${hot.max}°. Water early in the morning so plants go into the heat with a drink.` });
  return out;
};

/** What the soil temperature is warm enough for. */
const soilWarmth = (t: number | null): Note | null => {
  if (t === null) return null;
  const temp = `${t.toFixed(1)}°`;
  if (t >= 16) return { tone: 'go', title: `Garden is at ${temp}`, text: 'Warm enough to sow beans, sweetcorn, pumpkins, cucumbers and zucchini.' };
  if (t >= 10) return { tone: 'ok', title: `Garden is at ${temp}`, text: 'Warm enough for most seeds: carrots, beetroot, lettuce, peas, spinach. Beans and sweetcorn want 16°.' };
  return { tone: 'ok', title: `Garden is at ${temp}`, text: 'Too cold for most seeds outside. Sow in trays on a warm windowsill, or stick with broad beans and peas.' };
};

const TONE: Record<Tone, string> = {
  go: 'bg-emerald-50 border-emerald-200',
  ok: 'bg-slate-50 border-slate-200',
  warn: 'bg-orange-50 border-orange-200',
};
const DOT: Record<Tone, string> = { go: 'bg-emerald-600', ok: 'bg-slate-400', warn: 'bg-orange-500' };

const NoteRow: React.FC<{ note: Note }> = ({ note }) => (
  <div className={`rounded-2xl border px-4 py-3 ${TONE[note.tone]}`}>
    <p className="font-semibold text-slate-900 flex items-center gap-2">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${DOT[note.tone]}`} />{note.title}
    </p>
    <p className="text-sm text-slate-600 mt-0.5 pl-4">{note.text}</p>
  </div>
);

const TodayPanel: React.FC = () => {
  const moist = useEntity('sensor.garden_soil_moisture');
  const temp = useEntity('sensor.garden_temperature');
  const days = useGardenWeather();
  const notes = [
    wateringNote(num(moist?.state), days),
    ...weatherNotes(days),
    soilWarmth(num(temp?.state)),
  ].filter(Boolean) as Note[];
  return (
    <Panel title="Today in the garden" className="h-full">
      {notes.length ? (
        <div className="space-y-2.5">{notes.map(n => <NoteRow key={n.title} note={n} />)}</div>
      ) : (
        <p className="text-slate-500">{days === null ? 'Checking the forecast…' : "The garden sensor hasn't checked in yet."}</p>
      )}
    </Panel>
  );
};

const List: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <div>
    <h3 className="text-sm font-semibold text-slate-600 mb-2">{title}</h3>
    <ul className="flex flex-wrap gap-1.5">
      {items.map(i => (
        <li key={i} className="px-3 py-1.5 rounded-full bg-slate-100 text-[15px] text-slate-800">{i}</li>
      ))}
    </ul>
  </div>
);

const MonthPanel: React.FC = () => {
  const now = new Date().getMonth();
  const [month, setMonth] = useState(now);
  const g = MONTHS[month];
  const step = (d: number) => setMonth(m => (m + d + 12) % 12);
  return (
    <Panel
      title={month === now ? `This month: ${MONTH_NAMES[month]}` : MONTH_NAMES[month]}
      action={
        <div className="flex items-center gap-1">
          {month !== now && (
            <button onClick={() => setMonth(now)} className="h-10 px-3 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-50">This month</button>
          )}
          <button onClick={() => step(-1)} aria-label="Previous month" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center active:bg-slate-200">
            <HomeIcons.Chevron className="w-5 h-5 rotate-180" />
          </button>
          <button onClick={() => step(1)} aria-label="Next month" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center active:bg-slate-200">
            <HomeIcons.Chevron className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <p className="text-slate-700 leading-relaxed max-w-3xl">{g.job}</p>
      <div className="grid md:grid-cols-3 gap-5 mt-5">
        <List title="Sow seeds" items={g.sow} />
        <List title="Plant out" items={g.plant} />
        <List title="Ready to pick" items={g.harvest} />
      </div>
    </Panel>
  );
};

const LocalPanel: React.FC = () => (
  <Panel title="Growing in Waikanae">
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
      {LOCAL.map(f => (
        <div key={f.title}>
          <h3 className="font-semibold text-slate-900">{f.title}</h3>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">{f.text}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-slate-400 mt-5">Climate figures: NIWA, Paraparaumu Airport station, 1981–2010.</p>
  </Panel>
);

const GardenView: React.FC = () => (
  <div className="space-y-6 max-w-6xl">
    <div className="grid lg:grid-cols-2 gap-6 items-stretch">
      <TodayPanel />
      <GardenCard className="h-full" />
    </div>
    <MonthPanel />
    <LocalPanel />
  </div>
);

export default GardenView;
