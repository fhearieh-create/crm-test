// Service worker minimal — permet l'installation en application (PWA).
// Ne fait pas de cache agressif : le CRM doit toujours charger les dernières données.
const CACHE = 'egn-crm-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

// Stratégie "network first" : toujours essayer le réseau, ne se rabat sur
// le cache que si l'utilisateur est hors-ligne (l'appli reste utilisable
// hors connexion pour la coquille, mais les données restent toujours à jour
// quand la connexion est disponible).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
