# Chuẩn kết nối của OPEN-EDU: LTI 1.3 + Deep Linking + xAPI

| Loại app | Mở app / đăng nhập | Giáo viên chọn bài để giao | Dữ liệu học chi tiết |
|---|---|---|---|
| App có máy chủ (Python, PHP, Node…) — vd app luyện đọc | **LTI 1.3** | **Deep Linking** | **xAPI** (access token LTI) |
| Trang HTML tĩnh | `openedu-connect.js` (docs/KET_NOI_APP_NGOAI.md) | link kèm mã bài | **xAPI** (`OpenEdu.answer` / `OpenEdu.xapi`) |
| Trang của người khác (YouTube, Canva…) | — | Trang học (nhúng) — docs/TRANG_HOC.md | — |

Hai mức đầu ghi dữ liệu **cùng một định dạng (xAPI)**: câu trả lời có mã kĩ năng OPEN-EDU
(`object.definition.extensions["https://open-edu.vn/xapi/skills"]`) được tính vào **mức thành thạo**, câu
“completed / passed / scored” có điểm vào hồ sơ “hoạt động ở ứng dụng khác”.

# Nối app ngoài theo chuẩn LTI 1.3 (OPEN-EDU làm “nền tảng”)

Dành cho app đã viết sẵn theo chuẩn **LTI 1.3** — ví dụ app luyện đọc hiểu dùng **FastAPI + pylti1p3**. Học sinh mở app
từ OPEN-EDU, app biết em là ai, lớp nào, và gửi điểm về **hồ sơ học tập** của em (giáo viên xem ở “Hồ sơ học sinh”).

App không dùng LTI (trang HTML đơn giản) thì dùng cách nhẹ hơn: `openedu-connect.js` — xem `docs/KET_NOI_APP_NGOAI.md`.

## Mở trong OPEN-EDU (khung nhúng) và Safari / iPad
Học sinh mở app ngay trong OPEN-EDU (`/ung-dung/<app>` hoặc Trang học `/trang/<mã>`). Safari chặn cookie của trang trong
khung, nên OPEN-EDU gửi `lti_storage_target=_parent` và trả lời **lưu trạng thái qua nền tảng** (1EdTech LTI Client Side
postMessages: `lti.capabilities`, `lti.put_data`, `lti.get_data`), tách riêng theo origin của app. App mẫu đã làm phần
này và **không dùng cookie phiên** (trạng thái giữ ở máy chủ, sau khi mở dùng APP_TOKEN). Đã chạy thử trong Chromium
thật (khung nhúng, không cookie LTI). Nút “Mở thẻ mới ↗” luôn có sẵn.

App phải cho phép hiện trong khung của OPEN-EDU: header `Content-Security-Policy: frame-ancestors https://<app học sinh>`
(không đặt `X-Frame-Options: DENY`).

## Deep Linking — giáo viên chọn bài trong app
1. Khai báo **Deep link URL** của app (vd `/lti/chon-bai`) ở Quản trị → Ứng dụng kết nối.
2. GV vào **Trang học** → “Chọn bài trong app” → app mở ở thẻ mới (đăng nhập bằng phiên giáo viên — app học sinh tự
   chuyển sang `/lti/auth` của app giáo viên) → chọn bài → app gửi `LtiDeepLinkingResponse` (JWT kí bằng khóa app) về
   `<issuer>/deep-link` → OPEN-EDU tạo Trang học cho lớp và đưa GV về lại trang Trang học.
3. Học sinh mở bài: `lti_message_hint=page:<mã>`, id_token có `resource_link` = bài, `custom` của bài (vd `bai=3`), cột
   điểm riêng của bài (theo `lineItem` app gửi).
App học sinh cần biến `VITE_TEACHER_URL` (địa chỉ app giáo viên) để chuyển yêu cầu chọn bài.

## xAPI — dữ liệu học chi tiết
- App có máy chủ: lấy access token với scope `https://open-edu.vn/lti/scope/xapi` (pylti1p3:
  `launch.get_service_connector().get_access_token([scope])`), POST `<issuer>/xapi/statements` (1–50 câu),
  `actor.account.name` = `sub` của học sinh. Địa chỉ và scope có sẵn trong id_token, claim
  `https://open-edu.vn/lti/claim/xapi`. Mẫu: `send_xapi()` trong `examples/lti-fastapi/app.py`.
- Trang HTML: `OpenEdu.answer({...})` / `OpenEdu.xapi([...])` — gửi bằng phiên đăng nhập của em, kèm `X-OpenEdu-App`;
  origin trang phải nằm trong “Địa chỉ được phép” của app.
- Người học luôn là người đã xác thực; giới hạn 3000 câu / em / ngày; mỗi câu ≤ 16 KB.
- ⚠ Danh mục kĩ năng hiện mới có Toán 4–5: câu đọc hiểu gắn mã kĩ năng chưa có trong danh mục vẫn được lưu
  (`v2.xapi_statements`) nhưng chưa tính mức thành thạo, cho tới khi thêm danh mục kĩ năng Tiếng Việt.

## Đã kiểm thử đến đâu
- Chạy **đầu-cuối với pylti1p3 thật** (app FastAPI mẫu `examples/lti-fastapi`, `lti.e2e.test.ts`): mở app ở thẻ mới
  (AGS + xAPI), mở trong khung không cookie (lưu trạng thái qua nền tảng), Deep Linking (GV chọn bài → Trang học → HS
  mở đúng bài), và một lượt trong **Chromium thật** (postMessage giữa app và trang chứa khung).
- Kiểm thử từ chối (`lti.test.ts`): phiên người khác, redirect_uri lạ, app tắt, HS lớp khác, dùng lại jti, sai khóa,
  sai aud, hết hạn, thiếu scope, token của app khác, phản hồi chọn bài giả, xAPI sai origin / sai app / HS lạ…
- CSDL: `supabase/tests/database/lti.test.sql` (pgTAP). Edge Function `lti` qua `deno check`.
- ⚠ **Chưa chạy trên project Supabase thật** và chưa thử với app đọc hiểu thật của trường.

## 1. Cài phía OPEN-EDU (một lần)
1. Supabase → SQL Editor: chạy tệp `9_ket-noi-lti.sql` rồi `10_trang-hoc-xapi.sql` (cần đã chạy tệp 8 trước).
2. Triển khai Edge Function (cửa sổ dòng lệnh trong thư mục dự án):
   ```
   npx supabase@latest functions deploy lti --project-ref <ref> --no-verify-jwt --use-api
   ```
   `--no-verify-jwt` là bắt buộc: app ngoài gọi `/jwks`, `/token`, `/ags` không có phiên Supabase (hàm tự kiểm tra).
   Khóa kí của OPEN-EDU được **tự tạo** ở lần gọi đầu, lưu trong bảng `v2.lti_platform_keys` (chỉ service role đọc được).
3. Quản trị → **Ứng dụng kết nối** → *Thêm ứng dụng* (hoặc *Sửa* app có sẵn) → tích **Kết nối chuẩn LTI 1.3**, điền:
   - **Login URL**: `https://<app>/lti/login`
   - **Launch URL**: `https://<app>/lti/launch`
   - **JWKS URL**: `https://<app>/lti/jwks` (hoặc dán `public.key` của app)
   - Client ID tự tạo; Deployment ID để `1`.
4. Bấm **Cấu hình LTI** ở dòng của app → **Chép lti_config.json** → đưa cho người làm app.

## 2. Cài phía app (FastAPI + pylti1p3)
Chép `examples/lti-fastapi/openedu_lti.py` vào dự án (pylti1p3 không có sẵn bộ nối FastAPI — tệp này là bộ nối).
`examples/lti-fastapi/app.py` là khung đầy đủ: `/lti/login`, `/lti/launch`, `/lti/jwks`, `/api/ket-qua` (gửi điểm).

```
pip install fastapi uvicorn pylti1p3 python-multipart itsdangerous
python make_keys.py                      # private.key / public.key của app
# dán lti_config.json chép từ OPEN-EDU
APP_SECRET=<chuỗi dài ngẫu nhiên> APP_URL=https://doc.truong.edu.vn uvicorn app:app --port 8001
```

Ba điểm dễ sai khi tự viết (đã xử lí trong mẫu):
1. **Gọi pylti1p3 trong luồng phụ** (`run_in_threadpool`). pylti1p3 gọi mạng kiểu đồng bộ; khi gửi điểm, OPEN-EDU gọi ngược
   `/lti/jwks` của chính app — nếu app chặn vòng lặp sự kiện thì hai bên **chờ nhau mãi**.
2. **Phiên (session) phải `SameSite=None; Secure`** trên mạng thật: OPEN-EDU gửi biểu mẫu từ tên miền khác sang
   `/lti/launch`, cookie `SameSite=Lax` sẽ không được gửi kèm → báo “State not found”.
3. Khóa người dùng trong CSDL của app nên là `sub` (mã OPEN-EDU), không phải tên.

Dữ liệu app nhận trong id_token: `sub` (mã HS), `name`, `given_name`, `family_name`, `email` (HS: `<tên đăng nhập>@openlms.edu`),
vai trò (`Learner` / `Instructor`), lớp (`context.id`, `context.label`), `custom.username`, `custom.grade`, `custom.class_name`.

Gửi điểm: `Grade().set_score_given(8).set_score_maximum(10).set_user_id(sub)…` rồi `launch.get_ags().put_grade(grade)`.
Điểm hiện trong hồ sơ học tập (loại `lti`), gửi lại cùng cột điểm thì **cập nhật**, không nhân đôi. Không đổi sao/xu,
không đổi mức thành thạo kĩ năng.

## 3. Học sinh dùng thế nào
Trang **Hôm nay** có nút **Ứng dụng học** (khi trường đã nối ít nhất một app) → bấm **Mở** → app mở ở thẻ mới, đã đăng
nhập sẵn bằng tài khoản OPEN-EDU. Chưa đăng nhập OPEN-EDU thì trang hỏi đăng nhập trước rồi mở tiếp.

## 4. Địa chỉ (Edge Function `lti`)
`<SUPABASE_URL>/functions/v1/lti` là **issuer**. Các đường dẫn: `/jwks`, `/authorize` (trang `/lti/auth` của app học sinh
gọi), `/token`, `/ags/{lớp}/lineitems[/{id}[/scores|/results]]`. Mã giao thức: `packages/data/src/lti/` (thuần, có kiểm
thử; `tools/sync-scoring.mjs` chép sang `supabase/functions/_shared/lti/`).

An toàn:
- `/authorize` chỉ kí khi: người gọi đã đăng nhập, `login_hint` đúng là người đó, app đang bật, `redirect_uri` khớp
  chính xác địa chỉ đã đăng kí, người đó thuộc lớp. id_token sống 5 phút.
- `/token`: client_assertion phải kí bằng khóa của app (JWKS URL / PEM đã đăng kí), `aud` = địa chỉ `/token`, chưa hết
  hạn, `jti` chưa dùng. Access token sống 1 giờ, chỉ chạm được cột điểm **của chính app đó**.
- Gửi điểm chỉ cho **học sinh của lớp** trong đường dẫn.
- CSP app học sinh: `form-action 'self' https:` (để trang `/lti/auth` gửi biểu mẫu tới app).

Chưa làm: Names and Role Provisioning (app lấy danh sách lớp), xAPI đọc ngược (GET statements), hàng đợi ngoại tuyến
cho `OpenEdu.xapi`.
