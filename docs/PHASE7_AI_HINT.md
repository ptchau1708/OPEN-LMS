# Phase 7 — AI gợi ý khi học sinh làm sai

Khi em trả lời chưa đúng, em bấm **"Gợi ý cho em"** để nhận gợi ý từng bước. Gợi ý **dẫn dắt, không nói đáp án**.

## Cách hoạt động

| Mức | Nội dung |
|---|---|
| 1 | Chỉ ra chỗ cần đọc lại / để ý (gợi ý soạn sẵn `item.hint` nếu có) |
| 2 | Bước đầu tiên, hoặc chỗ em hay nhầm (lời nhắc của quan niệm sai ứng với lựa chọn em chọn) |
| 3 | Cách làm trên một ví dụ tương tự nhỏ hơn, vẫn không nói kết quả |

- **Nơi có nút:** bài tự học (`SelfPacedPlayer` → `ActivityRunner`, prop `getHint`; app HS truyền `onHint` ở `LessonPage`) và bộ ôn tập (`Remediation`).
  **Không có** trong bài kiểm tra, lớp trực tiếp, Đấu 1–1, Tháp/Đấu trường (các trang đó không truyền hàm gợi ý).
- Nếu câu đã có `item.hint` (hiện ngay khi làm chưa đúng) thì lần bấm đầu xin luôn mức 2. Ở bộ ôn tập, mẹo hiện sẵn tính là mức 1;
  gợi ý trùng mẹo đang hiện thì tự xin mức kế.
- Ghi nhận: `learning_events.result.hintsUsed` = mức cao nhất đã xin cho lần trả lời gần nhất (demo ghi tại máy; Supabase ghi qua
  `v2.annotate_answer`). Không đổi schema.

### Mã nguồn
- `packages/data/src/hint/hint.ts` — mã THUẦN: `buildHintPrompt`, `leaksAnswer`, `acceptModelHint`, `composeFallbackHint`, `localHint`.
  `node tools/sync-scoring.mjs` chép sang `supabase/functions/_shared/hint/` (kiểm tra: `--check`).
- `supabase/functions/ai-gateway/hint.ts` + task `hint` trong `ai-gateway/index.ts`.
- `DataSource.getHint(input)` (`packages/contracts/src/data.ts`), hook `useHint()`; demo / Supabase / lớp bọc offline.

### Edge Function `ai-gateway`, task `hint`
Vào `{ task: 'hint', input: { itemId, response, attempt } }` → ra `{ text, provider: 'ai' | 'fallback', level }`. Mọi người đã đăng nhập gọi được.
1. HS: chỉ câu em đọc được (`get_items` bằng JWT của em); đang làm bài kiểm tra hoặc đang đấu có câu đó → 403.
2. Đọc item + đáp án bằng service role (không nhận đáp án từ máy HS). Câu trả lời thực ra đúng / dạng không chấm / thiếu đáp án → gợi ý chung.
3. Tra quan niệm sai (`key.misconceptions`, `Choice.misconception`; lời nhắc lấy từ `v2.misconceptions`, thiếu thì danh mục trong mã).
4. Có khóa AI và còn lượt → gọi mô hình với lời nhắc tiếng Việt (Socratic, 1–3 câu, theo mức). Kết quả qua bộ lọc; không đạt → gợi ý quy tắc.

## Cam kết "không lộ đáp án" và giới hạn
- Server **không bao giờ trả `key`**; chỉ trả `text`.
- Bộ lọc `leaksAnswer` loại câu của AI nếu chứa: chữ của đáp án (không phân biệt hoa thường, dấu câu); số đúng theo **giá trị**
  (`0,5` = `0.5` = `0,50`, `1.250` = `1 250` = `1250`); số 0–99 viết bằng chữ sau "là/bằng/được/ra"; nhãn lựa chọn đúng
  ("B", "đáp án b", "đáp án thứ hai"); cặp nối đúng trong cùng một câu; dãy thẻ đúng thứ tự. Ngoài ra **mọi** cách gọi lựa chọn
  bằng chữ cái/thứ tự đều bị loại (máy HS xáo thứ tự lựa chọn).
- Gợi ý quy tắc cũng qua bộ lọc: `item.hint` hay lời nhắc quan niệm sai lỡ chứa đáp án thì bỏ, dùng câu chung.
- **Giới hạn** (bộ lọc dựa trên chữ, không hiểu nghĩa): AI vẫn có thể "gần như nói" đáp án bằng diễn đạt khác (vd "kết quả lớn hơn 43
  một đơn vị"), phép tính trung gian dẫn thẳng tới đáp án, số lớn hơn 99 viết bằng chữ, đáp án là từ rất ngắn/phổ biến mà gợi ý tình cờ
  dùng (khi đó gợi ý bị loại oan → dùng gợi ý quy tắc). Lời nhắc đã dặn mô hình nhưng không thể bảo đảm 100%.
- Câu trả lời của HS được cắt ngắn, đặt trong ngoặc dữ liệu; lời nhắc dặn mô hình không làm theo nội dung trong đó.
- Không gửi tên hay thông tin cá nhân của HS cho nhà cung cấp AI.

## Hạn mức
- Nhóm `hint` trong `v2.ai_usage` (migration `20261117000001_v2_ai_hint.sql`, chạy lại được). `AI_DAILY_LIMIT_HINT`, mặc định **40 lượt/HS/ngày**.
- Hết lượt → gợi ý quy tắc (không báo lỗi). Chỉ trừ lượt khi thật sự gọi AI.

## Secrets
Dùng chung với `ai-gateway`: `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) hoặc `GEMINI_API_KEY` (+ `GEMINI_MODEL`); thêm tùy chọn
`AI_DAILY_LIMIT_HINT`. **Không có khóa AI vẫn chạy**: luôn trả gợi ý quy tắc (`provider: 'fallback'`).

## Không có mạng / lỗi
- Demo: gợi ý quy tắc tại máy, dùng đáp án demo đang giữ (có lời nhắc quan niệm sai).
- Supabase: Edge Function lỗi → gợi ý chung tại máy (chỉ từ `item.hint`, vì máy HS không có đáp án). Mất mạng → như vậy, không gọi server.

## Đã kiểm thử / chưa kiểm thử
- Đã: `packages/data/src/__tests__/hint.test.ts` (lời nhắc, bộ lọc, gợi ý quy tắc, `DemoDataSource.getHint`, `hintsUsed`);
  `supabase/tests/database/ai_hint.test.sql` (nhóm hạn mức `hint`); kiểm tra tay trên trình duyệt (bản demo) ở bài học và bộ ôn tập.
  `ai-gateway` được typecheck bằng `tsc` với khai báo giả cho Deno.
- **Chưa:** Edge Function chưa chạy thật (không có Deno/`supabase functions serve`, không có khóa AI) — chưa kiểm chứng chất lượng
  câu chữ của mô hình, tỉ lệ bị bộ lọc loại, kiểm tra quyền `get_items`/bài kiểm tra/trận đấu, và việc ghi `hintsUsed` qua `annotate_answer`.
  Cần thử trên dự án Supabase thử nghiệm trước khi bật cho HS.
