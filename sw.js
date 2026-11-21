const CACHE_NAME = "volley-input-v1";
const STATIC_FILES = ["./", "./index.html", "./styles.css", "./app.js"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(STATIC_FILES.map(async file => {
      const request = new Request(new URL(file, self.registration.scope), { cache: "no-store" });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`静的ファイルをキャッシュできません: ${request.url}`);
      await cache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith("volley-input-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(request, { cache: "no-store" });
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      if (request.mode === "navigate") {
        const offlinePage = await cache.match(new URL("./index.html", self.registration.scope));
        if (offlinePage) return offlinePage;
      }
      throw error;
    }
    if (response.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      } catch (error) {
        console.error("最新ファイルをオフライン用キャッシュに保存できませんでした", error);
      }
    }
    return response;
  })());
});
