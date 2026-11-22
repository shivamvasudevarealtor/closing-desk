/* Service worker: keeps the app opening when the connection is poor.
   - Same-site files: network first (so updates arrive as soon as you are online), saved copy when offline.
   - Google Fonts: saved copy first, refreshed in the background.
   - Supabase (your contacts) is never touched here, so no contact data is ever stored by this file. */
var CACHE = "realtor-os-v22";
var SHELL = ["./", "index.html", "builders.html", "builders.css", "builders-core.js", "builders-data.js", "builders-ui.js", "builders-views.js", "builders.js", "builders-pdf.js", "vendor/jspdf.umd.min.js", "home.html", "home.css", "home.js", "ros.css", "crm-core.js", "day-core.js", "tasks-info.js", "theme.js", "launch.js", "app.css", "nav.css", "wide.css", "vacation.html", "vacation.css", "vacation.js", "vacation-core.js", "vacation-data.js", "tasks.html", "tasks.css", "tasks-plan.js", "tasks-steps.js", "tasks.js", "tasks-today.js", "tasks-all.js", "tasks-all.css", "dashboard.html", "dashboard.css", "osstats.js", "app.js", "email.js", "tell.js", "gmail.js", "unsub.html", "unsub.js", "supa.js", "config.js", "vendor/supabase.js", "manifest.webmanifest",
  "icons/app-192-v3.png", "icons/app-512-v3.png", "icons/app-maskable-512-v3.png", "icons/app-180-v3.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req, { cache: "no-cache" }).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
        });
      })
    );
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
});
