/*
 * openedu-bridge.js — SDK rất nhỏ cho trang HTML5 do giáo viên / AI làm.
 *
 *   <script src="/openedu-bridge.js"></script>
 *   OpenEdu.ready();          // trang đã sẵn sàng
 *   OpenEdu.progress(0.4);    // đã làm được 40%
 *   OpenEdu.complete(0.8);    // xong, điểm 0..1 (bỏ trống = chỉ báo hoàn thành)
 *
 * Gửi { source:'openedu-bridge', type, ... } lên trang cha (launcher.html trên cùng origin nội dung).
 * Mở trang trực tiếp (không có trang cha) thì các hàm không làm gì — vẫn chạy thử được.
 */
(function (w) {
  'use strict';
  if (w.OpenEdu) return;

  function targetOrigin() {
    // Trang cha mặc định là launcher cùng origin. Có thể ghi đè bằng ?parentOrigin=… khi nhúng nơi khác.
    try {
      var p = new URLSearchParams(w.location.search).get('parentOrigin');
      if (p) return new URL(p).origin;
    } catch (e) { /* bỏ qua */ }
    return w.location.origin && w.location.origin !== 'null' ? w.location.origin : null;
  }

  var origin = targetOrigin();
  var done = false;

  function unit(x) {
    var n = Number(x);
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined;
  }

  function send(msg) {
    if (!origin || w.parent === w) return false;
    msg.source = 'openedu-bridge';
    try {
      w.parent.postMessage(msg, origin);
      return true;
    } catch (e) {
      return false;
    }
  }

  w.OpenEdu = {
    version: '1.0.0',
    /** Báo trang đã tải xong. */
    ready: function () {
      return send({ type: 'ready' });
    },
    /** Báo tiến độ 0..1. */
    progress: function (x) {
      return send({ type: 'progress', progress: unit(x) });
    },
    /** Báo hoàn thành, kèm điểm 0..1 (tùy chọn) và dữ liệu thêm (tùy chọn). Chỉ gửi một lần. */
    complete: function (score, raw) {
      if (done) return false;
      done = true;
      return send({ type: 'result', score: score === undefined ? undefined : unit(score), completed: true, raw: raw });
    },
    /** Gửi kết quả giữa chừng (chưa xong). */
    result: function (score, raw) {
      return send({ type: 'result', score: unit(score), completed: false, raw: raw });
    }
  };
})(window);
