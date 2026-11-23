# Đố vui trực tiếp trên lớp (kiểu Kahoot / Quizizz / thẻ giấy)

## Mở trò chơi
- **Ngân hàng câu hỏi** → tích các câu → **Chơi trực tiếp**; hoặc **Trực tiếp** → chọn bài giảng → **Chơi thi đua với các câu hỏi của bài**.
- Chọn **kiểu chơi**, **lớp**, **giây mỗi câu** → **Mở phòng chơi**. Từ ngân hàng: các câu được gộp thành bài nháp "Đố vui …".
- Bấm **Mở trên TV** (màn hình lớp), HS vào bằng **mã 6 số** hoặc quét QR (Góc học tập → Vào lớp).

## Ba kiểu chơi
| Kiểu | Cách chơi |
|---|---|
| **Thi đua cả lớp** (Kahoot) | TV hiện câu hỏi + 4 ô màu, HS chọn trên máy. GV: *Câu đầu tiên* → (tự chốt khi hết giờ hoặc cả lớp đã trả lời) → *Bảng xếp hạng* → *Câu tiếp* … → *Kết thúc & trao giải*. |
| **Tự làm theo nhịp** (Quizizz) | GV bấm *Bắt đầu cho cả lớp* (tuỳ chọn giới hạn 5/10/15 phút). Mỗi em tự làm lần lượt, biết đúng/sai ngay; TV và máy GV hiện xếp hạng + tiến độ trực tiếp. |
| **Thẻ giấy** (Quizizz Paper / Plickers) | HS không cần máy. In thẻ (**In thẻ** → trang `/truc-tiep/the-giay`, 2 thẻ/trang A4). HS xoay chữ chọn (A/B/C/D) lên trên và giơ thẻ; GV bấm **Quét thẻ bằng camera** trên điện thoại và lia một lượt cả lớp, hoặc chạm chữ cạnh tên em. Chỉ dùng câu chọn 1 đáp án, 2–4 lựa chọn. |

## Tính điểm
- Đúng: 500–1000 điểm theo tốc độ (trả lời ngay = 1000, hết giờ = 500) + **chuỗi đúng** 100 × số câu đúng liên tiếp trước đó (tối đa +500). Sai/không trả lời: 0, mất chuỗi.
- Chỉ tính **câu trả lời đầu tiên** của mỗi em. Thẻ giấy: không tính tốc độ (đúng = 1000 + chuỗi).
- Có chia đội (tổ): bảng tổng điểm theo tổ.
- Kết thúc: bục 3 bạn dẫn đầu trên TV, **Thưởng sao top 3** (3★ 2★ 1★ vào ví thật), **Xuất Excel** (Xếp hạng + Từng câu Đ/S).

## Kỹ thuật
- Trạng thái trò chơi nằm trong `LiveState.game` (contracts/live.ts); lệnh `game-setup`, `game-tally`, `game-board`, `game-start`, `paper-answer`.
  Máy GV tính điểm (mã thuần `packages/data/src/live/game.ts`), đo thời gian bằng đồng hồ máy GV. Không cần SQL mới.
- Quét thẻ: `zxing-wasm` (tải lười ~1 MB khi bật camera) → hướng mã QR → chữ ở trên. CSP app GV thêm `'wasm-unsafe-eval'`.
- Kiểm thử: `packages/data/src/__tests__/liveGame.test.ts`, `e2e/do-vui.spec.ts` (relay demo chạy kèm Playwright).
