/*
 * OPEN-EDU launcher — chạy trên ORIGIN NỘI DUNG RIÊNG (vd https://content.openedu.vn), không phải origin của app.
 *
 * URL: launcher.html?base=<thư mục gói, kết thúc bằng />&kind=html|scorm12|scorm2004|h5p&entry=<tệp mở đầu>&parentOrigin=<origin app>
 *
 * - html      : nạp base+entry vào iframe con cùng origin, chuyển tiếp tin openedu-bridge của trang lên app.
 * - scorm12   : scorm-again Scorm12API trên window.API; nghe LMSCommit / LMSFinish.
 * - scorm2004 : scorm-again Scorm2004API trên window.API_1484_11; nghe Commit / Terminate.
 * - h5p       : h5p-standalone; nghe H5P.externalDispatcher 'xAPI' (completed / answered).
 *
 * Gửi lên app (window.parent, targetOrigin = parentOrigin, không bao giờ '*'):
 *   { source:'openedu-bridge', type:'ready' | 'progress' | 'result' | 'error', score?: 0..1, completed?, progress?: 0..1, raw? }
 *
 * Viết kiểu ES2015 đơn giản để chạy trên Chrome 109 (Windows 7 phòng tin) và Safari 14.
 */
(function () {
  'use strict';

  /* Phiên bản ghim chính xác (đã phát hành > 2 tuần trước khi chọn). Đổi phiên bản = cập nhật cả mã SRI bên dưới. */
  var SCORM_AGAIN = 'https://cdn.jsdelivr.net/npm/scorm-again@3.4.7/dist/';
  var H5P_STANDALONE = 'https://cdn.jsdelivr.net/npm/h5p-standalone@3.8.2/dist/';
  var SRI = {
    'scorm12.min.js': 'sha384-fEjs1wbQlkVbgPciPxK8Q++lHn6Kl5XTnkcYCyO0mIMQ4OdSssU4nRGpkH2fzTxj',
    'scorm2004.min.js': 'sha384-M6Z90TxDcHIfUkG9cTsNqMKkc0K2LtWP58McUSRnP7N2yYqatBU/0H9qIGUftj6A',
    'main.bundle.js': 'sha384-76nt3pXQv+uxfJ7h8z5apkq+qNJP7ZvhjBIo+AV/gtAAxG6B3omQBLDv+eM2eEyA'
  };

  var params = new URLSearchParams(window.location.search);
  var kind = params.get('kind') || 'html';
  var stage = document.getElementById('stage');
  var msgEl = document.getElementById('msg');
  var parentOrigin = resolveParentOrigin(params.get('parentOrigin'));
  var readySent = false;

  /* ---------------- tiện ích ---------------- */

  function resolveParentOrigin(p) {
    var origin = null;
    try {
      if (p) origin = new URL(p).origin;
      else if (document.referrer) origin = new URL(document.referrer).origin;
    } catch (e) {
      origin = null;
    }
    if (!origin || origin === 'null') return null;
    var allow = window.OPENEDU_PARENT_ORIGINS;
    if (allow && allow.length && allow.indexOf(origin) < 0) return null;
    return origin;
  }

  function post(msg) {
    if (!parentOrigin || window.parent === window) return;
    msg.source = 'openedu-bridge';
    try {
      window.parent.postMessage(msg, parentOrigin);
    } catch (e) {
      /* dữ liệu không sao chép được: bỏ raw rồi gửi lại */
      delete msg.raw;
      try { window.parent.postMessage(msg, parentOrigin); } catch (e2) { /* bỏ qua */ }
    }
  }

  function ready() {
    if (readySent) return;
    readySent = true;
    hideMsg();
    post({ type: 'ready' });
  }

  function unit(n) {
    return typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined;
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /** Sao chép an toàn (bỏ hàm, vòng lặp), giới hạn kích thước. */
  function plain(v) {
    if (v === undefined) return undefined;
    try {
      var s = JSON.stringify(v);
      if (!s || s.length > 20000) return undefined;
      return JSON.parse(s);
    } catch (e) {
      return undefined;
    }
  }

  function showMsg(text, hint, isError) {
    msgEl.hidden = false;
    msgEl.className = isError ? 'is-error' : '';
    msgEl.textContent = text;
    if (hint) {
      var small = document.createElement('small');
      small.textContent = hint;
      msgEl.appendChild(small);
    }
  }
  function hideMsg() {
    msgEl.hidden = true;
  }

  function fail(text, detail) {
    showMsg('Ôi, bài chơi chưa mở được.', text, true);
    post({ type: 'error', message: text, raw: detail ? { detail: String(detail) } : undefined });
  }

  /**
   * base phải cùng origin với launcher (SCO cần gọi window.parent.API; trang HTML cần gửi tin cùng origin),
   * và entry phải nằm trong base (không cho trỏ ra ngoài bằng URL tuyệt đối hoặc ../).
   */
  function resolveEntry() {
    var base = params.get('base') || '';
    var entry = params.get('entry') || (kind === 'h5p' ? '' : 'index.html');
    var baseUrl;
    try {
      baseUrl = new URL(base, window.location.href);
    } catch (e) {
      return null;
    }
    if (baseUrl.origin !== window.location.origin) return null;
    if (baseUrl.pathname.charAt(baseUrl.pathname.length - 1) !== '/') baseUrl.pathname += '/';
    baseUrl.search = '';
    baseUrl.hash = '';
    var target;
    try {
      target = new URL(entry, baseUrl.href);
    } catch (e) {
      return null;
    }
    if (target.origin !== window.location.origin || target.href.indexOf(baseUrl.href) !== 0) return null;
    return target.href;
  }

  function loadScript(file, root) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = root + file;
      s.async = true;
      s.crossOrigin = 'anonymous';
      if (SRI[file]) s.integrity = SRI[file];
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Không tải được ' + root + file)); };
      document.head.appendChild(s);
    });
  }

  function makeFrame(url, title) {
    var f = document.createElement('iframe');
    f.src = url;
    f.title = title || 'Bài chơi';
    f.setAttribute('allow', 'autoplay; fullscreen');
    f.setAttribute('allowfullscreen', '');
    f.addEventListener('load', ready);
    stage.appendChild(f);
    return f;
  }

  /* ---------------- HTML ---------------- */

  function runHtml(url) {
    var frame = makeFrame(url, 'Bài chơi HTML5');
    window.addEventListener('message', function (e) {
      if (e.source !== frame.contentWindow || e.origin !== window.location.origin) return;
      var d = e.data;
      if (!d || typeof d !== 'object' || d.source !== 'openedu-bridge') return;
      if (d.type === 'ready') return ready();
      if (d.type === 'progress') {
        ready();
        return post({ type: 'progress', progress: unit(d.progress), raw: plain(d.raw) });
      }
      if (d.type === 'result') {
        ready();
        return post({ type: 'result', score: unit(d.score), completed: d.completed === true, raw: plain(d.raw) });
      }
    });
  }

  /* ---------------- SCORM ---------------- */

  function cmiGetter(api) {
    return function (el) {
      try {
        var v = api.getCMIValue(el);
        if (v !== undefined && v !== null) return String(v);
      } catch (e) { /* đọc theo đường dẫn bên dưới */ }
      try {
        var cur = api;
        var parts = el.split('.');
        for (var i = 0; i < parts.length; i++) cur = cur[parts[i]];
        return cur === undefined || cur === null ? '' : String(cur);
      } catch (e2) {
        return '';
      }
    };
  }

  function scaledFromRaw(raw, min, max) {
    if (raw === null) return undefined;
    var lo = min === null ? 0 : min;
    if (max !== null && max > lo) return unit((raw - lo) / (max - lo));
    return unit(raw / 100); // SCORM: raw mặc định thang 0–100
  }

  function runScorm12(url) {
    loadScript('scorm12.min.js', SCORM_AGAIN).then(function () {
      var api = new window.Scorm12API({ autocommit: false, lmsCommitUrl: false });
      window.API = api;
      var get = cmiGetter(api);
      var report = function (final) {
        var raw = num(get('cmi.core.score.raw'));
        var status = get('cmi.core.lesson_status');
        var completed = status === 'completed' || status === 'passed' || status === 'failed';
        post({
          type: 'result',
          score: scaledFromRaw(raw, num(get('cmi.core.score.min')), num(get('cmi.core.score.max'))),
          completed: completed,
          raw: { standard: 'scorm12', lessonStatus: status, scoreRaw: raw, final: final }
        });
      };
      api.on('LMSCommit', function () { report(false); });
      api.on('LMSFinish', function () { report(true); });
      makeFrame(url, 'Bài học SCORM');
    }).catch(function (err) {
      fail('Không tải được trình chạy SCORM. Em kiểm tra mạng rồi thử lại nhé.', err);
    });
  }

  function runScorm2004(url) {
    loadScript('scorm2004.min.js', SCORM_AGAIN).then(function () {
      var api = new window.Scorm2004API({ autocommit: false, lmsCommitUrl: false });
      window.API_1484_11 = api;
      var get = cmiGetter(api);
      var report = function (final) {
        var scaled = num(get('cmi.score.scaled'));
        var score = scaled !== null ? unit(scaled) : scaledFromRaw(num(get('cmi.score.raw')), num(get('cmi.score.min')), num(get('cmi.score.max')));
        var completion = get('cmi.completion_status');
        var success = get('cmi.success_status');
        post({
          type: 'result',
          score: score,
          completed: completion === 'completed' || success === 'passed' || success === 'failed',
          raw: { standard: 'scorm2004', completionStatus: completion, successStatus: success, final: final }
        });
        var pm = num(get('cmi.progress_measure'));
        if (pm !== null && !final) post({ type: 'progress', progress: unit(pm) });
      };
      api.on('Commit', function () { report(false); });
      api.on('Terminate', function () { report(true); });
      makeFrame(url, 'Bài học SCORM');
    }).catch(function (err) {
      fail('Không tải được trình chạy SCORM. Em kiểm tra mạng rồi thử lại nhé.', err);
    });
  }

  /* ---------------- H5P ---------------- */

  function verbOf(st) {
    var id = st && st.verb && st.verb.id ? String(st.verb.id) : '';
    return id.slice(id.lastIndexOf('/') + 1);
  }

  function runH5P(url) {
    loadScript('main.bundle.js', H5P_STANDALONE).then(function () {
      var host = document.createElement('div');
      host.className = 'h5p-host';
      stage.appendChild(host);
      // h5pJsonPath: thư mục chứa h5p.json (bỏ dấu / cuối).
      var h5pJsonPath = url.replace(/\/+$/, '');
      var player = new window.H5PStandalone.H5P(host, {
        h5pJsonPath: h5pJsonPath,
        frameJs: H5P_STANDALONE + 'frame.bundle.js',
        frameCss: H5P_STANDALONE + 'styles/h5p.css',
        frame: false,
        copyright: false,
        export: false,
        icon: false,
        fullScreen: true
      });
      return Promise.resolve(player).then(function () {
        ready();
        var H5P = window.H5P;
        if (!H5P || !H5P.externalDispatcher) return;
        H5P.externalDispatcher.on('xAPI', function (event) {
          var st = event && event.data ? event.data.statement : null;
          if (!st) return;
          var verb = verbOf(st);
          if (verb !== 'completed' && verb !== 'answered') return;
          var result = st.result || {};
          var scaled = result.score && typeof result.score.scaled === 'number' ? result.score.scaled : null;
          if (scaled === null && result.score && typeof result.score.raw === 'number' && result.score.max) {
            scaled = result.score.raw / result.score.max;
          }
          var ctx = st.context && st.context.contextActivities;
          var isSub = !!(ctx && ctx.parent && ctx.parent.length);
          if (isSub) {
            // câu con trong bộ câu hỏi: chỉ báo tiến độ, kết quả tính ở câu cha
            return post({ type: 'progress', raw: plain({ verb: verb, scaled: scaled }) });
          }
          post({
            type: 'result',
            score: scaled === null ? undefined : unit(scaled),
            completed: verb === 'completed' || result.completion === true || verb === 'answered',
            raw: plain({ verb: verb, success: result.success, duration: result.duration })
          });
        });
      });
    }).catch(function (err) {
      fail('Gói H5P chưa mở được. Em báo cô giáo kiểm tra gói nhé.', err);
    });
  }

  /* ---------------- khởi động ---------------- */

  var url = resolveEntry();
  if (!url) {
    fail('Địa chỉ gói không hợp lệ: gói phải nằm trên cùng máy chủ nội dung với launcher.');
    return;
  }
  if (!parentOrigin) {
    // Vẫn mở được để GV xem thử trực tiếp, nhưng không gửi kết quả đi đâu.
    if (window.console) console.warn('[openedu] thiếu hoặc không cho phép parentOrigin — sẽ không gửi kết quả.');
  }
  if (kind === 'html') runHtml(url);
  else if (kind === 'scorm12') runScorm12(url);
  else if (kind === 'scorm2004') runScorm2004(url);
  else if (kind === 'h5p') runH5P(url);
  else fail('Loại gói "' + kind + '" chưa được hỗ trợ.');
})();
