# OPEN-EDU — quy ước cho người viết mã

## Cấu trúc
```
apps/learner   Góc học tập (học sinh + chế độ phụ huynh) — giao diện kid
apps/teacher   Bàn làm việc giáo viên + admin — giao diện pro
apps/present   Màn hình lớp (TV / bảng tương tác) — giao diện kid, chữ rất to
packages/contracts       Kiểu dữ liệu và hợp đồng giữa các gói (nguồn sự thật)
packages/ui              Token, component trẻ em, linh vật SVG, đọc to, âm thanh
packages/activity-engine 16 dạng hoạt động: Player, Editor, score, sample
packages/lesson-player   Trình phát bài giảng: tự học, HS trong lớp trực tiếp, TV, gói HTML5
packages/data            DataSource (demo + Supabase), hook React Query, kênh trực tiếp
supabase/                migrations, functions, tests
content-host/            launcher.html + openedu-bridge.js cho gói HTML5 (triển khai lên origin riêng)
tools/live-relay         Máy chủ WebSocket nhỏ cho lớp học trực tiếp ở chế độ demo / mạng LAN
```

## Quy tắc chung
- TypeScript strict. Không `any` trừ chỗ bắt buộc (ghi chú lý do).
- Gói dùng dưới dạng mã nguồn (workspace, `main: src/index.ts`); Vite biên dịch.
- Không thêm thư viện mới khi chưa thống nhất. Đã có sẵn: react 18, react-router 7, @tanstack/react-query 5,
  zustand 4, @supabase/supabase-js 2, qrcode-generator, fflate, ws, vitest.
- Không dùng Tailwind. CSS thuần theo token trong `packages/ui/src/tokens.css`. Tiền tố class:
  `k-` (ui), `ae-` (activity-engine), `lp-` (lesson-player), app tự đặt (`ln-`, `tc-`, `pr-`).
- Mọi màu lấy từ biến CSS. Không viết mã màu trực tiếp trong component (trừ SVG linh vật / minh họa).
- Chữ hiển thị bằng tiếng Việt có dấu, viết cho học sinh tiểu học: ngắn, thân thiện, xưng "em" / "mình".
- Không dùng `alert/confirm/prompt`. Lỗi hiện bằng thông báo trên giao diện, có cách khắc phục.

## Giao diện trẻ em (bắt buộc)
- Vùng chạm tối thiểu 56 px, khoảng cách 12 px; kéo thả có vùng hút rộng; hỗ trợ cả chuột và cảm ứng (Pointer Events).
- Mọi đề bài có nút loa (`SpeakButton`); lớp 1–2 bật chữ to (`.k-big`).
- Đúng: âm thanh `sfx.correct()`, sao bay. Chưa đúng: `sfx.tryAgain()`, màu cam dịu `--k-try`, gợi ý; KHÔNG dùng đỏ gắt, không chữ "SAI".
- Nút chính nổi khối: viền dưới 5 px `--k-press`, nhấn thì lún xuống.
- Hoạt ảnh chỉ dùng transform/opacity; tôn trọng `prefers-reduced-motion` và class `.k-reduced`.
- Bố cục co giãn: điện thoại dọc ≥ 320 px, máy tính bảng ngang, PC, TV 1920×1080. Không cuộn ngang trang.
- Hỗ trợ Chrome 109 (Windows 7 phòng tin) và Safari 14: tránh `:has()`, container queries, `structuredClone`, top-level await.

## Hiệu năng
- App học sinh: JS tải đầu ≤ 170 KB gzip; màn hình nặng tải lười (`React.lazy`).
- Không tải thư viện lớn vào app học sinh. Minh họa SVG.
