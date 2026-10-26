/* Service worker: deja el juego funcionando aunque la wifi de la feria falle.
 * - Archivos del juego: "red primero, caché de respaldo" (así siempre ves la última versión
 *   si hay conexión, y si no la hay se usa la copia guardada).
 * - Las llamadas al backend (Supabase) nunca se cachean. */
const VERSION = 'simo26-v3';
const ARCHIVOS = ['./', 'index.html', 'ranking.html', 'verificar.html', 'preguntas.csv', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/mazes.js', 'js/audio.js', 'js/preguntas-embebidas.js', 'js/questions.js', 'js/api.js', 'js/game.js', 'js/ui.js',
  'img/logo.png', 'img/icono-192.png', 'img/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // el backend va directo a la red
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
