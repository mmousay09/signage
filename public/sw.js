// يحفظ واجهة المشغّل فقط، حتى تفتح الشاشة بعد إعادة التشغيل دون إنترنت.
// الوسائط تُحفظ وتُقرأ مباشرة من المشغّل، ولوحة التحكم خارج نطاق هذا الملف.
const SHELL_CACHE = "signage-shell-v1";
const PLAYER_PAGE = "/play";
const CORE_FILES = [PLAYER_PAGE, "/sounds/chime.wav", "/player.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("signage-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => new URL(url).origin === self.location.origin);
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(
        urls.map(async (url) => {
          if (!(await cache.match(url, { ignoreSearch: true }))) await cache.add(url);
        }),
      ),
    ),
  );
});

async function pageFromNetwork(request) {
  const cache = await caches.open(SHELL_CACHE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) await cache.put(PLAYER_PAGE, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(PLAYER_PAGE);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fileFromCache(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(pageFromNetwork(request));
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/sounds/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/player.webmanifest"
  ) {
    event.respondWith(fileFromCache(request));
  }
});
