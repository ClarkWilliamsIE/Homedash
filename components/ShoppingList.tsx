// components/ShoppingList.tsx

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { WeeklyPlan, Recipe } from '../types';
import { ManualItem } from '../App';

interface ShoppingListProps {
  weeklyPlan: WeeklyPlan;
  authToken: string | null;
  spreadsheetId: string | null;
  manualItems: ManualItem[];
  onUpdateItems: (items: ManualItem[]) => void;
  hiddenIngredients: string[];
  onUpdateHidden: (items: string[]) => void;
  checkedIngredients: string[];
  onUpdateChecked: (items: string[]) => void;
}

const ShoppingList: React.FC<ShoppingListProps> = ({ 
  weeklyPlan, 
  authToken, 
  spreadsheetId,
  manualItems, 
  onUpdateItems,
  hiddenIngredients,
  onUpdateHidden,
  checkedIngredients,
  onUpdateChecked
}) => {
  const [manualItem, setManualItem] = useState('');
  const [sheetSyncStatus, setSheetSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  
  const syncTimeout = useRef<any>(null);

  const selectedRecipes = useMemo(() => {
    return Object.values(weeklyPlan).flat();
  }, [weeklyPlan]);

  const aggregatedIngredients = useMemo(() => {
    const list: Record<string, number> = {};
    selectedRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
        // Access 'item' because 'ing' is now an object { amount, unit, item }
        const clean = ing.item.toLowerCase().trim();
        if (!hiddenIngredients.includes(clean)) {
          list[clean] = (list[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(list).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedRecipes, hiddenIngredients]);

  // -- SHEET SYNC LOGIC --
  useEffect(() => {
    if (!authToken || !spreadsheetId) return;

    if (syncTimeout.current) clearTimeout(syncTimeout.current);

    setSheetSyncStatus('syncing');
    
    syncTimeout.current = setTimeout(async () => {
      try {
        const values = [
          ['Date', new Date().toLocaleDateString()],
          ['Category', 'Item'],
          ...aggregatedIngredients.map(([item, count]) => ['Recipe', `${item} ${count > 1 ? `(x${count})` : ''}`]),
          ...manualItems.map(item => ['Manual', item.name])
        ];

        // Clear the sheet
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ShoppingList!A:C:clear`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` }
        });

        // Write the fresh list
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ShoppingList!A1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values })
        });
        
        setSheetSyncStatus('idle');
      } catch (err) {
        console.error("Sheet sync failed", err);
        setSheetSyncStatus('error');
      }
    }, 3000);

    return () => clearTimeout(syncTimeout.current);
  }, [aggregatedIngredients, manualItems, authToken, spreadsheetId]);


  // -- INTERACTION HANDLERS --

  const addManualItem = () => {
    if (!manualItem.trim()) return;
    onUpdateItems([...manualItems, { id: Date.now().toString(), name: manualItem.trim(), checked: false }]);
    setManualItem('');
  };

  const toggleManualItem = (id: string) => {
    onUpdateItems(manualItems.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const toggleRecipeItem = (name: string) => {
    if (checkedIngredients.includes(name)) {
      onUpdateChecked(checkedIngredients.filter(i => i !== name));
    } else {
      onUpdateChecked([...checkedIngredients, name]);
    }
  };

  const clearSelected = () => {
    onUpdateItems(manualItems.filter(i => !i.checked));
    onUpdateHidden([...hiddenIngredients, ...checkedIngredients]);
    onUpdateChecked([]);
  };

  const restoreHidden = () => {
    if (confirm("Restore all cleared recipe items?")) {
      onUpdateHidden([]);
    }
  };

  const checkedCount = manualItems.filter(i => i.checked).length + checkedIngredients.length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Shopping List</h3>
            <p className="text-slate-500 font-medium">
              {sheetSyncStatus === 'syncing' ? (
                <span className="text-indigo-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></span>
                  Syncing to Sheet...
                </span>
              ) : sheetSyncStatus === 'error' ? (
                <span className="text-red-500">Sync Error (Check Console)</span>
              ) : (
                <span className="text-green-600 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Sheet Updated
                </span>
              )}
            </p>
          </div>
          {checkedCount > 0 && (
            <button 
              onClick={clearSelected} 
              className="px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Clear Selected ({checkedCount})
            </button>
          )}
        </div>

        <div className="p-8 space-y-8">
          <div className="flex gap-2">
            <input type="text" placeholder="Add extra milk, bread..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" value={manualItem} onChange={e => setManualItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualItem()} />
            <button onClick={addManualItem} className="px-6 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100">Add</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Manual Items */}
            <section className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Extra Items</h4>
               <div className="space-y-2">
                 {manualItems.length === 0 ? <p className="text-sm text-slate-300 italic">No custom items added.</p> : manualItems.map(item => (
                   <div key={item.id} className="flex items-center gap-3 group cursor-pointer" onClick={() => toggleManualItem(item.id)}>
                     <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                        {item.checked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                     </div>
                     <span className={`flex-1 text-sm transition-all ${item.checked ? 'line-through text-slate-300' : 'text-slate-700'}`}>{item.name}</span>
                   </div>
                 ))}
               </div>
            </section>

            {/* Aggregated Recipe Items */}
            <section className="space-y-4">
               <div className="flex justify-between items-center">
                 <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">From Recipes</h4>
                 {hiddenIngredients.length > 0 && (
                   <button onClick={restoreHidden} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600">Restore Cleared</button>
                 )}
               </div>
               <div className="space-y-2">
                 {aggregatedIngredients.length === 0 ? <p className="text-sm text-slate-300 italic">No ingredients needed.</p> : aggregatedIngredients.map(([item, count]) => {
                   const isChecked = checkedIngredients.includes(item);
                   return (
                     <div key={item} className="flex items-center gap-3 cursor-pointer group" onClick={() => toggleRecipeItem(item)}>
                       <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                          {isChecked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                       </div>
                       <span className={`flex-1 text-sm capitalize transition-all ${isChecked ? 'line-through text-slate-300' : 'text-slate-700'}`}>{item}</span>
                       {count > 1 && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 rounded-full">x{count}</span>}
                     </div>
                   );
                 })}
               </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShoppingList;
