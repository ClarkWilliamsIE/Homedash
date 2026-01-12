import React, { useMemo, useState } from 'react';
import { WeeklyPlan, Recipe } from '../types';
import { SPREADSHEET_ID } from '../constants';
import { ManualItem } from '../App';

interface ShoppingListProps {
  weeklyPlan: WeeklyPlan;
  authToken: string | null;
  // NEW PROPS for Syncing
  manualItems: ManualItem[];
  onUpdateItems: (items: ManualItem[]) => void;
}

const ShoppingList: React.FC<ShoppingListProps> = ({ weeklyPlan, authToken, manualItems, onUpdateItems }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [manualItem, setManualItem] = useState('');

  // NOTE: LocalStorage effect removed because App.tsx handles the sync now!

  const selectedRecipes = useMemo(() => {
    return Object.values(weeklyPlan).filter(r => r !== null) as Recipe[];
  }, [weeklyPlan]);

  const aggregatedIngredients = useMemo(() => {
    const list: Record<string, number> = {};
    selectedRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
        const clean = ing.toLowerCase().trim();
        list[clean] = (list[clean] || 0) + 1;
      });
    });
    return Object.entries(list).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedRecipes]);

  const addManualItem = () => {
    if (!manualItem.trim()) return;
    // Update parent state directly
    onUpdateItems([...manualItems, { id: Date.now().toString(), name: manualItem.trim(), checked: false }]);
    setManualItem('');
  };

  const toggleManualItem = (id: string) => {
    onUpdateItems(manualItems.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const removeManualItem = (id: string) => {
    onUpdateItems(manualItems.filter(i => i.id !== id));
  };

  // This saves the "Receipt" to the main list (historical record)
  // The state itself is already saved by App.tsx to SyncData
  const saveToSheet = async () => {
    if (!authToken) {
      alert("Please sign in to save your list to Google Sheets.");
      return;
    }
    setIsSaving(true);
    try {
      const values = [
        ['Date', new Date().toLocaleDateString()],
        ['Category', 'Item'],
        ...aggregatedIngredients.map(([item]) => ['Recipe Ingredient', item]),
        ...manualItems.map(item => ['Manual Add', item.name])
      ];

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/ShoppingList!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });

      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
         const errorData = await res.json();
         console.error("FULL API ERROR:", errorData);
         alert(`Save failed: ${errorData.error?.message || "Unknown error"}`);
         setSaveStatus('error');
      }
    } catch (err) { 
      console.error(err); 
      setSaveStatus('error'); 
    } finally { 
      setIsSaving(false); 
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Shopping List</h3>
            <p className="text-slate-500 font-medium">{selectedRecipes.length} recipes + {manualItems.length} custom items</p>
          </div>
          <button onClick={saveToSheet} disabled={isSaving} className={`px-6 py-3 rounded-xl font-bold transition-all ${saveStatus === 'success' ? 'bg-green-500 text-white' : saveStatus === 'error' ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50'}`}>
            {isSaving ? 'Syncing...' : saveStatus === 'success' ? 'Synced!' : 'Export to Sheets'}
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex gap-2">
            <input type="text" placeholder="Add extra milk, bread..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" value={manualItem} onChange={e => setManualItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualItem()} />
            <button onClick={addManualItem} className="px-6 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100">Add</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Extra Items</h4>
               <div className="space-y-2">
                 {manualItems.length === 0 ? <p className="text-sm text-slate-300 italic">No custom items added.</p> : manualItems.map(item => (
                   <div key={item.id} className="flex items-center gap-3 group">
                     <input type="checkbox" checked={item.checked} onChange={() => toggleManualItem(item.id)} className="w-5 h-5 rounded border-slate-300 text-indigo-600" />
                     <span className={`flex-1 text-sm ${item.checked ? 'line-through text-slate-300' : 'text-slate-700'}`}>{item.name}</span>
                     <button onClick={() => removeManualItem(item.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">✕</button>
                   </div>
                 ))}
               </div>
            </section>

            <section className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">From Recipes</h4>
               <div className="space-y-2">
                 {aggregatedIngredients.map(([item, count]) => (
                   <div key={item} className="flex items-center gap-3">
                     <div className="w-5 h-5 border border-slate-200 rounded" />
                     <span className="flex-1 text-sm text-slate-700 capitalize">{item}</span>
                     {count > 1 && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 rounded-full">x{count}</span>}
                   </div>
                 ))}
               </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShoppingList;
