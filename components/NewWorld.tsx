// components/NewWorld.tsx
// The New World parts of the Shopping screen: the product and price beside each item, the
// estimated total, choosing a different product, and sending the list to your New World trolley.
// Prices come from lib/newworld.ts. The trolley is filled by the "Fill trolley from Homedash"
// bookmark in your own signed-in New World tab; Homedash never has your New World login.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Icon, Pill, Sheet } from './ui';
import {
  NW_STORE, NwChoice, NwProduct, NwRowMatch, NwState, TrolleyLine,
  estimateCents, money, nwKey, priceText, productLabel, rememberProduct, shelfText,
  searchProducts, searchTerm, trolleyLine, trolleyLink, trolleyPayload,
} from '../lib/newworld';
import { NW_BOOKMARKLET_CODE, NW_BOOKMARKLET_URL } from '../lib/nwBookmarklet';

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
    top = <span className="text-sm text-slate-400">Not New World</span>;
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
      aria-label={`New World product for ${itemName}`}
      className="shrink-0 max-w-[46%] md:max-w-[13rem] min-h-[3.5rem] pl-2 pr-4 py-2 text-right hover:bg-slate-50 active:bg-indigo-50"
    >
      {top}
      {bottom}
    </button>
  );
};

/** What would go to the trolley for these items, and roughly what it costs. */
export function useTrolley(itemNames: string[], nw: NwState) {
  return useMemo(() => {
    const lines: (TrolleyLine & { item: string; product: NwProduct; chosen: boolean })[] = [];
    const seen = new Set<string>();
    let total = 0, unpriced = 0, unmatched = 0;
    for (const item of itemNames) {
      const m = nw.matches.get(nwKey(item));
      if (m?.skipped) continue;
      const p = m?.product;
      if (!p || !p.online) { unmatched++; continue; }
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      lines.push({ ...trolleyLine(p, productLabel(p) || item), item, product: p, chosen: m!.chosen });
      const cents = estimateCents(p);
      if (cents == null) unpriced++; else total += cents;
    }
    return { lines, total, unpriced, unmatched };
  }, [itemNames.join('|'), nw.matches]);
}

/** The card at the top of the list: estimated total and the Send button. */
export const NwSummary: React.FC<{
  nw: NwState;
  trolley: ReturnType<typeof useTrolley>;
  onSend: () => void;
  onSetup: () => void;
}> = ({ nw, trolley, onSend, onSetup }) => {
  const { lines, total, unpriced, unmatched } = trolley;
  const notes = [
    unpriced ? `${unpriced} sold by weight not counted` : '',
    unmatched ? `${unmatched} not found` : '',
  ].filter(Boolean).join(', ');
  return (
    <section className="mt-3 rounded-3xl border border-slate-200/70 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-indigo-700">{NW_STORE.name}</p>
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
          {notes && lines.length > 0 && <p className="text-sm text-slate-500">{notes}</p>}
          {nw.error && lines.length > 0 && <p className="text-sm text-slate-500">Some prices couldn't be refreshed.</p>}
        </div>
        <div className="flex items-center gap-2">
          {nw.error && <Btn variant="secondary" size="sm" onClick={nw.retry}>Try again</Btn>}
          <Btn onClick={onSend} disabled={!lines.length} icon={<Icon.Basket className="w-4 h-4" />}>Send to New World</Btn>
        </div>
      </div>
      <button onClick={onSetup} className="mt-2 text-sm font-semibold text-slate-500 hover:text-indigo-700 underline underline-offset-4">
        Set up the New World bookmark
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

/** Choose which New World product an item means. */
export const NwSwapSheet: React.FC<{
  itemName: string | null;
  match?: NwRowMatch;
  onClose: () => void;
  onChoose: (choice: NwChoice | null) => void;
}> = ({ itemName, match, onClose, onChoose }) => {
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
  }, [itemName]);

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
        if (!cancelled) setError(e?.message || "Couldn't search New World.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, itemName]);

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
      title={`${itemName} at New World`}
      footer={
        <div className="flex flex-wrap gap-2 justify-between">
          <Btn variant="ghost" onClick={() => { onChoose({ id: key, productId: '', label: '', saleType: 'UNITS' }); onClose(); }}>
            Don't get this at New World
          </Btn>
          {match?.chosen && <Btn variant="ghost" onClick={() => { onChoose(null); onClose(); }}>Use the top result</Btn>}
        </div>
      }
    >
      <label className="block">
        <span className="sr-only">Search New World</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search New World"
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

/** Review the list and hand it to New World. */
export const NwSendSheet: React.FC<{
  open: boolean;
  trolley: ReturnType<typeof useTrolley>;
  onClose: () => void;
  onSetup: () => void;
}> = ({ open, trolley, onClose, onSetup }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) setCopied(false); }, [open]);
  if (!open) return null;
  const { lines, total, unpriced } = trolley;
  const plain: TrolleyLine[] = lines.map(({ id, q, t, n }) => ({ id, q, t, n }));
  const guesses = lines.filter(l => !l.chosen).length;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Send to New World"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={trolleyLink(plain)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-11 px-4 rounded-2xl text-[15px] font-semibold bg-indigo-700 text-white hover:bg-indigo-800 shadow-sm"
          >
            Open New World
          </a>
          <Btn variant="secondary" onClick={async () => setCopied(await copyText(`homedash=${trolleyPayload(plain)}`))}>
            {copied ? 'Copied' : 'Copy list instead'}
          </Btn>
        </div>
      }
    >
      <ol className="text-[15px] text-slate-700 space-y-1 list-decimal pl-5">
        <li>Tap <b>Open New World</b>.</li>
        <li>Tap your <b>{BOOKMARK_NAME}</b> bookmark. It adds these to your trolley. If it asks you to log in, log in and tap it again.</li>
        <li>Check the trolley, pick a time and pay on New World as usual.</li>
      </ol>
      <p className="text-sm text-slate-500 mt-2">
        Things already in your trolley are left alone.{' '}
        <button onClick={onSetup} className="font-semibold text-indigo-700 underline underline-offset-4">No bookmark yet?</button>
      </p>
      <div className="mt-4 flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900">{lines.length} item{lines.length === 1 ? '' : 's'}</h3>
        <p className="text-slate-700">About <b>{money(total)}</b>{unpriced ? ' plus items by weight' : ''}</p>
      </div>
      {guesses > 0 && (
        <p className="text-sm text-slate-500">
          {guesses} in italics {guesses === 1 ? 'is' : 'are'} New World's top result, not something you've picked. Tap an item on the list to change it.
        </p>
      )}
      <ul className="mt-2 divide-y divide-slate-100">
        {lines.map(l => (
          <li key={l.id} className="py-2 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className={`block text-[15px] truncate ${l.chosen ? 'text-slate-900' : 'text-slate-600 italic'}`}>{l.n}</span>
              <span className="block text-xs text-slate-500 truncate">
                {l.item}{l.t === 'WEIGHT' ? ` · ${l.q} g` : ''}
              </span>
            </span>
            <span className="shrink-0 text-[15px] text-slate-700">{priceText(l.product)}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
};

/** One-time setup: save the bookmark that fills the trolley. */
export const NwSetupSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) setCopied(false); }, [open]);
  if (!open) return null;
  return (
    <Sheet open onClose={onClose} title="Set up the New World bookmark">
      <p className="text-[15px] text-slate-700">
        Homedash never has your New World login. A bookmark, saved once in each browser you shop from, adds the
        Homedash list to your trolley while you're logged in to New World. It doesn't order or pay for anything.
      </p>

      <h3 className="font-semibold text-slate-900 mt-5">iPad or iPhone (Safari)</h3>
      <ol className="text-[15px] text-slate-700 space-y-1 list-decimal pl-5 mt-1">
        <li>Tap <b>Copy bookmark code</b> below.</li>
        <li>In Safari, open newworld.co.nz, tap Share, then <b>Add Bookmark</b>, and save it.</li>
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
        The bookmark only runs when you tap it, only on newworld.co.nz, and only talks to New World.
        It is {NW_BOOKMARKLET_CODE.length.toLocaleString()} characters of code kept in this project at scripts/nw-bookmarklet.js.
      </p>
    </Sheet>
  );
};
