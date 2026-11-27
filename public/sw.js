/* AIO service worker: app-shell caching, offline fallback, web push. */
// Bump VERSION whenever caching behaviour changes: activate() then drops every older cache.
const VERSION = "aio-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
// How long a page navigation may wait for the network before falling back to a cached copy.
const NAV_TIMEOUT_MS = 8000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll(["/offline", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Rejects after `ms` so a stalled request can't keep the page spinning forever. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // immutable build assets: cache first, but only ever store successful responses
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // pages: network first (with a timeout), fall back to last cached copy, then offline page
  if (req.mode === "navigate") {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(PAGES).then((c) => c.put(req, copy));
      }
      return res;
    });
    event.respondWith(
      withTimeout(network, NAV_TIMEOUT_MS).catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            // nothing cached: give the network a little longer, then show the offline page
            withTimeout(network, NAV_TIMEOUT_MS).catch(() => caches.match("/offline")),
        ),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "AIO", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AIO", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
