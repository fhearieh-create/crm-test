// Service worker — permet l'installation en application (PWA).
//
// REGLE DE SECURITE : seuls les fichiers du CRM lui-meme (meme origine)
// peuvent etre mis en cache. Les reponses de Supabase (donnees, fichiers,
// modules proteges) ne passent JAMAIS par ce cache : sinon elles resteraient
// sur le poste apres la deconnexion, lisibles dans l'inspecteur
// (Application > Cache Storage) par le compte suivant.
const CACHE = 'egn-crm-shell-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

// A l'activation : suppression de tous les anciens caches.
// L'ancienne version (v1) contenait des reponses Supabase.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)));
    await self.clients.claim();
  })());
});

// "Network first" limite aux fichiers du CRM.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase, polices, bibliotheques externes : le navigateur les traite
  // directement, sans passer par ce cache.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copie = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copie));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
