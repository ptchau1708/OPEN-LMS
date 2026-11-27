# Phase 6 — Học khi mất mạng (app học sinh)

Mục tiêu: điện thoại phụ huynh 4G yếu, máy tính bảng ở trường — em vẫn mở bài đã tải, làm bài, nộp bài viết;
khi có mạng, mọi thứ tự gửi lên đúng thứ tự, không trùng, sao về sau kèm màn chúc mừng.

## Kiến trúc

```
App (React Query, networkMode 'always')
  └─ OfflineAwareDataSource  (packages/data/src/offline/OfflineAwareDataSource.ts — decorator, Proxy)
        đọc  → mạng trước; lỗi mạng / offline / chậm > 8 s → IndexedDB 'cache'
        ghi  → mạng nếu online và hàng đợi trống; ngược lại → Outbox (IndexedDB 'outbox')
        └─ DataSource thật (SupabaseDataSource) | demo mô phỏng: createSimulatedRemote(DemoDataSource)
```

| Tệp | Vai trò |
|---|---|
| `packages/data/src/offline/types.ts` | `OfflineStore` (giao diện kho), kiểu thao tác hàng đợi, `SyncReport`, `DownloadEntry` |
| `offline/idbStore.ts` | IndexedDB thô (DB `openedu-offline`: `cache`, `outbox`, `downloads`, `blobs`); rơi về bộ nhớ nếu bị chặn |
| `offline/memoryStore.ts` | Kho bộ nhớ (kiểm thử) |
| `offline/policy.ts` | Lùi dần, phân loại lỗi (network / transient / permanent), kiểm tra `answeredAt`, `newClientId()` |
| `offline/outbox.ts` | Hàng đợi: thứ tự `seq`, idempotency theo id, gộp tiến độ, chống trùng `started/viewed`, flush một luồng |
| `offline/OfflineAwareDataSource.ts` | Lớp bọc + `OfflineController` (số chờ, `syncNow`, tự đồng bộ) |
| `offline/registry.ts` | `getOfflineController()` — nhỏ, nằm trong gói đầu |
| `offline/downloads.ts` | `DownloadManager` (tải bài / xóa), `storageInfo`, `requestPersist`, `onWifi` |
| `offline/simulatedRemote.ts` | CHỈ DEMO: "server ở xa" giả quanh DemoDataSource |
| `apps/learner/public/oe-sw-offline.js` | Workbox `importScripts`: phục vụ ảnh/âm thanh đã tải từ Cache `oe-media-v1`; Background Sync `oe-outbox` |
| `apps/learner/src/offline/*` | Thanh mạng + "Đồng bộ ngay" + chúc mừng (`OfflineHost`), nút Tải về, trạng thái |
| `apps/learner/src/pages/Downloads.tsx` | Tôi › Bài đã tải về (`/toi/tai-ve`) |

Cài đặt: `initDataSource({ offline: true })` (chỉ app học sinh). Supabase → luôn bọc. Demo → chỉ bọc khi
`VITE_OFFLINE_SIM=1` (demo vốn chạy trên máy; cờ này để thấy được đường hàng đợi → đồng bộ).

## Tải bài về
- Nút **Tải về** trong thẻ trạm (Bản đồ), **Tải bài được giao** trên Hôm nay; trang **Bài đã tải về**: danh sách,
  dung lượng ước tính, xóa, bộ nhớ máy (`navigator.storage.estimate`), **Giữ bài lâu trên máy** (`persist()`),
  **Tự tải bài được giao khi có Wi-Fi** (`navigator.connection.type`; trình duyệt không báo → không tự tải).
- Lưu: bài (JSON, item nhúng bỏ `key`), item **không có đáp án** (`stripKey`), ảnh/âm thanh (CORS, không được thì
  phản hồi "mờ") vào Cache `oe-media-v1`.
- **Gói HTML5** chạy trong iframe ở origin nội dung riêng → service worker của app không điều khiển được →
  đánh dấu **"Cần mạng"**. Video YouTube cũng vậy.
- Ngoài ra mọi lần đọc khi online đều được lưu (bài đã mở, Hôm nay, ví, hộ chiếu, hồ sơ `me`, tiến độ…).

## Học khi mất mạng
- Vỏ app đã precache; `navigateFallback` → mọi route SPA mở được offline; các chunk lười đều precache.
- Câu có chấm mà máy không có đáp án → **"Đã lưu — sẽ chấm khi có mạng"** (linh vật, tông xanh, không sao ngay).
  Câu không chấm (vẽ, ghi âm, bình chọn) vẫn "Đã gửi rồi!". Có đáp án (demo/GV) → chấm tại máy như cũ.
- Hoàn thành bài offline: "Đã lưu bài trên máy. Có mạng, thầy/cô chấm và sao sẽ về túi em nhé!".
- Bài viết có ảnh: nén JPEG như cũ, cất Blob vào `blobs`, tải lên khi đồng bộ.
- Thanh trên cùng: **"Đang học không cần mạng"** + huy hiệu **"N chờ gửi"**; có mạng lại: **"Đồng bộ ngay"**.
  Trình phát bài giảng (fixed) né thanh qua biến CSS `--ln-banner-h`.

## Đồng bộ
- Khi: sự kiện `online`, quay lại app (`visibilitychange`), mỗi 30 s nếu còn việc, Background Sync (SW nhắn tab
  `oe-sync`; hàng đợi ở IndexedDB của trang nên cần ít nhất một tab mở), nút "Đồng bộ ngay" (bỏ qua chờ lùi dần).
- Thứ tự nghiêm ngặt theo `seq`: câu trả lời → tiến độ → hoàn thành (server tính sao hoàn thành từ answers).
  Khi hàng đợi còn việc, lệnh ghi mới cũng xếp hàng (không vượt lên).
- Lỗi mạng → dừng, lùi dần (2 s·2ⁿ, trần 5 phút, nhiễu ×[0.5,1)). 5xx/429/không rõ → lùi dần, tối đa 8 lần rồi
  "failed". 4xx / câu quá 14 ngày → "failed" ngay, không chặn việc sau. Trang Tải về: "Thử gửi lại", "Bỏ việc lỗi".
- Sau khi gửi được: làm mới mọi truy vấn, màn chúc mừng (đúng x/y câu, +N sao, confetti), mở khóa linh vật.

## Server (Supabase)
Migration `supabase/migrations/20261115000020_v2_offline.sql`:
- `learning_events.client_event_id` + unique index `(user_id, client_event_id)` (theo HS để HS khác không "chiếm" id);
  `submissions.client_event_id` + unique `(student_id, client_event_id)`.
- `v2._plausible_at(ts, strict)`: null/tương lai > 5 phút → `now()`; cũ hơn 14 ngày → lỗi `stale_answer` (strict) hoặc `now()`.
- `record_grade(..., p_client_event_id, p_answered_at)`: id đã có → trả kết quả cũ (`duplicate: true`), không cộng sao;
  `insert … on conflict do nothing` chống hai lần gửi song song; `at` = thời điểm trả lời thật; `result.offline = true`.
- `complete_lesson(p_lesson_id, p_completed_at)`; thưởng vốn đã một lần/bài (`dedupe_key`).
- `record_event`: đọc cả camelCase lẫn snake_case (sửa lỗi cũ: `toEventRow` gửi snake_case), `clientEventId`, `clientAt`.
- `annotate_answer`: tìm sự kiện vừa ghi theo id (không theo `at`, vì `at` có thể lùi về quá khứ).

Edge Function `grade`: nhận `clientEventId`, `answeredAt`; kiểm tra bằng `_shared/offline.ts` (chép từ `policy.ts`):
quá 14 ngày → 422 `stale_answer`; trả `duplicate: true` khi đã nhận. `SupabaseDataSource.submitWork` tra
`client_event_id` trước khi tải ảnh. `fail()` giữ `status`/`code`/`cause` để phân loại lỗi.

Xung đột `lesson_progress`: gộp bằng `mergeProgress` (slide hợp lại, câu trả lời giữ kết quả tốt nhất, giữ `completedAt`)
ở cả hàng đợi (gộp các lần lưu chưa gửi), lớp bọc (server + việc đang chờ) và server (`saveProgress` đọc–ghép–ghi).

## Kiểm thử
- `packages/data/src/__tests__/offline.test.ts` (kho bộ nhớ): lùi dần, kiểm tra thời điểm (client = bản server),
  phân loại lỗi, thứ tự + dừng khi mất mạng, idempotency/chống trùng, gộp tiến độ, failed không chặn, flush một luồng;
  lớp bọc với DemoDataSource sau mạng giả: đọc từ bản lưu (item không có đáp án), ghi vào hàng → đồng bộ (sao, thứ tự,
  gửi lại cùng id không cộng sao), câu quá 14 ngày, bài viết có ảnh, Tải bài/xóa/gói "cần mạng".
- E2E (Playwright, bản build `VITE_DATA_MODE=demo VITE_OFFLINE_SIM=1`): tải bài → `setOffline(true)` → tải lại →
  mở bài, trả lời ("Đã lưu — sẽ chấm khi có mạng"), hoàn thành → huy hiệu "N chờ gửi" → online → chúc mừng, sao tăng.

## Chưa làm / giới hạn
- Gói HTML5 offline (cần service worker riêng trên origin nội dung). Video MP4 không tải về.
- Background Sync chỉ đánh thức tab đang mở (Chrome/Android); Safari: đồng bộ khi mở lại app.
- Bộ ôn tập, Đấu trường, lớp trực tiếp, thi ma trận: cần mạng (không xếp hàng).
- App GV chưa hiện dấu "nộp khi offline" (dữ liệu đã có: `learning_events.result.offline = true`, `client_event_id`).
- Edge Function `grade` chưa chạy trên Deno thật (migration đã kiểm bằng pgTAP: `supabase/tests/database/offline.test.sql`).

## Bổ sung 16/11

- **Ôn bù kiến thức khi mất mạng**: khi có mạng, câu hỏi của 3 bộ ôn đầu được nạp sẵn (không kèm đáp án). Mất mạng, em vẫn làm được; kết quả bộ ôn vào hàng đợi (`remediation`) và chỉ gửi sau khi từng câu đã được máy chủ chấm — lớp offline dùng kết quả **thật** của câu, câu bị từ chối tính là chưa đúng. Màn hình kết quả ghi "Đã lưu — sẽ chấm khi có mạng", không báo đạt / chưa đạt trước.
- **Giáo viên thấy bài làm khi mất mạng**: dòng thời gian trong hồ sơ học sinh có nhãn "làm khi mất mạng"; trang Tổng quan đếm số hoạt động offline trong 7 ngày.
- Đấu trường, bài kiểm tra, lớp trực tiếp và bài giảng HTML5 vẫn cần mạng (theo thiết kế: cần máy chủ làm trọng tài / đồng hồ).
