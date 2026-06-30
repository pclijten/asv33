// sw.js — minimale service worker
//
// Nodig om de app installeerbaar te maken: Chrome/Edge tonen het
// "installeren"-aanbod (beforeinstallprompt) alleen als er een service worker
// met een fetch-handler actief is.
//
// Bewust géén agressieve caching: we laten het netwerk leidend zijn, zodat een
// nieuwe versie na een GitHub-upload meteen zichtbaar is en je niet tegen
// hardnekkige caching aanloopt. De fetch-handler bestaat puur om aan de
// installeerbaarheidseis te voldoen.

self.addEventListener('install', () => {
  self.skipWaiting();           // nieuwe versie meteen activeren
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Netwerk eerst; valt het netwerk weg, dan proberen we wat de browser
  // eventueel zelf in cache heeft (HTTP-cache). We schrijven niets weg.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
