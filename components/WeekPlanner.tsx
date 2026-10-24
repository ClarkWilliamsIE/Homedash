// components/WeekPlanner.tsx
// The week's dinners, starting from today. Tap a meal to view it, move it to another day,
// or take it off the plan; tap "Add" on a day to choose a recipe.

import React, { useState } from 'react';
import { Recipe, WeeklyPlan } from '../types';
import RecipePicker from './RecipePicker';
import { Btn, CustomMealForm, Icon, MealPhoto, PageTitle, Sheet, makeCustomMeal } from './ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface WeekPlannerProps {
  weeklyPlan: WeeklyPlan;
  recipes: Recipe[];
  onAddMeal: (day: string, recipe: Recipe) => void;
  onRemoveMeal: (day: string, recipeId: string) => void;
  onUpdateMeal: (day: string, meal: Recipe) => void;
  onMoveMeal: (source: string, target: string, recipeId: string) => void;
  onViewRecipe: (recipe: Recipe) => void;
  onResetWeek: () => void;
  onOpenShopping: () => void;
  shoppingLeft: number;
}

const WeekPlanner: React.FC<WeekPlannerProps> = ({
  weeklyPlan, recipes, onAddMeal, onRemoveMeal, onUpdateMeal, onMoveMeal, onViewRecipe, onResetWeek, onOpenShopping, shoppingLeft,
}) => {
  const [pickingDay, setPickingDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ day: string; recipe: Recipe } | null>(null);
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);

  const todayIdx = new Date().getDay();
  // Today first, then the rest of the week in order.
  const order = Array.from({ length: 7 }, (_, i) => DAYS[(todayIdx + i) % 7]);
  const fresh = (r: Recipe) => recipes.find(x => x.id === r.id) || r;
  const planned = Object.values(weeklyPlan).flat().length;
  const dateFor = (offset: number) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
  };

  const closeSheet = () => { setSelected(null); setMoving(false); setEditing(false); };

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <PageTitle
        title="This week"
        subtitle={planned ? `${planned} meal${planned === 1 ? '' : 's'} planned` : 'Nothing planned yet'}
        actions={
          <>
            {shoppingLeft > 0 && <Btn variant="secondary" onClick={onOpenShopping} icon={<Icon.Basket className="w-4 h-4" />}>{shoppingLeft} to buy</Btn>}
            <Btn variant="ghost" onClick={onResetWeek}>Start a new week</Btn>
          </>
        }
      />

      <ol className="space-y-3">
        {order.map((day, offset) => {
          const meals = (weeklyPlan[day] || []).map(fresh);
          const isToday = offset === 0;
          return (
            <li key={day} className={`rounded-3xl border ${isToday ? 'bg-white border-indigo-200 shadow-sm' : 'bg-white/70 border-slate-200/70'}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 p-3 md:p-4">
                <div className="flex items-baseline justify-between md:block md:w-40 shrink-0 px-2 md:px-1">
                  <div>
                    <h2 className={`font-display text-2xl leading-tight ${isToday ? 'text-indigo-700' : 'text-slate-900'}`}>{offset === 0 ? 'Tonight' : offset === 1 ? 'Tomorrow' : day}</h2>
                    <p className="text-sm text-slate-500">{offset < 2 ? `${day} ${dateFor(offset)}` : dateFor(offset)}</p>
                  </div>
                  <button onClick={() => setPickingDay(day)} className="md:hidden h-9 px-3 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-indigo-50 flex items-center gap-1">
                    <Icon.Plus className="w-4 h-4" /> Add
                  </button>
                </div>

                <div className="flex-1 min-w-0 flex flex-col md:flex-row md:flex-wrap gap-2">
                  {meals.map(meal => (
                    <button
                      key={meal.id}
                      onClick={() => setSelected({ day, recipe: meal })}
                      className="flex items-center gap-3 p-1.5 pr-4 rounded-2xl bg-slate-50 hover:bg-indigo-50 text-left md:max-w-xs min-w-0"
                    >
                      <MealPhoto meal={meal} className="w-14 h-14 rounded-xl shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900 leading-snug line-clamp-2">{meal.name}</span>
                        {meal.isCustom
                          ? meal.ingredients.length > 0 && <span className="block text-sm text-slate-500 truncate">{meal.ingredients.map(i => i.item).join(', ')}</span>
                          : meal.tags[0] && <span className="block text-sm text-slate-500 truncate">{meal.tags[0]}</span>}
                      </span>
                    </button>
                  ))}
                  {meals.length === 0 && (
                    <button onClick={() => setPickingDay(day)} className="md:hidden flex items-center gap-3 p-1.5 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-left">
                      <span className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center"><Icon.Plus className="w-5 h-5" /></span>
                      <span className="font-medium">Choose a recipe</span>
                    </button>
                  )}
                  <button onClick={() => setPickingDay(day)} className={`hidden md:flex items-center gap-2 h-[4.25rem] px-5 rounded-2xl text-sm font-semibold ${meals.length ? 'text-slate-500 hover:bg-slate-100' : 'border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-700'}`}>
                    <Icon.Plus className="w-4 h-4" /> {meals.length ? 'Add' : 'Choose a recipe'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {pickingDay && (
        <RecipePicker
          title={`Dinner for ${pickingDay}`}
          recipes={recipes}
          onSelect={r => { onAddMeal(pickingDay, r); setPickingDay(null); }}
          onClose={() => setPickingDay(null)}
        />
      )}

      <Sheet open={!!selected} onClose={closeSheet} title={selected ? (moving ? `Move to…` : editing ? 'Edit' : selected.recipe.name) : ''}>
        {selected && !moving && !editing && (
          <div className="space-y-2 pb-2">
            {selected.recipe.isCustom ? (
              selected.recipe.ingredients.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm font-semibold text-slate-700 mb-1.5">On the shopping list</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {selected.recipe.ingredients.map((i, k) => <li key={k} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{i.item}</li>)}
                  </ul>
                </div>
              )
            ) : (
              <MealPhoto meal={selected.recipe} className="w-full h-40 rounded-2xl mb-3" />
            )}
            {selected.recipe.isCustom
              ? <Btn size="lg" className="w-full" onClick={() => setEditing(true)} icon={<Icon.Plus className="w-5 h-5" />}>Edit title and items</Btn>
              : <Btn size="lg" className="w-full" onClick={() => { onViewRecipe(selected.recipe); closeSheet(); }} icon={<Icon.Book className="w-5 h-5" />}>View recipe</Btn>}
            <Btn size="lg" variant="secondary" className="w-full" onClick={() => setMoving(true)} icon={<Icon.Week className="w-5 h-5" />}>Move to another day</Btn>
            <Btn size="lg" variant="danger" className="w-full" onClick={() => { onRemoveMeal(selected.day, selected.recipe.id); closeSheet(); }}>Take off {selected.day}</Btn>
          </div>
        )}
        {selected && editing && (
          <CustomMealForm
            initial={{ name: selected.recipe.name, items: selected.recipe.ingredients.map(i => i.item) }}
            submitLabel="Save"
            onSubmit={(name, items) => { onUpdateMeal(selected.day, makeCustomMeal(name, items, selected.recipe.id) as Recipe); closeSheet(); }}
          />
        )}
        {selected && moving && (
          <div className="grid grid-cols-2 gap-2 pb-2">
            {order.filter(d => d !== selected.day).map(d => (
              <Btn key={d} size="lg" variant="secondary" onClick={() => { onMoveMeal(selected.day, d, selected.recipe.id); closeSheet(); }}>{d}</Btn>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default WeekPlanner;
