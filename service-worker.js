const CACHE_NAME = 'ultimate-team-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './database.js',
  './match.js',
  './matchmaking.js',
  './players.js',
  './playerDatabase.js',
  './market.js',
  './packs.js',
  './seedingService.js',
  './auth.js',
  './firebase.js',
  './utils.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
