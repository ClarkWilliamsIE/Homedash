// components/NewWorld.tsx
// The supermarket parts of the Shopping screen (New World or PAK'nSAVE): the product and price
// beside each item, the estimated total and the other store's total, choosing a different product,
// and sending the list to your online trolley. Prices come from lib/newworld.ts. The trolley is
// filled by the Homedash script or bookmark in your own logged-in tab; Homedash never has your login.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Icon, Pill, Sheet } from './ui';
import {
  Banner, Comparison, NwChoice, NwProduct, NwRowMatch, NwState, STORES, TrolleyLine, setBanner, useBanner, useStore,
  defaultQty, estimateCents, money, nwKey, priceText, productLabel, qtyStep, qtyText, rememberProduct, shelfText,
  searchProducts, searchTerm, setPickMode, trolleyLine, trolleyLink, trolleyPayload, usePickMode,
} from '../lib/newworld';
import { NW_BOOKMARKLET_CODE, NW_BOOKMARKLET_URL } from '../lib/nwBookmarklet';
import { apiUrl } from '../lib/runtime';

const BOOKMARK_NAME = 'Fill trolley from Homedash';

/** Copy text, including inside Home Assistant's app where the modern clipboard can be blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

const SpecialPill: React.FC<{ product: NwProduct }> = ({ product }) =>
  product.special ? <Pill tone="honey" className="!py-0.5 !px-2">{product.special.label}</Pill> : null;

/** The product and price at the right-hand end of a shopping-list row. Tap to choose another. */
export const NwRowDetail: React.FC<{ itemName: string; match?: NwRowMatch; onOpen: () => void }> = ({ itemName, match, onOpen }) => {
  if (!match) return null;
  const p = match.product;
  let top: React.ReactNode, bottom: React.ReactNode = null;
  if (match.skipped) {
    top = <span className="text-sm text-slate-400">Skipped</span>;
  } else if (p) {
    top = (
      <span className="flex items-center justify-end gap-1.5">
        {p.special && <SpecialPill product={p} />}
        {!p.special && p.price != null && <span className="text-[15px] font-semibold text-slate-800">{priceText(p)}</span>}
      </span>
    );
    bottom = <span className={`block text-xs truncate ${match.chosen ? 'text-slate-500' : 'text-slate-400 italic'}`}>{productLabel(p)}</span>;
  } else if (match.loading) {
    top = <span className="text-sm text-slate-300">…</span>;
  } else {
    top = <span className="text-sm font-semibold text-indigo-700">Choose</span>;
  }
  return (
    <button
      onClick={onOpen}
      aria-label={`Supermarket product for ${itemName}`}
      className="shrink-0 max-w-[46%] md:max-w-[13rem] min-h-[3.5rem] pl-2 pr-4 py-2 text-right hover:bg-slate-50 active:bg-indigo-50"
    >
      {top}
      {bottom}
    </button>
  );
};

/** Amounts changed for this shop: item → count (or grams). 0 means "leave it out this time". */
export type TrolleyQty = Record<string, number>;

export interface TrolleyRow {
  item: string;
  key: string;
  match?: NwRowMatch;
  product?: NwProduct;
  /** Count, or grams for things only sold by weight. 0 = left out of this shop. */
  qty: number;
}

/** What would go to the trolley for these items, and roughly what it costs. */
export function useTrolley(itemNames: string[], nw: NwState, qty: TrolleyQty = {}) {
  return useMemo(() => {
    const rows: TrolleyRow[] = [];
    const byProduct = new Map<string, TrolleyLine & { product: NwProduct }>();
    let total = 0, unpriced = 0, unmatched = 0;
    for (const item of itemNames) {
      const key = nwKey(item);
      const m = nw.matches.get(key);
      const p = m?.skipped ? undefined : m?.product;
      const usable = !!p && p.online;
      const q = usable ? (qty[key] ?? defaultQty(p!)) : 0;
      rows.push({ item, key, match: m, product: p, qty: q });
      if (m?.skipped) continue;
      if (!usable) { if (!m?.loading) unmatched++; continue; }
      if (q <= 0) continue;
      // Two list items that are the same product share one trolley line.
      const existing = byProduct.get(p!.id);
      if (existing) existing.q += q;
      else byProduct.set(p!.id, { ...trolleyLine(p!, productLabel(p!) || item, q), product: p! });
      const cents = estimateCents(p!, q);
      if (cents == null) unpriced++; else total += cents;
    }
    return { rows, lines: [...byProduct.values()], total, unpriced, unmatched };
  }, [itemNames.join('|'), nw.matches, qty]);
}

/** New World / PAK'nSAVE switch. */
export const StoreSwitch: React.FC = () => {
  const current = useBanner();
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Supermarket">
      {(Object.keys(STORES) as Banner[]).map(b => (
        <button
          key={b}
          onClick={() => setBanner(b)}
          aria-pressed={current === b}
          className={`h-9 px-3 rounded-xl text-sm font-semibold ${current === b ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-200/60'}`}
        >
          {STORES[b].short}
        </button>
      ))}
    </div>
  );
};

/** "Same items at PAK'nSAVE: about $4.20 less". */
const CompareLine: React.FC<{ compare: Comparison }> = ({ compare }) => {
  const { store, here, there, compared, missing, loading } = compare;
  if (!compared) {
    return loading ? <p className="text-sm text-slate-500">Checking {store.short} prices…</p> : null;
  }
  const diff = there - here;
  const verdict = Math.abs(diff) < 50
    ? <>about the same at {store.short}</>
    : <>{diff < 0 ? 'about ' : ''}<b className={diff < 0 ? 'text-emerald-700' : ''}>{money(Math.abs(diff))} {diff < 0 ? 'less' : 'more'}</b> at {store.short}</>;
  return (
    <p className="text-sm text-slate-600 mt-0.5">
      Same items: {verdict}
      <span className="text-slate-400">
        {' '}({compared} compared{missing ? `, ${missing} not sold there` : ''})
      </span>
      {diff <= -50 && (
        <>
          {' '}<button onClick={() => setBanner(store.banner)} className="font-semibold text-indigo-700 underline underline-offset-4">Switch</button>
        </>
      )}
    </p>
  );
};

/** The card at the top of the list: which store, estimated total, the other store's total, and Fill my trolley. */
export const NwSummary: React.FC<{
  nw: NwState;
  trolley: ReturnType<typeof useTrolley>;
  compare: Comparison;
  onSend: () => void;
  onSetup: () => void;
}> = ({ nw, trolley, compare, onSend, onSetup }) => {
  const store = useStore();
  const { lines, total, unpriced, unmatched } = trolley;
  const notes = [
    unpriced ? `${unpriced} sold by weight not counted` : '',
    unmatched ? `${unmatched} not found` : '',
  ].filter(Boolean).join(', ');
  return (
    <section className="mt-3 rounded-3xl border border-slate-200/70 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <StoreSwitch />
        <p className="text-sm font-semibold text-indigo-700">{store.name}</p>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {nw.error && !lines.length ? (
            <p className="text-[15px] text-slate-600">{nw.error}</p>
          ) : lines.length ? (
            <p className="text-[17px] text-slate-900">
              <span className="font-semibold">About {money(total)}</span>
              <span className="text-slate-500"> for {lines.length} item{lines.length === 1 ? '' : 's'}</span>
            </p>
          ) : (
            <p className="text-[15px] text-slate-500">{nw.loading ? 'Looking up prices…' : 'Prices appear here as you add to the list.'}</p>
          )}
          {lines.length > 0 && <CompareLine compare={compare} />}
          {notes && lines.length > 0 && <p className="text-sm text-slate-500">{notes}</p>}
          {nw.error && lines.length > 0 && <p className="text-sm text-slate-500">Some prices couldn't be refreshed.</p>}
        </div>
        <div className="flex items-center gap-2">
          {nw.error && <Btn variant="secondary" size="sm" onClick={nw.retry}>Try again</Btn>}
          <Btn onClick={onSend} disabled={!lines.length && !unmatched} icon={<Icon.Basket className="w-4 h-4" />}>Fill my trolley</Btn>
        </div>
      </div>
      <button onClick={onSetup} className="mt-2 text-sm font-semibold text-slate-500 hover:text-indigo-700 underline underline-offset-4">
        Set up online shopping (one time)
      </button>
    </section>
  );
};

const ProductRow: React.FC<{ product: NwProduct; current: boolean; onPick: () => void }> = ({ product, current, onPick }) => (
  <li>
    <button
      onClick={onPick}
      aria-pressed={current}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left ${current ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50 active:bg-indigo-50'}`}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-medium text-slate-900">{productLabel(product)}</span>
        <span className="block text-sm text-slate-500">
          {[product.unitPrice, !product.online ? 'In store only' : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[16px] font-semibold ${product.special?.price ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900'}`}>{shelfText(product)}</span>
        {product.special && <SpecialPill product={product} />}
      </span>
      {current && <Icon.Check className="w-5 h-5 text-indigo-700 shrink-0" />}
    </button>
  </li>
);

/** Choose which product an item means. */
export const NwSwapSheet: React.FC<{
  itemName: string | null;
  match?: NwRowMatch;
  onClose: () => void;
  onChoose: (choice: NwChoice | null) => void;
}> = ({ itemName, match, onClose, onChoose }) => {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NwProduct[] | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const started = useRef('');

  useEffect(() => {
    if (!itemName) return;
    started.current = searchTerm(itemName);
    setQuery(started.current);
    setResults(null);
    setError('');
  }, [itemName, store.banner]);

  // Search a moment after typing stops. The first view uses what's already known.
  useEffect(() => {
    if (!itemName) return;
    const q = query.trim();
    if (!q || (q === started.current && results === null && (match?.suggestions.length || 0) > 0)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchProducts(q, 12);
        if (!cancelled) { setResults(found); setError(''); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || `Couldn't search ${store.short}.`);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, itemName, store.banner]);

  if (!itemName) return null;
  const key = nwKey(itemName);
  const currentId = match?.chosen && !match.skipped ? match.product?.id : undefined;
  const list = results ?? match?.suggestions ?? [];
  const pick = (p: NwProduct) => {
    rememberProduct(p);
    onChoose({ id: key, productId: p.id, label: productLabel(p), saleType: p.saleType });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${itemName} at ${store.short}`}
      footer={
        <div className="flex flex-wrap gap-2 justify-between">
          <Btn variant="ghost" onClick={() => { onChoose({ id: key, productId: '', label: '', saleType: 'UNITS' }); onClose(); }}>
            Don't buy this online
          </Btn>
          {match?.chosen && <Btn variant="ghost" onClick={() => { onChoose(null); onClose(); }}>Use the top result</Btn>}
        </div>
      }
    >
      <label className="block">
        <span className="sr-only">Search {store.short}</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${store.short}`}
          autoComplete="off"
          enterKeyHint="search"
          className="w-full h-12 rounded-2xl px-4 text-[16px] outline-none bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-200"
        />
      </label>
      <p className="text-sm text-slate-500 mt-2 mb-1">
        Pick what you usually buy. Homedash remembers it for "{itemName}" on every device.
      </p>
      {error && <p className="text-sm text-rose-700 py-2">{error}</p>}
      {searching && !list.length && <p className="text-slate-500 py-6 text-center">Searching…</p>}
      {!searching && !error && !list.length && <p className="text-slate-500 py-6 text-center">Nothing found. Try different words.</p>}
      <ul className="space-y-1 mt-1">
        {list.map(p => <ProductRow key={p.id} product={p} current={p.id === currentId} onPick={() => pick(p)} />)}
      </ul>
    </Sheet>
  );
};

const Stepper: React.FC<{ product: NwProduct; qty: number; onChange: (q: number) => void }> = ({ product, qty, onChange }) => {
  const step = qtyStep(product);
  const btn = 'w-10 h-10 flex items-center justify-center text-xl font-semibold text-indigo-700 disabled:text-slate-300';
  return (
    <div className="shrink-0 flex items-center rounded-2xl border border-slate-200 bg-white">
      <button className={btn} onClick={() => onChange(Math.max(0, qty - step))} disabled={qty <= 0} aria-label="Less">−</button>
      <span className="min-w-[2.75rem] text-center text-[15px] font-semibold text-slate-900">{qtyText(product, qty)}</span>
      <button className={btn} onClick={() => onChange(qty + step)} aria-label="More">+</button>
    </div>
  );
};

const AltChip: React.FC<{ product: NwProduct; onPick: () => void }> = ({ product, onPick }) => (
  <button
    onClick={onPick}
    className="shrink-0 max-w-[15rem] h-12 px-3 rounded-2xl border border-slate-200 bg-white text-left hover:bg-slate-50 active:bg-indigo-50"
  >
    <span className="block text-[13px] leading-tight text-slate-800 truncate">{productLabel(product)}</span>
    <span className="block text-[13px] leading-tight font-semibold text-slate-600">
      {priceText(product)}{product.special ? <span className="font-medium text-amber-700"> {product.special.club ? 'Club+' : 'special'}</span> : null}
    </span>
  </button>
);

/** The whole trolley, filled in for you: scroll through, swap anything, then send it. */
export const NwTrolleySheet: React.FC<{
  open: boolean;
  trolley: ReturnType<typeof useTrolley>;
  onQty: (key: string, qty: number) => void;
  onChoose: (item: string, choice: NwChoice | null) => void;
  onSearch: (item: string) => void;
  onClose: () => void;
  onSetup: () => void;
}> = ({ open, trolley, onQty, onChoose, onSearch, onClose, onSetup }) => {
  const [copied, setCopied] = useState(false);
  const mode = usePickMode();
  const store = useStore();
  useEffect(() => { if (open) setCopied(false); }, [open]);
  if (!open) return null;
  const { rows, lines, total, unpriced } = trolley;
  const plain: TrolleyLine[] = lines.map(({ id, q, t, n }) => ({ id, q, t, n }));
  const active = rows.filter(r => !r.match?.skipped);
  const skipped = rows.filter(r => r.match?.skipped);
  const pick = (item: string, p: NwProduct) => {
    rememberProduct(p);
    onChoose(item, { id: nwKey(item), productId: p.id, label: productLabel(p), saleType: p.saleType });
  };
  const modeBtn = (value: 'popular' | 'value', label: string) => (
    <button
      onClick={() => setPickMode(value)}
      aria-pressed={mode === value}
      className={`h-9 px-3 rounded-xl text-sm font-semibold ${mode === value ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </button>
  );
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={`Your ${store.short} trolley`}
      footer={
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-slate-800">
              <span className="text-lg font-semibold">About {money(total)}</span>
              <span className="text-slate-500"> · {lines.length} item{lines.length === 1 ? '' : 's'}{unpriced ? ', plus loose produce' : ''}</span>
            </p>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" size="sm" onClick={async () => setCopied(await copyText(`homedash=${trolleyPayload(plain, store.banner)}`))}>
                {copied ? 'Copied' : 'Copy list'}
              </Btn>
              {lines.length > 0 ? (
                <a
                  href={trolleyLink(plain, store.banner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-11 px-5 rounded-2xl text-[15px] font-semibold bg-indigo-700 text-white hover:bg-indigo-800 shadow-sm"
                >
                  Send to {store.short}
                </a>
              ) : (
                <Btn disabled>Send to {store.short}</Btn>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1.5">
            {store.short} opens and your trolley fills by itself if this browser has the Homedash script. Otherwise tap
            your <b>{BOOKMARK_NAME}</b> bookmark there.{' '}
            <button onClick={onSetup} className="font-semibold text-indigo-700 underline underline-offset-4">Set up</button>
          </p>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] text-slate-600">Filled in for you. Tap another option to swap, or change the amount.</p>
        <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="How to pick products">
          {modeBtn('popular', 'Most popular')}
          {modeBtn('value', 'Best value')}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {active.map(r => {
          const p = r.product;
          if (!p) {
            return (
              <li key={r.key} className="py-3 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{r.item}</span>
                  <span className="block text-[15px] text-slate-500">{r.match?.loading ? 'Looking…' : `Nothing found at ${store.short}`}</span>
                </span>
                <Btn variant="secondary" size="sm" onClick={() => onSearch(r.item)}>Find it</Btn>
              </li>
            );
          }
          const out = r.qty <= 0;
          const others = (r.match?.suggestions || []).filter(x => x.id !== p.id && x.online).slice(0, 5);
          return (
            <li key={r.key} className="py-3">
              <div className="flex items-center gap-3">
                <span className={`flex-1 min-w-0 ${out ? 'opacity-45' : ''}`}>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400 truncate">{r.item}</span>
                  {r.match?.notStocked && (
                    <span className="block text-xs text-amber-700">{store.short} doesn't sell your usual {r.match.notStocked}</span>
                  )}
                  <span className={`block text-[16px] font-medium text-slate-900 ${out ? 'line-through' : ''}`}>{productLabel(p)}</span>
                  <span className="flex items-center gap-2 text-[15px] text-slate-700">
                    {p.special?.price ? <span className="text-slate-400 line-through">{shelfText(p)}</span> : <span>{shelfText(p)}</span>}
                    {p.special && <SpecialPill product={p} />}
                    {!p.special && p.unitPrice && <span className="text-sm text-slate-400">{p.unitPrice}</span>}
                  </span>
                </span>
                <Stepper product={p} qty={r.qty} onChange={q => onQty(r.key, q)} />
              </div>
              {!out && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 -mx-1 px-1">
                  {others.map(x => <AltChip key={x.id} product={x} onPick={() => pick(r.item, x)} />)}
                  <button onClick={() => onSearch(r.item)} className="shrink-0 h-12 px-4 rounded-2xl border border-dashed border-slate-300 text-sm font-semibold text-indigo-700">
                    Search…
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {skipped.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-500">Skipped</p>
          <ul>
            {skipped.map(r => (
              <li key={r.key} className="flex items-center gap-2 py-1">
                <span className="flex-1 text-[15px] text-slate-500 truncate">{r.item}</span>
                <button onClick={() => onChoose(r.item, null)} className="h-9 px-3 rounded-xl text-sm font-semibold text-indigo-700 hover:bg-slate-50">Put back</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
};

/** One-time setup: save the bookmark that fills the trolley. */
export const NwSetupSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) setCopied(false); }, [open]);
  if (!open) return null;
  return (
    <Sheet open onClose={onClose} title="Set up online shopping">
      <p className="text-[15px] text-slate-700">
        Homedash never has your New World or PAK'nSAVE login, so your trolley is filled inside your own browser while
        you're logged in there. Set up one of these, once, in each browser you shop from. Both work at either store. Neither one orders or
        pays for anything.
      </p>

      <h3 className="font-semibold text-slate-900 mt-5">Automatic: nothing to tap</h3>
      <ol className="text-[15px] text-slate-700 space-y-1 list-decimal pl-5 mt-1">
        <li>
          Install a userscript extension: <b>Userscripts</b> for Safari (iPad, iPhone, Mac), or <b>Tampermonkey</b> for
          Chrome, Edge or Firefox.
        </li>
        <li>Open the Homedash script below in that browser and let the extension install it.</li>
        <li>From then on, <b>Send</b> opens the store's website and the trolley fills by itself.</li>
      </ol>
      <a
        href={apiUrl('/homedash-newworld.user.js')}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center justify-center h-11 px-4 rounded-2xl text-[15px] font-semibold bg-indigo-700 text-white hover:bg-indigo-800 shadow-sm"
      >
        Open the Homedash script
      </a>
      <p className="text-sm text-slate-500 mt-2">It only runs on newworld.co.nz and paknsave.co.nz, and only when Homedash has just sent a list. If you installed it before PAK'nSAVE was added, open it again to update.</p>

      <h3 className="font-display text-lg text-slate-900 mt-7">Or a bookmark: one tap each time</h3>

      <h3 className="font-semibold text-slate-900 mt-3">iPad or iPhone (Safari)</h3>
      <ol className="text-[15px] text-slate-700 space-y-1 list-decimal pl-5 mt-1">
        <li>Tap <b>Copy bookmark code</b> below.</li>
        <li>In Safari, open any web page, tap Share, then <b>Add Bookmark</b>, and save it.</li>
        <li>Open Bookmarks, tap <b>Edit</b>, and tap the new bookmark.</li>
        <li>Name it "{BOOKMARK_NAME}", clear the address, paste the code, and tap Done.</li>
      </ol>
      <div className="mt-3">
        <Btn onClick={async () => setCopied(await copyText(NW_BOOKMARKLET_URL))}>{copied ? 'Copied' : 'Copy bookmark code'}</Btn>
      </div>

      <h3 className="font-semibold text-slate-900 mt-6">Mac or PC</h3>
      <p className="text-[15px] text-slate-700 mt-1">Show the bookmarks bar, then drag this button onto it:</p>
      <a
        ref={el => { if (el) el.setAttribute('href', NW_BOOKMARKLET_URL); }}
        onClick={e => e.preventDefault()}
        draggable
        title={BOOKMARK_NAME}
        className="mt-2 inline-flex items-center h-11 px-4 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold cursor-grab"
      >
        {BOOKMARK_NAME}
      </a>

      <p className="text-sm text-slate-500 mt-6">
        The bookmark only runs when you tap it, only on newworld.co.nz or paknsave.co.nz, and only talks to that store.
        It is {NW_BOOKMARKLET_CODE.length.toLocaleString()} characters of code kept in this project at scripts/nw-bookmarklet.js.
      </p>
    </Sheet>
  );
};
