// Service worker: makes the game installable and lets it keep working with
// no network at all. Network-first, not cache-first - during normal (online)
// play this always fetches the live file, so editing the game and reloading
// shows the change immediately, exactly like today with no service worker at
// all. The cache is purely a fallback for when a fetch actually fails (truly
// offline), populated as a side effect of every successful fetch plus the
// precache below.
//
// Bump CACHE_NAME whenever you want visitors' caches to fully reset (e.g.
// after removing a file that's still sitting in someone's cache) - install
// cleans up every other cache name, so this is the version knob.
const CACHE_NAME = 'hydro-rush-v2';

// Every local file index.html references, so a fresh install is fully
// playable offline immediately, not just after each file happens to get
// fetched once. Keep in sync with index.html's own <script>/<link> tags -
// missing an entry here isn't a correctness bug (network-first still caches
// it the first time it's actually requested), just a gap in "offline from
// the moment install finishes."
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'libs/three.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/settings.js',
  'js/scoreboard.js',
  'js/ghost.js',
  'js/achievements.js',
  'js/save-data.js',
  'js/levels/thunder-cove.js',
  'js/levels/volcanic-rapids.js',
  'js/levels/arctic-straits.js',
  'js/levels/voxel-valley.js',
  'js/levels/thunder-falls.js',
  'js/levels/canyon-run.js',
  'js/levels/serpent-falls.js',
  'js/levels/world-tour.js',
  'js/levels/torrent-gauntlet.js',
  'js/levels/moonlit-rapids.js',
  'js/levels/storm-coast.js',
  'js/levels/bioluminescent-cave.js',
  'js/levels/ancient-ruins.js',
  'js/levels/desert-oasis.js',
  'js/levels.js',
  'js/modes.js',
  'js/cups.js',
  'js/difficulty.js',
  'js/boats.js',
  'js/wake.js',
  'js/input.js',
  'js/viewport.js',
  'js/coop.js',
  'js/audio.js',
  'js/music.js',
  'js/track.js',
  'js/boat.js',
  'js/race-progress.js',
  'js/ai.js',
  'js/hud.js',
  'js/navigation.js',
  'js/menu.js',
  'js/main.js',
  'js/pwa.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Activates this version immediately rather than waiting for every
      // open tab to close - fine here since network-first means an already-
      // open tab keeps getting live files regardless of which SW version
      // answers a cache-fallback request.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      // Only cache genuine successes - an opaque (cross-origin, no-cors)
      // response has status 0 and would otherwise get cached as if it were
      // fine; this project has no cross-origin requests today, but the
      // check costs nothing and avoids that trap if one's ever added.
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
