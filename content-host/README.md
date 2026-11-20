# content-host — máy chủ nội dung cho gói HTML5 / H5P / SCORM

Thư mục này là một **trang tĩnh** triển khai lên **một origin riêng**, ví dụ `https://content.openedu.vn`
(khác hẳn origin của app học sinh `https://hoc.openedu.vn` và app GV). Trong app, component
`PackageHost` (gói `@openedu/lesson-player`) mở `launcher.html` của origin này trong một iframe sandbox.

```
content-host/
  launcher.html        trang chạy gói (nhận tham số qua URL)
  launcher.js          logic: html / scorm12 / scorm2004 / h5p → gửi kết quả về app bằng postMessage
  openedu-bridge.js    SDK nhỏ cho trang HTML5 do GV / AI làm
  samples/dem-tao/     trò chơi mẫu "Đếm táo" (lớp 1)
  packages/<id>/       (khi triển khai) nơi đặt gói đã giải nén
```

## Vì sao phải dùng origin riêng?

1. **Supabase Storage không chạy được HTML.** Storage trả tệp `.html` với `Content-Type: text/plain`
   và kèm header CSP `sandbox` — trình duyệt hiện mã nguồn hoặc chặn script, nên gói H5P/SCORM/HTML5
   không thể chạy trực tiếp từ đó. Ta cần một máy chủ tĩnh trả đúng `text/html`, `application/javascript`…
2. **An toàn cho học sinh.** Gói nội dung là mã của bên ngoài (GV tải lên, AI tạo, SCORM mua về).
   `PackageHost` dùng `sandbox="allow-scripts allow-same-origin allow-forms"`. Cờ `allow-same-origin` cần cho
   SCORM (SCO gọi `window.parent.API`) và H5P (storage) — nhưng **chỉ an toàn khi origin nội dung khác origin app**:
   khi đó gói không đọc được cookie, `localStorage`, phiên đăng nhập Supabase hay DOM của app.
   Nếu đặt gói chung origin với app, `allow-scripts` + `allow-same-origin` cho phép gói tự gỡ sandbox.
   Vì vậy `PackageHost` **từ chối** gói có `baseUrl` cùng origin với app.

## Cách hoạt động

```
App (hoc.openedu.vn)                       Origin nội dung (content.openedu.vn)
┌────────────────────────┐   iframe        ┌──────────────────────────────┐
│ PackageHost            │ ──────────────▶ │ launcher.html?base=…&kind=…  │
│  nghe "message",       │                 │   ├─ html: iframe con + relay │
│  chỉ nhận e.origin =   │ ◀── postMessage │   ├─ scorm: window.API(_1484) │
│  origin nội dung       │   (targetOrigin │   └─ h5p: h5p-standalone      │
└────────────────────────┘    = app)       └──────────────────────────────┘
```

Tham số URL của `launcher.html`:

| Tham số | Ý nghĩa |
|---|---|
| `base` | URL thư mục gói, kết thúc bằng `/`. **Phải cùng origin với launcher.** |
| `kind` | `html` · `scorm12` · `scorm2004` · `h5p` |
| `entry` | Tệp mở đầu, tương đối với `base` (vd `index.html`, `story.html`). Với `h5p` là thư mục chứa `h5p.json` (có thể để trống). Không được trỏ ra ngoài `base`. |
| `parentOrigin` | Origin của app. Launcher chỉ gửi kết quả tới đúng origin này (không bao giờ dùng `'*'`). |

Tin nhắn gửi về app:

```js
{ source: 'openedu-bridge', type: 'ready' | 'progress' | 'result' | 'error',
  score?: number /* 0..1 */, completed?: boolean, progress?: number /* 0..1 */, raw?: unknown }
```

- `ready`: gói đã tải (app ẩn màn chờ; nếu sau 15 giây chưa có `ready`, app hiện lỗi thân thiện và nút "Thử lại").
- SCORM 1.2: gửi `result` khi gói gọi `LMSCommit` / `LMSFinish`; điểm = `cmi.core.score.raw` chia `max`
  (hoặc chia 100), `completed` khi `lesson_status` là `completed` / `passed` / `failed`.
- SCORM 2004: khi `Commit` / `Terminate`; điểm = `cmi.score.scaled` (hoặc raw/max); `completed` theo
  `completion_status` / `success_status`.
- H5P: nghe `H5P.externalDispatcher.on('xAPI')`, câu lệnh `completed` / `answered` ở cấp cao nhất → `result`
  với `result.score.scaled`; câu con trong bộ câu hỏi → `progress`.

### Thư viện CDN (ghim phiên bản chính xác + SRI)

| Thư viện | Phiên bản | Tệp |
|---|---|---|
| scorm-again | `3.4.7` (phát hành 21/10/2026) | `dist/scorm12.min.js`, `dist/scorm2004.min.js` |
| h5p-standalone | `3.8.2` (phát hành 24/03/2026) | `dist/main.bundle.js`, `dist/frame.bundle.js`, `dist/styles/h5p.css` |

Tải từ `https://cdn.jsdelivr.net/npm/<gói>@<phiên bản>/dist/…`, có thuộc tính `integrity` (SRI) cho các script
launcher nạp trực tiếp. Khi nâng phiên bản: chọn bản đã phát hành ít nhất 2 tuần
(`npm view scorm-again version time --json`), rồi tính lại SRI:

```bash
npm pack scorm-again@<ver> && tar xzf scorm-again-<ver>.tgz
openssl dgst -sha384 -binary package/dist/scorm12.min.js | openssl base64 -A
```

Phòng tin không có Internet ổn định? Chép thư mục `dist/` của hai gói vào `content-host/vendor/` rồi đổi
`SCORM_AGAIN` / `H5P_STANDALONE` trong `launcher.js` sang `/vendor/…`.

## SDK cho trang HTML5: `openedu-bridge.js`

```html
<script src="/openedu-bridge.js"></script>
<script>
  OpenEdu.ready();          // trang đã sẵn sàng
  OpenEdu.progress(0.4);    // làm được 40%
  OpenEdu.complete(0.8);    // xong, điểm 0..1 (bỏ trống = chỉ báo hoàn thành)
</script>
```

Mở trang trực tiếp (không qua launcher) thì các hàm không làm gì, nên GV vẫn xem thử được.
Ví dụ đầy đủ: `samples/dem-tao/index.html` (5 lượt, chạm vào giỏ có đúng số táo, không dùng tài nguyên ngoài).

## Triển khai

### Cách 1 — Cloudflare R2 + tên miền phụ

1. Tạo bucket, vd `openedu-content`.
2. Tải tệp lên **kèm Content-Type đúng** (R2 trả về đúng loại đã ghi lúc tải lên):
   ```bash
   npx wrangler r2 object put openedu-content/launcher.html --file content-host/launcher.html --content-type "text/html; charset=utf-8"
   npx wrangler r2 object put openedu-content/launcher.js --file content-host/launcher.js --content-type "application/javascript; charset=utf-8"
   npx wrangler r2 object put openedu-content/openedu-bridge.js --file content-host/openedu-bridge.js --content-type "application/javascript; charset=utf-8"
   ```
   Tải nhiều tệp (cả gói đã giải nén): dùng `rclone copy` với remote S3 của R2 — rclone tự đặt Content-Type theo đuôi tệp.
3. Bucket → **Settings → Custom Domains** → gắn `content.openedu.vn` (tên miền phải ở trên Cloudflare).
4. **Rules → Transform Rules → Modify Response Header** cho hostname `content.openedu.vn`, thêm:
   - `Content-Security-Policy: frame-ancestors 'self' https://hoc.openedu.vn https://lop.openedu.vn https://gv.openedu.vn`
     (chỉ app của mình được nhúng launcher)
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
5. Gói mới: giải nén vào `packages/<id>/`, lưu `ContentPackage.baseUrl = https://content.openedu.vn/packages/<id>/`.

### Cách 2 — Cloudflare Pages

```bash
npx wrangler pages deploy content-host --project-name openedu-content
```

Gắn tên miền `content.openedu.vn` trong **Pages → Custom domains**. Header đặt bằng tệp `content-host/_headers`
(tạo khi triển khai, không cần cho chạy thử):

```
/*
  Content-Security-Policy: frame-ancestors 'self' https://hoc.openedu.vn https://lop.openedu.vn https://gv.openedu.vn
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

Pages giới hạn 20 000 tệp / 25 MB mỗi tệp — gói lớn (video) nên đặt ở R2.

### Chỉ cho app của mình nhận kết quả (tùy chọn)

Trong `launcher.html`, bỏ comment dòng `window.OPENEDU_PARENT_ORIGINS = [...]` và điền origin các app.
Launcher sẽ không gửi kết quả cho trang nào khác.

## Chạy thử trên máy

App chạy ở `http://localhost:5173`, máy chủ nội dung ở cổng khác (khác cổng = khác origin, đúng như thật):

```bash
npx vite --port 5180 content-host
# hoặc bất kỳ máy chủ tĩnh nào:  python3 -m http.server 5180 -d content-host
```

- Mở thử trò chơi mẫu qua launcher:
  `http://localhost:5180/launcher.html?base=/samples/dem-tao/&kind=html&entry=index.html`
- Gói mẫu cho dữ liệu demo:
  ```js
  { id: 'pkg_dem_tao', kind: 'html', title: 'Đếm táo', baseUrl: 'http://localhost:5180/samples/dem-tao/',
    entry: 'index.html', ownerId: 'demo', createdAt: '2026-11-06T00:00:00Z' }
  ```
- SCORM: giải nén tệp `.zip` vào `content-host/packages/<id>/`, `entry` = `href` của tài nguyên trong `imsmanifest.xml`.
- H5P: đổi đuôi `.h5p` thành `.zip`, giải nén vào `content-host/packages/<id>/` (thư mục có `h5p.json`, `content/`
  và các thư viện `H5P.*`), `kind: 'h5p'`, `entry: ''`.
