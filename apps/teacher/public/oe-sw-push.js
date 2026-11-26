/* OPEN-EDU — thông báo đẩy trong service worker (Workbox importScripts), SQL 23 + Edge Function `push`.
 * Nhận tin đã mã hoá từ dịch vụ đẩy của trình duyệt → hiện thông báo; bấm vào → mở đúng trang trong app.
 * Tin cùng chủ đề (tag) thay cho tin cũ thay vì xếp chồng. Báo các tab đang mở cập nhật chuông.
 */
self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'OPEN-EDU', body: event.data ? event.data.text() : '' }; }
  var title = d.title || 'OPEN-EDU';
  var opts = {
    body: d.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    lang: 'vi',
    data: { link: d.link || '/' },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    (self.navigator && self.navigator.setAppBadge && typeof d.badge === 'number')
      ? self.navigator.setAppBadge(d.badge).catch(function () {}) : Promise.resolve(),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ type: 'oe-push', kind: d.kind || '' }); });
    }),
  ]));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || '/';
  var url = new URL(link.charAt(0) === '/' ? link : '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        return c.focus().then(function (w) { return (w && 'navigate' in w) ? w.navigate(url).catch(function () { return w; }) : w; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
