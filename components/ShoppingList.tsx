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
  clearedIngredients: string[];
  onUpdateCleared: (items: string[]) => void;
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
  clearedIngredients,
  onUpdateCleared,
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
        const clean = ing.item.toLowerCase().trim();
        // Item is hidden if it's a permanent staple OR it was marked as bought for this week
        if (!hiddenIngredients.includes(clean) && !clearedIngredients.includes(clean)) {
          list[clean] = (list[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(list).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedRecipes, hiddenIngredients, clearedIngredients]);

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

        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/ShoppingList!A:C:clear`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` }
        });

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
    
    // If we're manually adding something that was previously bought/cleared,
    // we should bring it back into view.
    const clean = manualItem.toLowerCase().trim();
    onUpdateCleared(clearedIngredients.filter(i => i !== clean));
    
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
    // Move checked recipe items into the "bought this week" list
    onUpdateCleared([...clearedIngredients, ...checkedIngredients]);
    onUpdateChecked([]);
  };

  const restoreWeeklyItems = () => {
    if (confirm("Restore all items marked as bought for this plan?")) {
      onUpdateCleared([]);
    }
  };

  const checkedCount = manualItems.filter(i => i.checked).length + checkedIngredients.length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-10 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Shopping List</h3>
            <p className="text-slate-500 font-medium">
              {sheetSyncStatus === 'syncing' ? (
                <span className="text-indigo-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></span>
                  Syncing to Sheet...
                </span>
              ) : (
                <span className="text-green-600 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Sheet Updated
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
             {clearedIngredients.length > 0 && (
               <button onClick={restoreWeeklyItems} className="px-5 py-3 text-xs font-black text-indigo-600 bg-white border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-all uppercase tracking-widest">
                 Restore All
               </button>
             )}
             {checkedCount > 0 && (
               <button 
                 onClick={clearSelected} 
                 className="px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2 shadow-sm"
               >
                 Clear Bought ({checkedCount})
               </button>
             )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="flex gap-2">
            <input type="text" placeholder="Add extra milk, bread..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" value={manualItem} onChange={e => setManualItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualItem()} />
            <button onClick={addManualItem} className="px-6 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md active:scale-95 transition-all">Add</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Manual Items */}
            <section className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Extra Items</h4>
               <div className="space-y-2">
                 {manualItems.length === 0 ? <p className="text-sm text-slate-300 italic">No extra items added.</p> : manualItems.map(item => (
                   <div key={item.id} className="flex items-center gap-3 group cursor-pointer" onClick={() => toggleManualItem(item.id)}>
                     <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                        {item.checked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                     </div>
                     <span className={`flex-1 text-sm transition-all ${item.checked ? 'line-through text-slate-300' : 'text-slate-700 font-medium'}`}>{item.name}</span>
                   </div>
                 ))}
               </div>
            </section>

            {/* Aggregated Recipe Items */}
            <section className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Recipe Ingredients</h4>
               <div className="space-y-2">
                 {aggregatedIngredients.length === 0 ? <p className="text-sm text-slate-300 italic">Everything is in the trolley!</p> : aggregatedIngredients.map(([item, count]) => {
                   const isChecked = checkedIngredients.includes(item);
                   return (
                     <div key={item} className="flex items-center gap-3 cursor-pointer group" onClick={() => toggleRecipeItem(item)}>
                       <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                          {isChecked && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                       </div>
                       <span className={`flex-1 text-sm capitalize transition-all ${isChecked ? 'line-through text-slate-300' : 'text-slate-700 font-medium'}`}>{item}</span>
                       {count > 1 && <span className="text-[10px] bg-indigo-50 text-indigo-600 font-black px-2 py-0.5 rounded-full">x{count}</span>}
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
