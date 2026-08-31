const CACHE = "wsns-school-day-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (new URL(e.request.url).pathname.startsWith("/api/") || new URL(e.request.url).pathname === "/calendar.ics") return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
