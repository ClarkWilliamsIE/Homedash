// scripts/nw-bookmarklet.js
// The "Fill trolley from Homedash" bookmark. It runs on newworld.co.nz, in your own signed-in
// tab, when you tap the bookmark. It reads the list Homedash attached to the page address
// (after #homedash=), asks New World for your trolley, and adds what isn't already in it.
// It never sees your password, sends nothing anywhere except New World, and doesn't check out.
//
// After editing this file run `npm run build:bookmark` to regenerate lib/nwBookmarklet.ts.
//
// The same code is also packaged as a userscript (public/homedash-newworld.user.js). Installed in a
// userscript extension it runs by itself whenever New World opens with a Homedash list attached,
// so there is no bookmark to tap. In that mode it stays silent on every other visit.
(function () {
  var AUTO = typeof HOMEDASH_AUTO !== 'undefined';
  var API = 'https://api-prod.newworld.co.nz/v1/edge';
  var D = document;
  if (!/(^|\.)newworld\.co\.nz$/.test(location.hostname) && AUTO) return;

  // Read the list from the address straight away. In automatic mode this runs before the page's
  // own code, which can tidy the #homedash= part off the address before the page finishes loading.
  var HASH_RAW = (/homedash=([A-Za-z0-9_-]+)/.exec(location.hash) || [])[1] || '';
  // newworld.co.nz/#homedash-check shows whether the automatic script is working in this browser.
  var CHECK = AUTO && /homedash-check/.test(location.hash);
  if (AUTO && HASH_RAW) {
    try { localStorage.setItem('homedash_list', JSON.stringify({ raw: HASH_RAW, at: Date.now(), tries: 0 })); } catch (e) {}
  } else if (AUTO && !CHECK && !autoResume()) {
    return;
  }
  // Wait for the page itself before showing anything.
  if (!D.body || D.readyState === 'loading') { D.addEventListener('DOMContentLoaded', function () { setTimeout(main, 600); }); }
  else main();

  // In automatic mode a list saved earlier (you had to log in first) is picked up again, but only
  // a few times, so a list that keeps failing doesn't pop up on every page for two hours.
  function autoResume() {
    try {
      var k = JSON.parse(localStorage.getItem('homedash_list') || 'null');
      if (!k || Date.now() - k.at > 2 * 3600 * 1000 || (k.tries || 0) >= 3) return false;
      k.tries = (k.tries || 0) + 1;
      localStorage.setItem('homedash_list', JSON.stringify(k));
      return true;
    } catch (e) { return false; }
  }
  function main() {
  var old = D.getElementById('homedash-fill');
  if (old) old.remove();

  // --- A small panel at the bottom of the page ---
  var box = D.createElement('div');
  box.id = 'homedash-fill';
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-width:520px;margin:0 auto;' +
    'background:#fff;color:#0f172a;border-radius:18px;box-shadow:0 12px 40px rgba(15,23,42,.35);padding:16px 18px;' +
    'font:16px/1.4 -apple-system,system-ui,sans-serif;max-height:70vh;overflow:auto';
  var title = D.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:17px;margin-bottom:4px';
  var body = D.createElement('div');
  var actions = D.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
  box.appendChild(title); box.appendChild(body); box.appendChild(actions);
  D.body.appendChild(box);

  function line(text, muted) {
    var p = D.createElement('div');
    p.textContent = text;
    if (muted) p.style.cssText = 'color:#64748b;font-size:14px;margin-top:2px';
    body.appendChild(p);
    return p;
  }
  function button(text, primary, onClick) {
    var b = D.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'height:44px;padding:0 16px;border-radius:12px;font:600 15px -apple-system,system-ui,sans-serif;cursor:pointer;' +
      (primary ? 'background:#4338ca;color:#fff;border:0' : 'background:#fff;color:#0f172a;border:1px solid #cbd5e1');
    b.onclick = onClick;
    actions.appendChild(b);
    return b;
  }
  function show(heading, lines) {
    title.textContent = heading;
    body.textContent = '';
    actions.textContent = '';
    (lines || []).forEach(function (l) { line(l); });
  }
  function close() { box.remove(); }
  function names(list) {
    return list.length <= 4 ? list.join(', ') : list.slice(0, 4).join(', ') + ' and ' + (list.length - 4) + ' more';
  }

  // --- The list Homedash sent ---
  function decode(raw) {
    var b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var data = JSON.parse(new TextDecoder().decode(bytes));
    var items = (data && data.items || []).filter(function (it) {
      return it && /^[0-9A-Za-z_-]{3,40}$/.test(String(it.id)) && Number.isInteger(it.q) && it.q > 0 && it.q <= 5000 &&
        (it.t === 'UNITS' || it.t === 'WEIGHT');
    }).slice(0, 150).map(function (it) {
      return { id: String(it.id), q: it.q, t: it.t, n: String(it.n || it.id).slice(0, 80) };
    });
    return { store: String(data.store || ''), storeName: String(data.storeName || '').slice(0, 60), items: items };
  }
  // The list is also kept in this browser for a couple of hours, so it survives logging in
  // (which reloads the page and drops the #homedash= part of the address).
  var KEEP = 'homedash_list';
  function keep(raw) {
    try {
      var was = JSON.parse(localStorage.getItem(KEEP) || 'null');
      var tries = was && was.raw === raw ? was.tries || 0 : 0;
      localStorage.setItem(KEEP, JSON.stringify({ raw: raw, at: was && was.raw === raw ? was.at : Date.now(), tries: tries }));
    } catch (e) {}
  }
  function kept() {
    try {
      var k = JSON.parse(localStorage.getItem(KEEP) || 'null');
      return k && Date.now() - k.at < 2 * 3600 * 1000 && /^[A-Za-z0-9_-]+$/.test(k.raw) ? k.raw : '';
    } catch (e) { return ''; }
  }
  function findRaw() {
    if (HASH_RAW) return HASH_RAW;
    var m = /homedash=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) return m[1];
    if (String(window.name).indexOf('homedash=') === 0) return window.name.slice(9);
    return kept();
  }
  function forget() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    try { if (String(window.name).indexOf('homedash=') === 0) window.name = ''; } catch (e) {}
    try { localStorage.removeItem(KEEP); } catch (e) {}
  }

  function askForList() {
    show('No Homedash list here', ['Open the Shopping screen in Homedash and tap "Send to New World", or paste the copied list below.']);
    var ta = D.createElement('textarea');
    ta.setAttribute('aria-label', 'Homedash list');
    ta.placeholder = 'Paste the list from Homedash';
    ta.style.cssText = 'width:100%;height:64px;margin-top:10px;border:1px solid #cbd5e1;border-radius:12px;padding:8px;font:14px monospace;box-sizing:border-box';
    body.appendChild(ta);
    button('Fill trolley', true, function () {
      var raw = (/homedash=([A-Za-z0-9_-]+)/.exec(ta.value) || [])[1] || ta.value.trim();
      start(raw);
    });
    button('Close', false, close);
  }

  // --- New World ---
  var token = '';
  function call(method, path, payload) {
    return fetch(API + path, {
      method: method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (r) {
      return r.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        return { ok: r.ok, status: r.status, json: json };
      });
    });
  }
  // New World marks a visitor who hasn't logged in with the role ANONYMOUS inside the session token.
  function isGuest(who) {
    if (/guest/i.test(String(who.transition || ''))) return true;
    try {
      var part = String(who.access_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var roles = JSON.parse(atob(part)).roles || [];
      return roles.indexOf('ANONYMOUS') >= 0;
    } catch (e) { return false; }
  }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function asLine(it) { return { productId: it.id, quantity: it.q, sale_type: it.t }; }

  async function start(raw) {
    var data;
    try { data = decode(raw); } catch (e) { data = null; }
    if (!data || !data.items.length) {
      show("That list couldn't be read", ['Go back to Homedash and tap "Send to New World" again.']);
      button('Close', false, close);
      return;
    }
    keep(raw);
    show('Filling your trolley…', ['Adding ' + data.items.length + ' item' + (data.items.length === 1 ? '' : 's') + ' from Homedash.']);
    try {
      var who = await fetch('/api/user/get-current-user', { method: 'POST', credentials: 'include' }).then(function (r) { return r.json(); });
      if (!who || !who.access_token) throw new Error('New World did not give a session. Reload the page and try again.');
      token = who.access_token;
      if (isGuest(who)) {
        show('Log in to New World first', [AUTO
          ? 'You are not logged in on this page. Log in and your trolley fills by itself. Your list is saved in this browser for the next two hours.'
          : 'You are not logged in on this page. Log in, then tap the bookmark again. Your list is saved in this browser for the next two hours.']);
        button('Close', false, close);
        return;
      }
      var cart = await call('GET', '/cart');
      if (!cart.ok || !cart.json) throw new Error('New World would not show your trolley (' + cart.status + ').');
      var have = {};
      (cart.json.products || []).forEach(function (p) { have[p.productId] = true; });
      var already = data.items.filter(function (it) { return have[it.id]; });
      var todo = data.items.filter(function (it) { return !have[it.id]; });
      var failed = [];
      var latest = cart.json;

      if (todo.length) {
        var all = await call('POST', '/cart', { products: todo.map(asLine) });
        if (all.ok && all.json) {
          latest = all.json;
        } else {
          // One of them was refused, so add them one at a time and note which.
          for (var i = 0; i < todo.length; i++) {
            title.textContent = 'Filling your trolley… ' + (i + 1) + ' of ' + todo.length;
            var one = await call('POST', '/cart', { products: [asLine(todo[i])] });
            if (one.ok && one.json) latest = one.json; else failed.push(todo[i]);
            await wait(350);
          }
        }
      }

      var inCart = {};
      (latest.products || []).forEach(function (p) { inCart[p.productId] = true; });
      var unavailableIds = {};
      (latest.unavailableProducts || []).forEach(function (p) { unavailableIds[p.productId] = true; });
      var added = todo.filter(function (it) { return inCart[it.id]; });
      var unavailable = todo.filter(function (it) { return unavailableIds[it.id]; });
      var missing = todo.filter(function (it) { return !inCart[it.id] && !unavailableIds[it.id]; });

      forget();
      show(added.length ? 'Added ' + added.length + ' item' + (added.length === 1 ? '' : 's') + ' to your trolley' : 'Nothing new to add', []);
      if (already.length) line('Already in your trolley: ' + names(already.map(function (it) { return it.n; })) + '.', true);
      if (unavailable.length) line('Not available right now: ' + names(unavailable.map(function (it) { return it.n; })) + '.');
      if (missing.length) line("Couldn't be added: " + names(missing.map(function (it) { return it.n; })) + '.');
      if (typeof latest.subtotal === 'number') line('Trolley subtotal: $' + (latest.subtotal / 100).toFixed(2), true);
      var here = latest.store && latest.store.storeId;
      if (data.store && here && here !== data.store) {
        line('Your trolley is for ' + (latest.store.storeName || 'another store') + ', but Homedash looked up prices at ' + (data.storeName || 'a different store') + '.', true);
      }
      line('Check quantities, pick a time and pay as usual. Nothing has been ordered.', true);
      button('Show my trolley', true, function () { location.reload(); });
      button('Close', false, close);
    } catch (err) {
      show("Couldn't fill the trolley", [String(err && err.message || err), AUTO ? 'Your list is saved: reload the page to try again.' : 'Your list is saved: reload the page and tap the bookmark again.']);
      button('Close', false, close);
    }
  }

  // What the check page shows.
  async function checkUp() {
    show('The Homedash script is working here', ['Checking whether you are logged in to New World…']);
    var lines = [];
    try {
      var who = await fetch('/api/user/get-current-user', { method: 'POST', credentials: 'include' }).then(function (r) { return r.json(); });
      lines.push(who && who.access_token && !isGuest(who)
        ? 'You are logged in to New World, so lists from Homedash will fill your trolley.'
        : 'You are NOT logged in to New World in this browser. Log in and lists from Homedash will fill your trolley.');
    } catch (e) {
      lines.push('New World did not answer: ' + String(e && e.message || e));
    }
    lines.push(kept() ? 'A list from Homedash is waiting and will be added next.' : 'No list from Homedash is waiting.');
    show('The Homedash script is working here', lines);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    button('Close', false, close);
  }

  var raw = findRaw();
  if (!/(^|\.)newworld\.co\.nz$/.test(location.hostname)) {
    show('Open New World first', ['This bookmark only works on newworld.co.nz.']);
    button('Close', false, close);
  } else if (CHECK) {
    checkUp();
  } else if (raw) {
    start(raw);
  } else {
    askForList();
  }
  }
})();
