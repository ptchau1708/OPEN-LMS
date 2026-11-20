/* OPEN-EDU — phần thêm cho service worker (Workbox importScripts), docs/PHASE6_OFFLINE.md.
 * 1. Ảnh/âm thanh của bài đã "Tải về" nằm trong Cache Storage 'oe-media-v1' → phục vụ từ đó trước.
 *    URL không có trong danh sách đã tải → không đụng tới (Workbox xử lý như cũ).
 * 2. Background Sync 'oe-outbox' → nhắn các tab đang mở tự đồng bộ hàng đợi (hàng đợi nằm trong IndexedDB của trang).
 */
/* eslint-disable no-restricted-globals */
var OE_MEDIA = 'oe-media-v1';
var oeKnown = null;
function oeLoad() {
  return caches.open(OE_MEDIA).then(function (c) { return c.keys(); }).then(function (keys) {
    oeKnown = new Set(keys.map(function (r) { return r.url; }));
  }).catch(function () { oeKnown = new Set(); });
}
var oeLoading = oeLoad();
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'oe-media-changed') oeLoading = oeLoad();
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var d = req.destination;
  if (d !== 'image' && d !== 'audio' && d !== 'video' && !(oeKnown && oeKnown.has(req.url))) return;
  if (oeKnown && !oeKnown.has(req.url)) return;
  // Chưa nạp xong danh sách (SW vừa thức dậy): tra cache rồi mới ra mạng.
  e.respondWith(oeLoading.then(function () {
    return caches.open(OE_MEDIA).then(function (c) { return c.match(req); });
  }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || Response.error(); });
    });
  }));
});
self.addEventListener('sync', function (e) {
  if (e.tag !== 'oe-outbox') return;
  e.waitUntil(self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (list) {
    list.forEach(function (c) { c.postMessage({ type: 'oe-sync' }); });
  }));
});
