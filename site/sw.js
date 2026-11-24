// 오프라인에서도 마지막으로 본 강좌 목록을 열 수 있게 하는 서비스 워커.
// 같은 사이트 파일만 저장한다 (실시간 주차 API·주차 기록은 저장하지 않음).
const CACHE = "kspo-courses-v2";
const CORE = ["./", "./index.html", "./courses.js", "./check.html", "./data.js", "./analysis.html", "./analysis.js", "./manifest.webmanifest", "./icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // 새 자료가 먼저, 안 되면 저장본
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html"))));
});
