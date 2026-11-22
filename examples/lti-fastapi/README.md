# App mẫu LTI 1.3 + Deep Linking + xAPI (FastAPI + pylti1p3) cho OPEN-EDU

Khung cho app luyện đọc hiểu: học sinh mở từ OPEN-EDU (thẻ mới hoặc ngay trong OPEN-EDU, kể cả Safari / iPad) → app biết
tên, lớp → làm bài → gửi từng câu (xAPI, kèm mã kĩ năng) và điểm bài (AGS). Giáo viên chọn bài trong app để giao cho lớp
(Deep Linking).
Hướng dẫn đầy đủ: `docs/KET_NOI_LTI.md`.

- `openedu_lti.py` — bộ nối pylti1p3 ↔ FastAPI (chép vào dự án của bạn).
- `app.py` — `/lti/login`, `/lti/launch`, `/lti/chon-bai` (+ `/xong`), `/lti/jwks`, `/api/tra-loi` (xAPI từng câu),
  `/api/ket-qua` (điểm bài + xAPI hoàn thành). Không dùng cookie phiên: sau khi mở, trang có `window.APP_TOKEN` để gọi API
  bằng `Authorization: Bearer`.
- Trạng thái giữ trong bộ nhớ tiến trình (`CACHE`) — chạy nhiều tiến trình thì thay bằng Redis.
- Thêm vào header của app: `Content-Security-Policy: frame-ancestors https://<app học sinh OPEN-EDU>` để hiện được trong khung.
- `make_keys.py` — tạo `private.key` / `public.key` của app.
- `lti_config.example.json` — mẫu; bản thật chép từ OPEN-EDU (Quản trị → Ứng dụng kết nối → Cấu hình LTI).

```
pip install -r requirements.txt
python make_keys.py
APP_SECRET=<chuỗi dài ngẫu nhiên> APP_URL=https://doc.truong.edu.vn uvicorn app:app --port 8001
```

Đã chạy đầu-cuối với nền tảng OPEN-EDU trong kiểm thử `packages/data/src/__tests__/lti.e2e.test.ts`
(`LTI_E2E_PYTHON=<python có các gói trên> pnpm --filter @openedu/data test lti.e2e`).
