// MKC Portal service worker.
// - The app files (pages, styles, scripts, logo) are saved on the phone, so the app opens even with no internet.
// - Pages and scripts are fetched from the network first, so a new version reaches people at once; the saved copy is used only when offline.
// - Supabase (the database, sign-in, files) is NEVER saved or answered by this worker: data is always live and sign-in tokens are never stored here.
// Change VERSION on every deploy that changes files in PRECACHE, so old copies are removed.
const VERSION = 'mkc-v1';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const PRECACHE = [
  './', 'index.html', 'about.html', 'leadership.html', 'services.html', 'portal.html', 'offline.html',
  'styles.css', 'mg-public.css', 'mg-theme.css', 'portal.css',
  'script.js', 'public-content.js', 'portal.js', 'mg-ui.js', 'ethiopian-calendar.js', 'supabase-config.js', 'pwa.js',
  'manifest.webmanifest', 'assets/favicon.png', 'assets/church-logo.png',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png', 'assets/icons/apple-touch-icon.png'
];
// third-party files that are safe to keep (libraries and fonts); everything else cross-site goes straight to the network
const KEEP_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const put = (name, req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(name).then(c => c.put(req, copy)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                                   // saves, sign-ins, uploads: always the network
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin !== self.location.origin) {
    if (!KEEP_HOSTS.includes(url.hostname)) return;                   // Supabase and anything else: not touched
    // libraries and fonts: use the saved copy at once, refresh it in the background
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      const fresh = fetch(req).then(r => put(RUNTIME, req, r)).catch(() => hit);
      return hit || fresh;
    }));
    return;
  }

  // our own files: network first, saved copy when offline
  e.respondWith(fetch(req).then(r => put(SHELL, req, r)).catch(async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('offline.html')) || Response.error();
    return Response.error();
  }));
});
