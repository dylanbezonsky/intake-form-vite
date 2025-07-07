// src/service-worker.js
const CACHE_NAME = "offline-cache-v1";
const urlsToCache = ["/", "/index.html"];

// Install the service worker
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate and clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      )
    )
  );
});

// Serve cached content when offline
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(response => response || caches.match("/"))
    )
  );
});
