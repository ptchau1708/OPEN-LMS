# Cầu nối với app ngoài — “Đăng nhập bằng OPEN-EDU”

Tài liệu cho người phát triển một web app hoặc trang HTML học tập **bên ngoài** OPEN-EDU (ví dụ app đọc hiểu của trường).
Sau khi tích hợp, app của bạn:

1. dùng tài khoản OPEN-EDU của học sinh để đăng nhập (không cần tự làm hệ thống tài khoản, không giữ mật khẩu);
2. biết **tên, khối, lớp** của em;
3. ghi **kết quả học** (điểm, số câu đúng, thời gian…) vào hồ sơ học sinh — giáo viên xem ở *Hồ sơ học sinh → Hoạt động ở ứng dụng khác*.

Không cần máy chủ riêng, không có khóa bí mật nào đặt trong app của bạn.

Trang mẫu chạy được ngay: [`examples/connect/doc-hieu-mau.html`](../examples/connect/doc-hieu-mau.html).

---

## 1. Tích hợp trong 4 bước

### Bước 1 — Quản trị viên đăng kí app

Trong app giáo viên, tài khoản quản trị mở **Quản trị → Ứng dụng kết nối → Thêm ứng dụng** và nhập:

| Ô | Ví dụ | Ghi chú |
|---|---|---|
| Tên ứng dụng | `Đọc hiểu vui` | Học sinh thấy tên này trên màn hình xin phép |
| Mã ứng dụng | `doc-hieu` | chữ thường, số, gạch nối; không đổi được sau khi tạo |
| Địa chỉ được phép | `https://doc.truong.edu.vn` | **origin chính xác** của app, mỗi dòng một cái |

*Origin* là phần đầu của địa chỉ: `giao thức + tên miền (+ cổng)`, **không có đường dẫn**, không dùng `*`.
`https://doc.truong.edu.vn/bai/1` → origin là `https://doc.truong.edu.vn`.
Bắt buộc `https`; riêng `http://localhost:<cổng>` và `http://127.0.0.1:<cổng>` được phép để thử trên máy.

Bấm **Mã nhúng** để lấy đoạn mã đã điền sẵn địa chỉ app học sinh và mã ứng dụng.

### Bước 2 — Nạp SDK

```html
<script src="https://HOC.TRUONG.EDU.VN/openedu-connect.js"></script>
<script>
  OpenEdu.init({ learnerUrl: 'https://HOC.TRUONG.EDU.VN', appId: 'doc-hieu' });
</script>
```

`learnerUrl` là địa chỉ **app học sinh** OPEN-EDU của trường. SDK là một tệp JavaScript duy nhất, không phụ thuộc thư viện nào,
viết kiểu ES5 (chạy được trên máy cũ), tạo biến toàn cục `window.OpenEdu`.

### Bước 3 — Đăng nhập

Cách nhanh nhất — để SDK vẽ nút:

```html
<div id="login"></div>
<script>
  OpenEdu.mountButton('#login');            // bỏ tham số → nút nổi ở góc dưới bên phải
  OpenEdu.on('change', function (user) {    // user = null khi thoát
    if (user) console.log(user.name, user.grade, user.className);
  });
</script>
```

Hoặc tự làm nút:

```js
nut.onclick = function () {
  OpenEdu.signIn().then(function (user) {
    // { id, name, grade, classId, className, avatarMascot }
  }).catch(function (err) {
    // err.code: 'popup_blocked' | 'closed' | 'denied' | 'unknown_app' | 'origin_not_allowed' | 'not_student' | 'error'
    alert(err.message);
  });
};
```

`signIn()` **phải được gọi ngay trong sự kiện bấm** của người dùng, nếu không trình duyệt sẽ chặn cửa sổ bật lên.

Học sinh thấy: cửa sổ nhỏ của OPEN-EDU → (đăng nhập nếu chưa) → câu hỏi *“Cho phép «Đọc hiểu vui» biết tên, lớp của em và ghi kết quả học vào hồ sơ?”* → **Cho phép** / **Không**.

### Bước 4 — Ghi kết quả

```js
OpenEdu.record({
  activityId: 'chu-se-nho',                 // mã bài trong app của bạn
  title: 'Chú sẻ nhỏ và bông hoa bằng lăng',
  kind: 'reading',
  correct: 2, total: 3,                     // số câu đúng / tổng số câu
  score: 6.7, maxScore: 10,                 // (tùy chọn) điểm
  durationSec: 240,
  detail: { answers: [1, 0, 1] }            // (tùy chọn) JSON nhỏ tùy ý
}).then(function (r) {
  if (r.saved) { /* đã vào hồ sơ */ }
  else if (r.queued) { /* mất mạng / hết phiên: đã cất trong máy, SDK tự gửi lại */ }
  else if (r.demo) { /* OPEN-EDU đang chạy demo: không ghi */ }
});
```

---

## 2. Tham chiếu SDK

| Hàm | Ý nghĩa |
|---|---|
| `OpenEdu.init({ learnerUrl, appId })` | Khởi tạo. Gọi một lần khi tải trang. Tự khôi phục phiên còn hạn trong tab. |
| `OpenEdu.signIn()` → `Promise<user>` | Mở cửa sổ đăng nhập / xin phép. |
| `OpenEdu.getUser()` | Người đang đăng nhập hoặc `null`. Vẫn trả tên khi phiên đã hết hạn. |
| `OpenEdu.isSignedIn()` | `true` khi còn phiên để ghi kết quả. |
| `OpenEdu.signOut()` | Quên người dùng **trên trang của bạn** (không đăng xuất khỏi OPEN-EDU). |
| `OpenEdu.record(data)` → `Promise<kết quả>` | Ghi một kết quả học (bảng dưới). |
| `OpenEdu.flush()` | Gửi ngay các kết quả đang chờ. SDK tự gọi khi đăng nhập lại, khi có mạng lại và 30 giây một lần. |
| `OpenEdu.pendingCount()` | Số kết quả của người đang đăng nhập còn chờ gửi. |
| `OpenEdu.on(tên, hàm)` | Sự kiện: `change(user)`, `expired(user)`, `saved({id, clientId})`, `error({clientId, message})`. Trả hàm hủy. |
| `OpenEdu.mountButton(phầnTử?, { onSignIn?, onError? })` | Vẽ nút “Đăng nhập bằng OPEN-EDU”; đã đăng nhập thì thành “👋 Tên · Lớp — Thoát”. |

### Các trường của `record(data)` — đều không bắt buộc

| Trường | Kiểu | Giới hạn | Ghi chú |
|---|---|---|---|
| `activityId` | chuỗi | ≤ 120 kí tự | mã bài trong app của bạn |
| `title` | chuỗi | ≤ 200 kí tự | tên bài giáo viên nhìn thấy |
| `kind` | chuỗi | chữ thường/số/gạch nối, ≤ 32 | `reading`, `quiz`, `game`, `writing`, `math`… (mặc định `other`) |
| `score`, `maxScore` | số | 0 – 100 000 | `score` không vượt `maxScore` |
| `correct`, `total` | số nguyên | 0 – 10 000 | `correct` không vượt `total` |
| `durationSec` | số nguyên | 0 – 86 400 | thời gian làm (giây) |
| `completed` | boolean | | mặc định `true` |
| `detail` | object JSON | ≤ 8 KB | lớn hơn sẽ bị thay bằng `{ "truncated": true }` |
| `skills` | mảng chuỗi | ≤ 10 | mã kĩ năng OPEN-EDU (vd `T1.STN.DEM-DOC-VIET`); mã không có thật bị bỏ |
| `clientId` | chuỗi | ≤ 80 | khóa chống ghi trùng. Bỏ trống → SDK tự sinh. Truyền lại **cùng khóa** để *cập nhật* dòng cũ (vd lưu tiến độ rồi lưu kết quả cuối) |

Giá trị vượt giới hạn được **kẹp lại** (ở SDK và lần nữa ở máy chủ), không gây lỗi.
`record()` trả `{ saved, id?, queued?, reason?, demo?, message?, clientId }`; *reject* khi chưa ai đăng nhập (`not_signed_in`)
hoặc máy chủ từ chối hẳn (`rejected`: app bị tắt, quá 300 lượt/ngày…).

### Hàng đợi khi mất mạng / hết phiên

Mỗi kết quả được cất vào `localStorage` trước khi gửi, gửi được mới gỡ ra — đóng tab giữa chừng cũng không mất.
Hàng đợi **gắn với từng học sinh**: trên máy dùng chung, kết quả của em A chỉ được gửi khi chính em A đăng nhập lại.
Giữ tối đa 200 dòng trong 30 ngày. Phiên đăng nhập sống khoảng 1 giờ; khi hết, SDK phát sự kiện `expired` — hãy mời em bấm đăng nhập lại
(nút của `mountButton` tự đổi thành “Đăng nhập lại bằng OPEN-EDU”), hàng đợi sẽ tự được gửi.

---

### Dữ liệu học chi tiết (xAPI) — thêm 21/11/2026
```js
OpenEdu.answer({ activityId: 'bai-1', questionId: 'cau-2', question: 'Ý chính của đoạn 1?', correct: false,
                 skills: ['TV5-DH-YCHINH'], response: 'B', durationSec: 40 });
OpenEdu.xapi([{ verb: { id: 'http://adlnet.gov/expapi/verbs/completed' }, object: { id: 'https://…/bai-1' },
                result: { score: { raw: 8, max: 10 }, completion: true } }]);
```
Trả `Promise<{ saved, ids?, reason?, message? }>`, không reject. Gửi tới Edge Function `lti` (`/xapi/statements`) bằng
phiên đăng nhập của em + `X-OpenEdu-App`; origin trang phải nằm trong “Địa chỉ được phép”. Chưa có hàng đợi ngoại tuyến
cho xAPI (khác `record`). Cùng định dạng với app LTI — xem docs/KET_NOI_LTI.md.

## 3. Bên dưới hoạt động thế nào

```
App của bạn (https://doc.truong.edu.vn)            App học sinh OPEN-EDU (https://hoc.truong.edu.vn)
        │  window.open(/ket-noi?app=doc-hieu&origin=https://doc.truong.edu.vn&state=<ngẫu nhiên>)
        ├──────────────────────────────────────────────►│ 1. cần window.opener
        │                                               │ 2. học sinh đăng nhập (nếu chưa)
        │                                               │ 3. tra sổ đăng kí: app đang bật? origin có đúng trong danh sách?
        │                                               │ 4. hỏi em: Cho phép / Không
        │◄──────────────────────────────────────────────┤ 5. opener.postMessage(tin, 'https://doc.truong.edu.vn')
        │  SDK kiểm event.origin + state                │ 6. cửa sổ tự đóng
        │
        │  POST {api.url}/rest/v1/rpc/record_external_activity      (Supabase REST, không qua Edge Function)
        └──────────────────────────────────────────────► Supabase
```

### Tin nhắn `postMessage`

```jsonc
// Thành công
{
  "type": "openedu:connect",
  "state": "<đúng chuỗi SDK đã gửi đi>",
  "user":  { "id": "uuid", "name": "Minh An", "grade": 2, "classId": "c-2a", "className": "2A", "avatarMascot": "shiba" },
  "token": { "accessToken": "<JWT>", "expiresAt": 1794000000 },   // expiresAt: giây epoch. null ở chế độ demo
  "api":   { "url": "https://xxxx.supabase.co", "anonKey": "<khóa công khai>" }   // null ở chế độ demo
}
// Từ chối / lỗi — không kèm dữ liệu người dùng
{ "type": "openedu:connect", "state": "…", "error": "denied" }
```

Mã lỗi: `denied` (em bấm Không), `unknown_app` (chưa đăng kí / đã tắt), `origin_not_allowed`, `not_student` (tài khoản giáo viên, phụ huynh), `error`.

### Gọi ghi kết quả (SDK làm sẵn — chỉ cần biết nếu bạn không dùng SDK)

```
POST {api.url}/rest/v1/rpc/record_external_activity
apikey: {api.anonKey}
Authorization: Bearer {token.accessToken}
Content-Profile: v2
Content-Type: application/json

{ "p": { "appId": "doc-hieu", "clientId": "…", "title": "…", "kind": "reading", "correct": 2, "total": 3, … } }
```

Trả về `id` (uuid) của dòng. `401` = token hết hạn → đăng nhập lại rồi gửi lại với **cùng `clientId`**.
SDK không dùng Edge Function nào; CORS của Supabase REST mở cho mọi origin nên không phải cấu hình gì thêm.

---

## 4. Mô hình bảo mật và giới hạn — đọc kĩ

**Những gì hệ thống bảo đảm**

- App của bạn không bao giờ thấy mật khẩu của học sinh, không nhận *refresh token*.
- Trang `/ket-noi` chỉ gửi tin cho **đúng origin đã đăng kí** (`postMessage` với `targetOrigin` cụ thể, không bao giờ `*`).
  Một trang khác khai gian `origin=` cũng không nhận được gì — trình duyệt không giao tin.
- SDK chỉ nhận tin từ đúng origin của app học sinh và đúng `state` nó vừa sinh.
- Chỉ **tài khoản học sinh** kết nối được; phiên của giáo viên / quản trị không bao giờ được trao cho app ngoài.
- Học sinh phải bấm **Cho phép** mỗi lần; trang `/ket-noi` không nhúng được vào iframe (`frame-ancestors 'none'`).
- Ghi kết quả chỉ qua hàm `v2.record_external_activity`: luôn ghi cho **chính người đang đăng nhập**, kẹp kích thước,
  chống ghi trùng theo `clientId`, tối đa 300 lượt mới mỗi học sinh mỗi ngày. Không ai `INSERT/UPDATE` thẳng vào bảng được.
- Chỉ quản trị viên sửa được sổ đăng kí (RLS). Tắt app → mọi lần ghi bị từ chối ngay.

**Giới hạn cần biết**

- `token.accessToken` là **phiên đăng nhập bình thường của học sinh**, sống khoảng 1 giờ. Trong thời gian đó app của bạn
  (và bất kì mã JavaScript nào chạy trên trang của bạn) làm được mọi việc học sinh đó làm được trong OPEN-EDU.
  Vì vậy: **chỉ đăng kí app nhà trường tin cậy và tự kiểm soát mã nguồn**; đừng nhúng script quảng cáo / bên thứ ba lạ vào trang đó.
- Đăng xuất khỏi OPEN-EDU hay tắt app trong sổ đăng kí **không thu hồi** token đã phát; nó tự hết hạn sau tối đa ~1 giờ.
- Origin phải khớp **chính xác**: `https://doc.truong.edu.vn` khác `https://www.doc.truong.edu.vn` và khác `http://…`.
- **Điểm từ app ngoài không kiểm chứng được** (học sinh rành máy có thể tự gửi số liệu). Vì thế chúng được hiển thị **riêng**
  trong hồ sơ, **không cộng sao/xu** và **không làm thay đổi mức thành thạo** hay gợi ý bài học. `skills` hiện chỉ được lưu lại.
- Tệp HTML mở thẳng từ ổ đĩa (`file://…`) **không kết nối được** (origin là `null`). Hãy đưa tệp lên một trang web
  (hosting tĩnh bất kì có https) rồi đăng kí origin của trang đó. Nhiều tệp HTML cùng một trang web dùng chung một lần đăng kí.
- Cần cho phép cửa sổ bật lên. Trong iframe bị sandbox hoặc WebView chặn `window.open` thì không dùng được.
- Vận hành: **không** thêm header `Cross-Origin-Opener-Policy` cho app học sinh (sẽ cắt liên lạc giữa hai cửa sổ).

---

## 5. Thử trên máy

**Chế độ demo (không cần Supabase)** — xem được toàn bộ luồng đăng nhập; `record()` trả `{ demo: true }` và không ghi gì.

```bash
pnpm --filter @openedu/learner dev            # app học sinh demo: http://localhost:5173
npx serve examples/connect -l 3000            # hoặc: python3 -m http.server 3000 -d examples/connect
# mở http://localhost:3000/doc-hieu-mau.html  → Đăng nhập bằng OPEN-EDU → chọn "Minh An" → Cho phép
```

Bản demo có sẵn app `doc-hieu-mau` với các origin `http://localhost:3000`, `:4713`, `:8080`.
(App giáo viên và app học sinh demo không dùng chung dữ liệu, nên app bạn thêm ở trang quản trị demo chỉ để xem giao diện.)

Kiểm thử tự động của luồng này: `node tools/connect-e2e.mjs --dist <bản dựng demo của app học sinh>` (xem đầu tệp).

**Với Supabase thật**

1. Chạy migration `supabase/migrations/20261117000002_v2_connect.sql` (chạy lại nhiều lần được).
2. Đăng nhập app giáo viên bằng tài khoản quản trị → *Ứng dụng kết nối* → thêm app với origin `http://localhost:3000`.
3. Sửa `LEARNER_URL` và `APP_ID` trong trang của bạn, mở trang, đăng nhập bằng một **tài khoản học sinh**, làm bài.
4. Mở *Hồ sơ học sinh* của em đó trong app giáo viên → mục **Hoạt động ở ứng dụng khác**.

Kiểm tra nhanh bằng SQL: `select * from v2.external_activities order by created_at desc limit 5;`

---

## 6. Hỏi – đáp

**App của tôi viết bằng React/Vue, dùng SDK thế nào?** Thêm thẻ `<script src=".../openedu-connect.js">` vào `index.html` rồi dùng `window.OpenEdu`.
Gọi `init` một lần lúc khởi động, `signIn()` trong hàm xử lí `onClick`.

**Có cần học sinh đăng nhập lại mỗi lần mở app không?** Phiên được nhớ trong tab (sessionStorage) tới khi hết hạn (~1 giờ) hoặc đóng tab.
Nếu em vẫn đang đăng nhập ở app OPEN-EDU thì lần sau chỉ cần bấm nút rồi bấm **Cho phép**.

**Em chưa đăng nhập mà đã làm bài thì sao?** `record()` sẽ *reject* với mã `not_signed_in`. Hãy giữ kết quả trong biến,
mời em đăng nhập, rồi gọi `record()` lại.

**Lưu tiến độ giữa chừng?** Tự đặt một `clientId` cố định cho lần làm bài đó, gọi `record({ clientId, completed: false, … })` nhiều lần,
cuối cùng gọi với `completed: true`. Cùng `clientId` → một dòng duy nhất.

**Giáo viên xem ở đâu? Phụ huynh có thấy không?** Giáo viên của lớp và quản trị: *Hồ sơ học sinh → Hoạt động ở ứng dụng khác*.
Quyền đọc ở CSDL gồm cả phụ huynh đã liên kết, nhưng trang phụ huynh hiện chưa hiển thị mục này.

**Báo lỗi “Địa chỉ này chưa được nhà trường cho phép”.** Origin của trang không có trong danh sách. Xem `location.origin` trong
Console của trang rồi chép đúng giá trị đó vào *Địa chỉ được phép*.

**Báo lỗi “Trình duyệt đã chặn cửa sổ”.** `signIn()` không được gọi trực tiếp từ sự kiện bấm, hoặc trình duyệt đang chặn pop-up của trang.

**Muốn gỡ một app?** Bấm **Tắt** (dữ liệu cũ vẫn giữ trong hồ sơ). **Xóa** chỉ được khi app chưa có dữ liệu học sinh.

**Tệp liên quan**

| | |
|---|---|
| SDK | `apps/learner/public/openedu-connect.js` |
| Trang xin phép | `apps/learner/src/pages/connect/KetNoi.tsx` (đường dẫn `/ket-noi`) |
| CSDL | `supabase/migrations/20261117000002_v2_connect.sql`, kiểm thử `supabase/tests/database/connect.test.sql` |
| Dữ liệu / hook | `packages/data/src/connect/` |
| Quản trị | `apps/teacher/src/pages/admin/ConnectApps.tsx` |
| Hồ sơ | `apps/teacher/src/components/ExternalActivities.tsx` |
