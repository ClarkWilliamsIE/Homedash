// components/ui.tsx
// Shared building blocks for the Homedash look (oat paper, kawakawa green, Young Serif headings).

import React, { useEffect, useSyncExternalStore } from 'react';
import { recordItem, useItemSuggestions } from '../lib/items';

// --- Is this a phone-sized screen? ---
const PHONE_QUERY = '(max-width: 767px)';
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const useIsPhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches);

// --- Page title ---
export const PageTitle: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5 md:mb-7">
    <div className="min-w-0">
      <h1 className="font-display text-[2rem] leading-tight md:text-4xl text-slate-900">{title}</h1>
      {subtitle && <p className="text-slate-500 font-medium mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

// --- Panel (a card with an optional serif heading) ---
export const Panel: React.FC<{
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, action, className = '', bodyClassName = '', children }) => (
  <section className={`bg-white rounded-3xl border border-slate-200/70 shadow-sm ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 px-5 md:px-6 pt-5">
        {title && <h2 className="font-display text-xl text-slate-900">{title}</h2>}
        {action}
      </div>
    )}
    <div className={`p-5 md:p-6 ${title || action ? 'pt-4' : ''} ${bodyClassName}`}>{children}</div>
  </section>
);

// --- Buttons ---
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'clay';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-700 text-white hover:bg-indigo-800 shadow-sm',
  secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-rose-700 hover:bg-rose-50',
  clay: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm',
};
const SIZES = { sm: 'h-9 px-3 text-sm rounded-xl gap-1.5', md: 'h-11 px-4 text-[15px] rounded-2xl gap-2', lg: 'h-14 px-6 text-base rounded-2xl gap-2.5' };

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof SIZES;
  icon?: React.ReactNode;
}> = ({ variant = 'primary', size = 'md', icon, className = '', children, ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
  >
    {icon}
    {children}
  </button>
);

// --- Sheet: slides up from the bottom on phones, a centred dialog on bigger screens ---
export const Sheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ open, onClose, title, footer, wide, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className={`relative bg-white w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-xl'} max-h-[92dvh] md:max-h-[88dvh] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 pt-4 pb-3 border-b border-slate-100">
          <div className="md:hidden absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-slate-200" />
          <h2 className="font-display text-xl text-slate-900 truncate pt-1">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4">{children}</div>
        {footer && <div className="px-5 md:px-6 pt-3 border-t border-slate-100 pb-safe-4">{footer}</div>}
      </div>
    </div>
  );
};

// --- Small pieces ---
export const Pill: React.FC<{ tone?: 'green' | 'clay' | 'honey' | 'plain'; children: React.ReactNode; className?: string }> = ({ tone = 'plain', children, className = '' }) => {
  const tones = {
    green: 'bg-indigo-50 text-indigo-700',
    clay: 'bg-orange-50 text-orange-700',
    honey: 'bg-amber-100 text-amber-800',
    plain: 'bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
};

export const EmptyState: React.FC<{ title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <div className="text-center py-10 px-6 rounded-3xl border border-dashed border-slate-300">
    <p className="font-display text-xl text-slate-800">{title}</p>
    {children && <p className="text-slate-500 mt-1">{children}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Icon = {
  Home: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>,
  Week: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>,
  Book: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /><path d="M9 7h6M9 11h4" /></svg>,
  Basket: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 11 4-7M19 11l-4-7" /><path d="M2 11h20l-1.6 8.1a2 2 0 0 1-2 1.9H5.6a2 2 0 0 1-2-1.9Z" /><path d="M9 15v2M15 15v2" /></svg>,
  More: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  Plus: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  Search: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  Heart: (p: { className?: string; filled?: boolean }) => <svg className={p.className} viewBox="0 0 24 24" fill={p.filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" /></svg>,
  Check: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  Back: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>,
  Next: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>,
  Cloud: (p: { className?: string }) => <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" /><path d="m2 2 20 20" /></svg>,
};

// --- A meal's photo, or for a one-off meal with no photo, a plain tile with its first letter ---
export const MealPhoto: React.FC<{ meal: { name: string; imageUrl?: string; isCustom?: boolean }; className?: string; big?: boolean }> = ({ meal, className = '', big }) =>
  meal.imageUrl && !meal.isCustom
    ? <img src={meal.imageUrl} alt="" className={`object-cover ${className}`} />
    : (
      <span aria-hidden className={`flex items-center justify-center bg-orange-100 text-orange-700 font-display ${big ? 'text-7xl' : 'text-xl'} ${className}`}>
        {meal.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );

/** Make a one-off meal (title + a few things to buy) that sits on the plan like a recipe. */
export const makeCustomMeal = (name: string, items: string[], id?: string) => ({
  id: id || `custom-${Date.now()}`,
  name: name.trim(),
  ingredients: items.map(i => i.trim()).filter(Boolean).map(item => ({ amount: '', unit: '', item })),
  instructions: [],
  imageUrl: '',
  tags: [],
  isCustom: true,
});

/** Form for a one-off meal: a title and a few things to buy, one per line. */
export const CustomMealForm: React.FC<{
  initial?: { name: string; items: string[] };
  submitLabel: string;
  onSubmit: (name: string, items: string[]) => void;
}> = ({ initial, submitLabel, onSubmit }) => {
  const [name, setName] = React.useState(initial?.name || '');
  const [items, setItems] = React.useState<string[]>(initial?.items?.length ? [...initial.items, ''] : ['', '']);
  const setItem = (i: number, v: string) => setItems(prev => {
    const next = prev.map((x, j) => (j === i ? v : x));
    // Always keep one empty line ready for the next item.
    if (next[next.length - 1].trim()) next.push('');
    return next;
  });
  const field = 'w-full h-12 bg-slate-100 rounded-2xl px-4 text-[16px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200';
  return (
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit(name, items.filter(i => i.trim())); }} className="space-y-4 pb-2">
      <div>
        <label htmlFor="cm-name" className="block text-sm font-semibold text-slate-700 mb-1.5">What's for dinner?</label>
        <input id="cm-name" autoFocus className={field} value={name} onChange={e => setName(e.target.value)} placeholder="BBQ at the Smiths" />
      </div>
      <div>
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">Things to buy or bring (optional)</span>
        <div className="space-y-2">
          {items.map((it, i) => (
            <input key={i} aria-label={`Item ${i + 1}`} className={field} value={it} onChange={e => setItem(i, e.target.value)} placeholder={i === 0 ? 'Sausages' : i === 1 ? 'Potato salad' : 'Another item'} />
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-2">These go on the shopping list.</p>
      </div>
      <Btn type="submit" size="lg" className="w-full" disabled={!name.trim()}>{submitLabel}</Btn>
    </form>
  );
};

/** "Add an item" box that suggests things as you type (tap a suggestion to add it straight away). */
export const AddItemBar: React.FC<{
  onAdd: (name: string) => void;
  exclude?: string[];
  placeholder: string;
  label: string;
  tinted?: boolean;
  remember?: boolean;
}> = ({ onAdd, exclude = [], placeholder, label, tinted, remember = true }) => {
  const [text, setText] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const suggestions = useItemSuggestions(text, exclude);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const tidy = name.charAt(0).toUpperCase() + name.slice(1);
    if (remember) recordItem(tidy);
    onAdd(tidy);
    setText('');
    inputRef.current?.focus();
  };
  return (
    <div>
      <form onSubmit={e => { e.preventDefault(); add(text); }} className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          className={`flex-1 min-w-0 h-12 rounded-2xl px-4 text-[16px] outline-none ${tinted ? 'bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-200' : 'bg-white border border-slate-200 focus:border-indigo-500'}`}
        />
        <Btn type="submit" className="!h-12 w-12 !px-0 shrink-0" aria-label={label} icon={<Icon.Plus className="w-5 h-5" />} />
      </form>
      {(focused || text) && suggestions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 -mx-1 px-1" role="listbox" aria-label="Suggestions">
          {suggestions.map(sug => (
            <button
              key={sug}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={e => e.preventDefault()}
              onClick={() => add(sug)}
              className="shrink-0 h-10 px-4 rounded-full bg-indigo-50 text-indigo-800 font-medium whitespace-nowrap border border-indigo-100 active:bg-indigo-100"
            >
              {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
