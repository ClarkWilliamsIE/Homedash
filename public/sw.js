// sw.js — lets the Homedash phone app open without signal (e.g. inside the supermarket).
// The app's own files are kept on the phone; your list and plan are cached by the app itself
// and synced with the Google Sheet when you're back online.

const VERSION = 'homedash-v1';
const SHELL = ['/', '/index.html', '/ha/homedash.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (request, response) => {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(VERSION).then(cache => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache the API or Google data calls; the app handles being offline itself.
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts.')) return;

  // Pages: try the network first so updates arrive, fall back to the saved copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(r => putInCache('/index.html', r)).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // App files, fonts and recipe photos: use the saved copy, refresh it in the background.
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || url.hostname.startsWith('fonts.') || url.hostname.endsWith('gstatic.com') ||
    url.hostname.endsWith('googleusercontent.com') || url.hostname === 'drive.google.com';
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(r => putInCache(request, r)).catch(() => cached);
      return cached || network;
    })
  );
});
