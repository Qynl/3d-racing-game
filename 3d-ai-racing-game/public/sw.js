/*
 * Offline support for Sundown Rally.
 *
 * The production build is a single HTML file with everything inlined, so
 * caching that one document (plus the handful of static extras) is enough to
 * make the game work with no connection at all.
 *
 * Strategy is network-first: a player who IS online always gets the newest
 * build — no stale-game-forever problem — and falls back to the cache only
 * when the network fails.
 */
const CACHE = "sundown-rally-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit ?? caches.match("./index.html").then((idx) => idx ?? Response.error())),
      ),
  );
});
