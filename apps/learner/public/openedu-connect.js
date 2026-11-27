/*!
 * OPEN-EDU Connect — "Đăng nhập bằng OPEN-EDU" cho app / trang HTML bên ngoài.
 * Tài liệu: docs/KET_NOI_APP_NGOAI.md. Không phụ thuộc thư viện nào, viết kiểu ES5 để chạy trên máy cũ.
 *
 *   <script src="https://HOC.TRUONG.EDU.VN/openedu-connect.js"></script>
 *   <script>
 *     OpenEdu.init({ learnerUrl: 'https://HOC.TRUONG.EDU.VN', appId: 'doc-hieu' });
 *     nut.onclick = function () { OpenEdu.signIn().then(function (user) { ... }); };
 *     OpenEdu.record({ activityId: 'bai-1', title: 'Chú sẻ nhỏ', kind: 'reading', correct: 4, total: 5, durationSec: 180 });
 *     // Dữ liệu học chi tiết (xAPI) — từng câu, kèm mã kĩ năng OPEN-EDU (để tính mức thành thạo):
 *     OpenEdu.answer({ activityId: 'bai-1', questionId: 'cau-2', question: 'Ý chính của đoạn 1?', correct: false, skills: ['TV5-DH-YCHINH'], durationSec: 40 });
 *     OpenEdu.xapi([{ verb: { id: 'http://adlnet.gov/expapi/verbs/completed' }, object: { id: 'https://…/bai-1' }, result: { score: { raw: 8, max: 10 } } }]);
 *   </script>
 *
 * Bảo mật: trang này chỉ nhận tin nhắn từ đúng origin của app học sinh OPEN-EDU và đúng mã `state` nó vừa sinh.
 * Nó giữ một access token của học sinh (sống ~1 giờ) trong bộ nhớ + sessionStorage; không bao giờ có refresh token.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = factory(root);
  else root.OpenEdu = factory(root);
})(typeof window !== 'undefined' ? window : this, function (win) {
  'use strict';

  var VERSION = '1.0.0';
  var MSG_TYPE = 'openedu:connect';
  var MAX_QUEUE = 200;
  var MAX_DETAIL_BYTES = 8000;
  var QUEUE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
  var RETRY_MS = 30000;

  var cfg = null; // { learnerUrl, learnerOrigin, appId }
  var session = null; // { user, token: {accessToken, expiresAt} | null, api: {url, anonKey} | null, demo: boolean }
  var listeners = {};
  var pending = null; // lần signIn đang chờ
  var flushing = false;
  var retryTimer = null;
  var buttons = [];

  /* ---------------- tiện ích ---------------- */
  function nowMs() { return new Date().getTime(); }
  function err(code, message) { var e = new Error(message); e.code = code; return e; }
  function store(kind) {
    try { return kind === 'session' ? win.sessionStorage : win.localStorage; } catch (e) { return null; }
  }
  function readJson(kind, key, fallback) {
    try {
      var s = store(kind); var raw = s && s.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(kind, key, value) {
    try {
      var s = store(kind); if (!s) return;
      if (value === null) s.removeItem(key); else s.setItem(key, JSON.stringify(value));
    } catch (e) { /* đầy bộ nhớ / chế độ riêng tư: bỏ qua */ }
  }
  function randomId(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = ''; var i;
    var c = win.crypto || win.msCrypto;
    if (c && c.getRandomValues) {
      var buf = new Uint8Array(len); c.getRandomValues(buf);
      for (i = 0; i < len; i++) out += chars.charAt(buf[i] % chars.length);
    } else {
      for (i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }
  function emit(name, data) {
    var list = (listeners[name] || []).slice();
    for (var i = 0; i < list.length; i++) { try { list[i](data); } catch (e) { /* lỗi của app ngoài không làm hỏng SDK */ } }
  }
  function need() { if (!cfg) throw err('not_init', 'Chưa gọi OpenEdu.init({ learnerUrl, appId }).'); return cfg; }
  function sessionKey() { return 'openedu:session:' + cfg.appId; }
  function queueKey() { return 'openedu:queue:' + cfg.appId; }
  function tokenValid() {
    return !!(session && session.token && session.token.accessToken && session.token.expiresAt * 1000 > nowMs() + 15000);
  }

  /* ---------------- làm sạch dữ liệu gửi đi (máy chủ kẹp lại lần nữa) ---------------- */
  function str(v, max) { return v === undefined || v === null ? '' : String(v).slice(0, max); }
  function num(v, max, whole) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    var n = Math.min(Math.max(v, 0), max);
    return whole ? Math.floor(n) : n;
  }
  function byteLength(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3; }
    return n;
  }
  /**
   * Chuẩn hóa một kết quả học trước khi gửi (clean an activity payload).
   * @param {object} input xem OpenEdu.record
   * @returns {object} payload gửi cho máy chủ (chưa có appId, clientId)
   */
  function clean(input) {
    var a = input || {};
    var kind = str(a.kind, 64).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'other';
    var score = num(a.score, 100000, false);
    var maxScore = num(a.maxScore, 100000, false);
    var correct = num(a.correct, 10000, true);
    var total = num(a.total, 10000, true);
    if (score !== null && maxScore !== null && score > maxScore) score = maxScore;
    if (correct !== null && total !== null && correct > total) correct = total;
    var detail = {};
    if (a.detail && typeof a.detail === 'object' && Object.prototype.toString.call(a.detail) === '[object Object]') {
      try {
        var json = JSON.stringify(a.detail);
        detail = byteLength(json) <= MAX_DETAIL_BYTES ? JSON.parse(json) : { truncated: true };
      } catch (e) { detail = {}; }
    }
    var skills = [];
    if (Object.prototype.toString.call(a.skills) === '[object Array]') {
      for (var i = 0; i < a.skills.length && skills.length < 10; i++) {
        if (typeof a.skills[i] === 'string' && a.skills[i].length <= 64 && skills.indexOf(a.skills[i]) < 0) skills.push(a.skills[i]);
      }
    }
    return {
      activityId: str(a.activityId, 120),
      title: str(a.title, 200),
      kind: kind,
      score: score,
      maxScore: maxScore,
      correct: correct,
      total: total,
      durationSec: num(a.durationSec, 86400, true),
      completed: a.completed === undefined || a.completed === null ? true : !!a.completed,
      detail: detail,
      skills: skills,
      at: new Date(nowMs()).toISOString()
    };
  }

  /* ---------------- phiên đăng nhập ---------------- */
  function setSession(s) {
    session = s;
    writeJson('session', sessionKey(), s);
    emit('change', getUser());
    renderButtons();
  }
  function restoreSession() {
    var s = readJson('session', sessionKey(), null);
    if (s && s.user && s.user.id) {
      session = s;
      if (s.token && !tokenValid()) session.token = null; // hết hạn: giữ tên để chào, cần đăng nhập lại mới ghi được
    }
  }

  /**
   * Khởi tạo (initialize). Gọi một lần khi trang tải xong.
   * @param {{learnerUrl: string, appId: string}} options
   *   learnerUrl — địa chỉ app học sinh OPEN-EDU của trường, vd 'https://hoc.truong.edu.vn'
   *   appId — mã ứng dụng do quản trị viên đăng kí (Quản trị → Ứng dụng kết nối)
   */
  function init(options) {
    var o = options || {};
    var a;
    if (!o.learnerUrl || !o.appId) throw err('bad_config', 'OpenEdu.init cần learnerUrl và appId.');
    try {
      a = win.document.createElement('a'); a.href = String(o.learnerUrl);
    } catch (e) { a = null; }
    if (!a || !/^https?:$/.test(a.protocol) || !a.host) throw err('bad_config', 'learnerUrl phải là địa chỉ http(s) đầy đủ.');
    cfg = { learnerUrl: String(o.learnerUrl).replace(/\/+$/, ''), learnerOrigin: a.protocol + '//' + a.host, appId: String(o.appId) };
    restoreSession();
    if (win.addEventListener && !init.bound) {
      init.bound = true;
      win.addEventListener('online', function () { flush(); });
    }
    if (tokenValid()) flush();
    renderButtons();
    return api;
  }

  /**
   * Mở cửa sổ "Đăng nhập bằng OPEN-EDU" (sign in). PHẢI gọi trong sự kiện bấm của người dùng, nếu không trình duyệt chặn cửa sổ.
   * @returns {Promise<{id: string, name: string, grade: number|null, classId: string|null, className: string|null, avatarMascot: string}>}
   *   Lỗi có thuộc tính code: 'popup_blocked' | 'closed' | 'denied' | 'unknown_app' | 'origin_not_allowed' | 'not_student' | 'error'
   */
  function signIn() {
    var c = need();
    if (pending) { try { pending.popup.focus(); } catch (e) { /* bỏ qua */ } return pending.promise; }
    var state = randomId(32);
    var url = c.learnerUrl + '/ket-noi?app=' + encodeURIComponent(c.appId) +
      '&origin=' + encodeURIComponent(win.location.origin) + '&state=' + state;
    var w = 460; var h = 700;
    var left = Math.max(0, ((win.screen && win.screen.width) || 1000) / 2 - w / 2);
    var top = Math.max(0, ((win.screen && win.screen.height) || 800) / 2 - h / 2);
    var popup = win.open(url, 'openedu-connect', 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
    if (!popup) return Promise.reject(err('popup_blocked', 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên rồi bấm lại.'));

    var entry = { popup: popup, promise: null };
    entry.promise = new Promise(function (resolve, reject) {
      var timer = null;
      function done() {
        win.removeEventListener('message', onMessage);
        if (timer) win.clearInterval(timer);
        pending = null;
      }
      function onMessage(ev) {
        // Chỉ tin tin nhắn đến từ đúng origin của app học sinh và đúng mã state vừa sinh.
        if (ev.origin !== c.learnerOrigin) return;
        var d = ev.data;
        if (!d || d.type !== MSG_TYPE || d.state !== state) return;
        done();
        if (d.error || !d.user || !d.user.id) {
          reject(err(d.error || 'error', messageFor(d.error)));
          return;
        }
        setSession({ user: d.user, token: d.token || null, api: d.api || null, demo: !d.token });
        resolve(d.user);
        flush();
      }
      win.addEventListener('message', onMessage);
      timer = win.setInterval(function () {
        var closed = true;
        try { closed = popup.closed; } catch (e) { closed = false; }
        if (closed) {
          // Chờ thêm một nhịp: tin nhắn có thể đến ngay trước khi cửa sổ đóng.
          win.clearInterval(timer); timer = null;
          win.setTimeout(function () { if (pending === entry) { done(); reject(err('closed', 'Em đã đóng cửa sổ đăng nhập.')); } }, 400);
        }
      }, 500);
    });
    pending = entry;
    return entry.promise;
  }
  function messageFor(code) {
    switch (code) {
      case 'denied': return 'Em đã chọn không cho phép.';
      case 'unknown_app': return 'Ứng dụng này chưa được nhà trường đăng kí với OPEN-EDU (hoặc đã tắt).';
      case 'origin_not_allowed': return 'Địa chỉ trang này chưa được nhà trường cho phép kết nối OPEN-EDU.';
      case 'not_student': return 'Chỉ tài khoản học sinh mới kết nối được.';
      default: return 'Chưa đăng nhập được bằng OPEN-EDU. Thử lại nhé.';
    }
  }

  /** Người đang đăng nhập (current user) hoặc null. Vẫn trả tên khi token đã hết hạn — xem isSignedIn(). */
  function getUser() { return session && session.user ? session.user : null; }
  /** true khi còn token dùng được để ghi kết quả (ở chế độ demo: true ngay sau khi đăng nhập). */
  function isSignedIn() { return !!session && (session.demo ? true : tokenValid()); }
  /** Quên người dùng trên trang này (sign out). Không đăng xuất khỏi app OPEN-EDU. Kết quả chưa gửi vẫn nằm trong hàng đợi. */
  function signOut() { need(); setSession(null); }

  /* ---------------- ghi kết quả ---------------- */
  function loadQueue() {
    var q = readJson('local', queueKey(), []);
    if (Object.prototype.toString.call(q) !== '[object Array]') q = [];
    var min = nowMs() - QUEUE_MAX_AGE_MS; var out = [];
    for (var i = 0; i < q.length; i++) if (q[i] && q[i].userId && q[i].payload && q[i].queuedAt > min) out.push(q[i]);
    return out;
  }
  function saveQueue(q) {
    if (q.length > MAX_QUEUE) q = q.slice(q.length - MAX_QUEUE);
    writeJson('local', queueKey(), q.length ? q : null);
  }
  function removeFromQueue(clientId) {
    var q = loadQueue(); var out = [];
    for (var i = 0; i < q.length; i++) if (q[i].payload.clientId !== clientId) out.push(q[i]);
    saveQueue(out);
  }
  /** Số kết quả của người đang đăng nhập còn chờ gửi (pending count). */
  function pendingCount() {
    if (!cfg || !session) return 0;
    var q = loadQueue(); var n = 0;
    for (var i = 0; i < q.length; i++) if (q[i].userId === session.user.id) n++;
    return n;
  }

  /** Gửi một dòng. Trả Promise<{ok, id?, retry?, expired?, message?}> — không bao giờ reject. */
  function send(payload) {
    var s = session;
    return win.fetch(s.api.url.replace(/\/+$/, '') + '/rest/v1/rpc/record_external_activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': s.api.anonKey,
        'Authorization': 'Bearer ' + s.token.accessToken,
        'Content-Profile': 'v2'
      },
      body: JSON.stringify({ p: payload })
    }).then(function (res) {
      if (res.ok) return res.json().then(function (id) { return { ok: true, id: id }; }, function () { return { ok: true, id: null }; });
      return res.text().then(function (text) {
        var msg = '';
        try { msg = JSON.parse(text).message || ''; } catch (e) { msg = ''; }
        // 401 = token hết hạn / không hợp lệ → cần đăng nhập lại, giữ trong hàng đợi.
        if (res.status === 401 || /jwt/i.test(msg)) return { ok: false, expired: true, retry: true, message: 'Phiên đăng nhập đã hết hạn.' };
        if (res.status >= 500 || res.status === 429) return { ok: false, retry: true, message: msg || 'Máy chủ đang bận.' };
        return { ok: false, retry: false, message: msg || ('Máy chủ từ chối (' + res.status + ').') };
      });
    }, function () {
      return { ok: false, retry: true, offline: true, message: 'Mất mạng.' };
    });
  }

  function scheduleRetry() {
    if (retryTimer || !win.setTimeout) return;
    retryTimer = win.setTimeout(function () { retryTimer = null; flush(); }, RETRY_MS);
  }

  /**
   * Gửi các kết quả đang chờ của người đang đăng nhập (flush queue). SDK tự gọi khi đăng nhập xong, khi có mạng lại, và 30 giây một lần khi còn hàng chờ.
   * @returns {Promise<number>} số dòng đã gửi được
   */
  function flush() {
    if (!cfg || flushing || !session || session.demo || !session.api) return Promise.resolve(0);
    if (!tokenValid()) { if (pendingCount() > 0) emit('expired', getUser()); return Promise.resolve(0); }
    flushing = true;
    var sent = 0;
    var userId = session.user.id;
    function next() {
      if (!session || session.user.id !== userId || !tokenValid()) return Promise.resolve();
      var q = loadQueue(); var item = null;
      for (var i = 0; i < q.length; i++) if (q[i].userId === userId) { item = q[i]; break; }
      if (!item) return Promise.resolve();
      return send(item.payload).then(function (r) {
        if (r.ok) { removeFromQueue(item.payload.clientId); sent++; emit('saved', { id: r.id, clientId: item.payload.clientId }); return next(); }
        if (r.expired) { expire(); return; }
        if (r.retry) { scheduleRetry(); return; }
        removeFromQueue(item.payload.clientId); // máy chủ từ chối hẳn (dữ liệu sai, app bị tắt, quá giới hạn): bỏ, báo lỗi
        emit('error', { clientId: item.payload.clientId, message: r.message });
        return next();
      });
    }
    return next().then(function () { flushing = false; return sent; }, function () { flushing = false; return sent; });
  }
  function expire() {
    if (session) { session.token = null; writeJson('session', sessionKey(), session); }
    emit('expired', getUser());
    renderButtons();
  }

  /**
   * Ghi một kết quả học vào hồ sơ OPEN-EDU của học sinh đang đăng nhập (record a learning result).
   * @param {object} data
   * @param {string} [data.activityId]  mã bài trong app của bạn (≤120 kí tự), vd 'bai-doc-12'
   * @param {string} [data.title]       tên bài hiển thị cho thầy/cô (≤200 kí tự)
   * @param {string} [data.kind]        loại hoạt động: 'reading' | 'quiz' | 'game' | 'writing' | ... (chữ thường, số, gạch nối)
   * @param {number} [data.score]       điểm đạt được
   * @param {number} [data.maxScore]    điểm tối đa
   * @param {number} [data.correct]     số câu đúng
   * @param {number} [data.total]       tổng số câu
   * @param {number} [data.durationSec] thời gian làm (giây)
   * @param {boolean} [data.completed]  đã làm xong chưa (mặc định true)
   * @param {object} [data.detail]      chi tiết tùy ý (JSON ≤ 8 KB), vd { answers: [...] }
   * @param {string[]} [data.skills]    mã kĩ năng OPEN-EDU (tùy chọn, ≤10; mã lạ bị bỏ)
   * @param {string} [data.clientId]    khóa chống ghi trùng; bỏ trống thì SDK tự sinh. Truyền lại cùng khóa để CẬP NHẬT dòng cũ.
   * @returns {Promise<{saved: boolean, id?: string, queued?: boolean, demo?: boolean, reason?: string, message?: string, clientId: string}>}
   *   saved=true: đã vào hồ sơ. queued=true: đã cất trong máy, sẽ tự gửi lại (mất mạng / hết phiên → reason 'offline' | 'expired' | 'server').
   *   demo=true: OPEN-EDU đang chạy chế độ demo, không ghi dữ liệu. Reject khi chưa ai đăng nhập hoặc máy chủ từ chối hẳn.
   */
  function record(data) {
    var c;
    try { c = need(); } catch (e) { return Promise.reject(e); }
    if (!session || !session.user) return Promise.reject(err('not_signed_in', 'Chưa đăng nhập bằng OPEN-EDU nên chưa ghi được kết quả.'));
    var payload = clean(data);
    payload.appId = c.appId;
    payload.clientId = data && data.clientId ? str(data.clientId, 80) : randomId(24);
    if (session.demo) {
      return Promise.resolve({ saved: false, demo: true, clientId: payload.clientId, message: 'Chế độ demo: không ghi dữ liệu.' });
    }
    // Luôn cất vào hàng đợi trước (đóng tab giữa chừng cũng không mất), gửi được thì gỡ ra.
    var q = loadQueue();
    q.push({ userId: session.user.id, queuedAt: nowMs(), payload: payload });
    saveQueue(q);
    if (!tokenValid()) {
      emit('expired', getUser());
      return Promise.resolve({ saved: false, queued: true, reason: 'expired', clientId: payload.clientId, message: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để gửi kết quả.' });
    }
    return send(payload).then(function (r) {
      if (r.ok) {
        removeFromQueue(payload.clientId);
        emit('saved', { id: r.id, clientId: payload.clientId });
        return { saved: true, id: r.id, clientId: payload.clientId };
      }
      if (r.expired) { expire(); return { saved: false, queued: true, reason: 'expired', clientId: payload.clientId, message: r.message }; }
      if (r.retry) { scheduleRetry(); return { saved: false, queued: true, reason: r.offline ? 'offline' : 'server', clientId: payload.clientId, message: r.message }; }
      removeFromQueue(payload.clientId);
      emit('error', { clientId: payload.clientId, message: r.message });
      throw err('rejected', r.message);
    });
  }

  /* ---------------- sự kiện + nút bấm ---------------- */
  /**
   * Nghe sự kiện (subscribe). Trả hàm hủy.
   * @param {'change'|'expired'|'saved'|'error'} name
   *   change(user|null): đăng nhập / đăng xuất · expired(user): token hết hạn, cần signIn lại · saved({id, clientId}) · error({clientId, message})
   * @param {function} fn
   */
  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () {
      var l = listeners[name] || []; var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    };
  }


  /* ---------------------------- xAPI (dữ liệu học chi tiết) ---------------------------- */
  var XAPI_SKILLS = 'https://open-edu.vn/xapi/skills';
  function uuid4() {
    var c = win.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var h = ''; for (var i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20);
  }
  /**
   * Gửi câu xAPI (một hoặc mảng, tối đa 50) về OPEN-EDU. Người học luôn là em đang đăng nhập (actor bị bỏ qua).
   * Trả Promise<{saved, ids?, reason?, message?}> — không reject.
   */
  function xapi(statements) {
    need();
    var list = Array.isArray(statements) ? statements : [statements];
    if (!session) return Promise.resolve({ saved: false, reason: 'signed_out', message: 'Em chưa đăng nhập.' });
    if (session.demo || !session.api) return Promise.resolve({ saved: false, reason: 'demo', message: 'Chế độ thử: không gửi dữ liệu.' });
    if (!tokenValid()) { expire(); return Promise.resolve({ saved: false, reason: 'expired', message: 'Phiên đăng nhập đã hết hạn.' }); }
    var s = session;
    for (var i = 0; i < list.length; i++) { if (!list[i].id) list[i].id = uuid4(); if (!list[i].timestamp) list[i].timestamp = new Date().toISOString(); }
    return win.fetch(s.api.url.replace(/\/+$/, '') + '/functions/v1/lti/xapi/statements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': s.api.anonKey, 'Authorization': 'Bearer ' + s.token.accessToken, 'X-OpenEdu-App': cfg.appId, 'X-Experience-API-Version': '1.0.3' },
      body: JSON.stringify(list)
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = null; try { body = JSON.parse(text); } catch (e) { body = null; }
        if (res.ok) return { saved: true, ids: body };
        if (res.status === 401) { expire(); return { saved: false, reason: 'expired', message: 'Phiên đăng nhập đã hết hạn.' }; }
        return { saved: false, reason: 'server', message: (body && body.error_description) || ('Máy chủ từ chối (' + res.status + ').') };
      });
    }, function () { return { saved: false, reason: 'offline', message: 'Mất mạng.' }; });
  }
  /**
   * Một câu trả lời: { activityId, questionId, question?, correct, skills?: [mã kĩ năng], response?, durationSec?, score?: 0..1 }
   */
  function answer(d) {
    need();
    var base = (win.location ? win.location.origin : 'app') + '/' + str(d.activityId || 'bai', 120);
    var result = { success: !!d.correct };
    if (typeof d.score === 'number') result.score = { scaled: Math.max(0, Math.min(1, d.score)) };
    if (typeof d.durationSec === 'number') result.duration = 'PT' + Math.max(0, Math.round(d.durationSec)) + 'S';
    if (d.response !== undefined) result.response = str(d.response, 500);
    var ext = {}; ext[XAPI_SKILLS] = Array.isArray(d.skills) ? d.skills.slice(0, 10) : [];
    return xapi({
      verb: { id: 'http://adlnet.gov/expapi/verbs/answered' },
      object: { id: base + '/' + str(d.questionId || 'cau', 120), definition: { name: { 'vi-VN': str(d.question || d.questionId, 300) }, extensions: ext } },
      result: result
    });
  }

  function renderButtons() {
    for (var i = 0; i < buttons.length; i++) renderButton(buttons[i]);
  }
  function renderButton(b) {
    var doc = win.document;
    var u = getUser();
    while (b.el.firstChild) b.el.removeChild(b.el.firstChild);
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.setAttribute('style', 'font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:inline-flex;align-items:center;gap:8px;' +
      'padding:10px 16px;min-height:44px;border-radius:999px;border:2px solid #0f766e;cursor:pointer;' +
      (u && isSignedIn() ? 'background:#fff;color:#0f766e;' : 'background:#0f766e;color:#fff;'));
    if (u && isSignedIn()) {
      btn.appendChild(doc.createTextNode('👋 ' + u.name + (u.className ? ' · ' + u.className : '') + ' — Thoát'));
      btn.onclick = function () { signOut(); };
    } else {
      btn.appendChild(doc.createTextNode(u ? 'Đăng nhập lại bằng OPEN-EDU' : 'Đăng nhập bằng OPEN-EDU'));
      btn.onclick = function () {
        signIn().then(function (user) { if (b.onSignIn) b.onSignIn(user); }, function (e) {
          if (b.onError) b.onError(e); else if (e.code !== 'closed' && e.code !== 'denied') win.alert(e.message);
        });
      };
    }
    b.el.appendChild(btn);
  }
  /**
   * Gắn nút "Đăng nhập bằng OPEN-EDU" (mount button). Nút tự đổi thành "👋 Tên — Thoát" khi đã đăng nhập.
   * @param {Element|string} [element] phần tử (hoặc bộ chọn CSS) để đặt nút; bỏ trống → nút nổi ở góc dưới bên phải
   * @param {{onSignIn?: function, onError?: function}} [options]
   * @returns {Element} phần tử chứa nút
   */
  function mountButton(element, options) {
    need();
    var doc = win.document;
    var el = typeof element === 'string' ? doc.querySelector(element) : element;
    if (!el) {
      el = doc.createElement('div');
      el.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483000;');
      doc.body.appendChild(el);
    }
    var b = { el: el, onSignIn: options && options.onSignIn, onError: options && options.onError };
    buttons.push(b);
    renderButton(b);
    return el;
  }

  var api = {
    version: VERSION,
    init: init,
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    isSignedIn: isSignedIn,
    record: record,
    xapi: xapi,
    answer: answer,
    flush: flush,
    pendingCount: pendingCount,
    on: on,
    mountButton: mountButton,
    /** Chỉ để kiểm thử (tests only). */
    _clean: clean
  };
  return api;
});
