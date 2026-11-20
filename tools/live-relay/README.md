# OPEN-EDU live-relay

Máy chủ nhỏ cho **lớp học trực tiếp ở chế độ demo**: máy giáo viên, màn hình TV và máy tính bảng của học sinh
trong cùng mạng Wi-Fi kết nối tới đây qua WebSocket. Relay **không chấm điểm, không xử lý lệnh** — chỉ giữ trạng
thái mới nhất của từng phòng và chuyển tin. Logic nằm trong `packages/data` (`applyLiveCommand` trên máy GV,
học sinh tự chấm bằng đáp án gửi kèm ở chế độ demo).

> Chế độ demo không bảo mật đáp án. Khi dùng thật với Supabase, lớp học trực tiếp chạy qua Supabase Realtime, không cần relay.

## Chạy

```bash
# từ thư mục gốc open-edu
pnpm relay
# hoặc
node tools/live-relay/server.mjs
# đổi cổng
PORT=8788 node tools/live-relay/server.mjs
```

Khi chạy, relay in ra địa chỉ trong mạng LAN, ví dụ:

```
Máy học sinh trong cùng Wi-Fi mở: http://192.168.1.23:5173
```

Các app tự tìm relay tại `ws://<tên máy đang mở trang>:8787`. Nếu relay chạy ở máy khác, đặt
`VITE_RELAY_URL=ws://192.168.1.23:8787` cho các app.

**Mẹo trong lớp:** cho máy GV và các máy HS dùng chung một Wi-Fi; nếu máy HS không vào được, kiểm tra tường lửa
Windows đã cho phép Node.js nhận kết nối ở cổng 8787 (và 5173 cho app học sinh).

## HTTP

| Đường dẫn | Kết quả |
|---|---|
| `GET /health` | `{ ok, rooms, clients, uptimeSec }` |
| `GET /pin/:pin` | `{ sessionId, pin, lessonId, lessonTitle }` hoặc 404 (không có phòng / phòng đã kết thúc) |

Có CORS `*`.

## WebSocket (JSON, trường `t`)

Khách → relay:

| Tin | Ai gửi | Ý nghĩa |
|---|---|---|
| `{ t: 'create', state }` | GV | Tạo phòng (hoặc ghi đè nếu đã có — giữ HS đã vào và câu trả lời). Relay trả `state`, `responses`, `presence`. |
| `{ t: 'join-room', sessionId, role, participant? }` | mọi người | Vào phòng (`role`: `teacher` · `screen` · `student`). HS có `participant` được thêm/cập nhật trong `state.participants`. |
| `{ t: 'state', state }` | chỉ GV | Thay trạng thái phòng; relay phát cho các máy khác. |
| `{ t: 'respond', response }` | HS | Câu trả lời (đã tự chấm `correct`/`score` nếu có đáp án); relay chuyển cho GV và TV. |

Relay → khách:

| Tin | Khi nào |
|---|---|
| `{ t: 'state', state }` | Khi vào phòng (đầy đủ) và mỗi lần đổi trạng thái |
| `{ t: 'response', response }` | Có câu trả lời mới (chỉ gửi GV, TV) |
| `{ t: 'presence', participants }` | HS vào / rời (danh sách HS đang kết nối) |
| `{ t: 'responses', list }` | Khi vào phòng (GV/TV: tất cả; HS: của chính mình) |
| `{ t: 'error', message, code? }` | `code: 'no-room'` khi phòng không còn (vd relay vừa khởi động lại) |

Quy ước tiết kiệm băng thông: tin `state` khi đổi trạng thái **không kèm** `lesson` và `items`
(bên nhận giữ bản đã có từ lúc vào phòng). Relay cũng giữ lại `lesson`/`items` nếu bản GV gửi lên thiếu.

Khi GV gửi `state` mà thiếu HS vừa vào cùng lúc, relay ghép thêm HS đó (không làm mất người vào lớp).

## Bền bỉ

- Phòng giữ trong bộ nhớ; phòng không hoạt động quá **6 giờ** bị xóa.
- Relay ping mỗi 30 giây và ngắt kết nối "chết" (máy tính bảng tắt màn hình).
- Relay khởi động lại → mất phòng: máy GV nhận `no-room` và tự `create` lại từ trạng thái trên máy; HS tự vào lại.
- Dùng trong mã: `import { startRelay } from './server.mjs'` → `startRelay({ port: 0, quiet: true })` trả về `{ port, close() }` (dùng trong kiểm thử).
