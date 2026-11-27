# Phase 7 — Tạo ngân hàng câu hỏi nhanh

Trang **Ngân hàng hoạt động** (app GV) có thêm nút **Thêm nhanh nhiều câu**, **Xuất ra Excel**, và trong ngăn xem câu hỏi có nút **Nhân bản câu này**.

## Dành cho thầy/cô

### Các cách thêm câu hỏi

| Cách | Cần khóa AI? | Dùng khi |
|---|---|---|
| **Từ tệp Excel** (theo mẫu) | Không | Có sẵn bảng câu hỏi, hoặc muốn sửa hàng loạt câu cũ (xuất → sửa → nhập lại) |
| **Từ tệp Word** (.docx) | Không | Có đề kiểm tra dạng chữ |
| **Dán văn bản** | Không | Chép từ Word, PDF chọn được chữ, Zalo, trang web |
| **Ảnh chụp / PDF quét** | **Có** | Chỉ có giấy hoặc bản scan |
| **AI soạn câu hỏi** | **Có** | Cần câu mới theo nội dung SGK, chủ đề hoặc kĩ năng |
| **Gõ nhanh trắc nghiệm** | Không | Gõ tay nhiều câu 4 lựa chọn: câu hỏi, A–D, chọn đáp án, Enter sang dòng mới |
| **Tạo hoạt động / Nhân bản** | Không | Một câu, đủ 16 dạng, có ảnh, âm thanh |

Mọi cách (trừ tạo từng câu) đều dẫn tới **màn hình soát**. Ở đây thầy/cô xem trạng thái từng câu (**Sẵn sàng / Thiếu đáp án / Cần xem lại**), sửa đề, lựa chọn và đáp án ngay trong danh sách, rồi đặt môn, lớp, mức độ và mã kĩ năng cho từng câu hoặc cho mọi câu đang chọn. Bên phải là bản xem trước giống màn hình học sinh. Bật **Bỏ qua câu trùng** thì câu đã có trong ngân hàng (cùng đề bài) sẽ không lưu lần nữa. Bấm **Lưu N câu vào ngân hàng** để lưu. Chỉ câu **Sẵn sàng** mới lưu được. Câu lưu lỗi hiện chữ đỏ ở dòng của câu đó.

### Mẫu Excel

Bấm **Tải mẫu Excel**. Tệp có trang "Câu hỏi" (6 dòng ví dụ) và trang "Hướng dẫn".

| Cột | Cách điền |
|---|---|
| Loại | Trắc nghiệm · Nhiều đáp án · Điền đáp án · Sắp xếp · Nối cặp · Đúng – Sai (bỏ trống thì máy tự đoán) |
| Câu hỏi | Đề bài (bắt buộc) |
| A … F | Lựa chọn. Sắp xếp: các thẻ theo **đúng thứ tự**. Nối cặp: mỗi ô `vế trái = vế phải` |
| Đáp án đúng | `B`, `b`, `2`, hoặc chép đúng nội dung lựa chọn. Nhiều đáp án: `A, C`. Điền đáp án: `24`, nhiều cách viết ngăn bằng `;` (`0,5; 1/2`). Đúng – Sai: `Đúng` / `Sai` |
| Gợi ý, Giải thích | Không bắt buộc |
| Mức độ | Nhận biết · Kết nối · Vận dụng (hoặc 1 / 2 / 3) |
| Môn, Lớp | Bỏ trống thì dùng môn, lớp chọn ở đầu hộp thoại |
| Mã kĩ năng | Ví dụ `T4.PS.RUT-GON`, nhiều mã ngăn bằng dấu phẩy |
| Đơn vị | Chỉ dùng cho Điền đáp án (cm, kg…) |
| Mã câu (không sửa) | Chỉ có khi xuất từ ngân hàng. Giữ nguyên thì khi nhập lại, câu đó được **cập nhật**, không tạo câu mới |

Tiêu đề cột viết khác vẫn đọc được ("Nội dung câu hỏi", "Phương án A", "ĐÁP ÁN", "Khối"…). Dòng trống bị bỏ qua. Các dòng tiêu đề phụ phía trên bảng cũng không sao.

**Xuất ra Excel** xuất đúng các câu đang hiện theo bộ lọc. Một số dạng không xuất được (kéo thả, phân loại, chạm hình, câu có ảnh trong lựa chọn…); ứng dụng sẽ báo số câu bị bỏ.

### Văn bản / Word đọc được những gì

- Đầu câu: `Câu 1:` `Câu 1.` `Câu 1 (1 điểm):` `Bài 1` `1.` `1)`. Số điểm và mức `(M2)` bị bỏ khỏi đề, mức thì được ghi vào Mức độ.
- Lựa chọn: `A.` `A)` `a/` `(A)`, mỗi dòng một ý, nhiều ý trên một dòng (`A. 5   B. 6   C. 7`), hoặc nằm cùng dòng với đề.
- Đáp án: `Đáp án: B`, `ĐA: B`, `Chọn B`, `Đáp án đúng là C`, `Đáp số: 24 cm`; dấu `*` trước lựa chọn, `(đúng)` sau lựa chọn; bảng đáp án cuối đề (`1.B 2.C 3.A`, `1-B, 2-C`, `1B 2A`, hai dòng `Câu 1 2 3` / `Đáp án B C A`, hoặc mục `ĐÁP ÁN` với `Câu 1: C`).
- Word: lựa chọn **tô đậm, gạch chân, tô nền hoặc chữ đỏ** được hiểu là đáp án đúng (trừ khi mọi lựa chọn đều như vậy). Lựa chọn xếp trong bảng vẫn đọc được.
- Câu không có lựa chọn → **Điền đáp án** (`Đáp số: 24 cm` → đáp án 24, đơn vị cm). Không ghi đáp án → "Thiếu đáp án".
- "Đúng ghi Đ, sai ghi S" + các ý a) b) c) → mỗi ý thành một câu Đúng – Sai.
- "Tính:" / "Đặt tính rồi tính:" + các phép tính a) b) → mỗi phép tính thành một câu điền.
- `Gợi ý:` và `Giải thích:` / `Lời giải:`.
- Phần đầu đề (tên trường, họ tên, tiêu đề PHẦN I…) bị bỏ qua. Bài đọc đứng trước câu 1 có thể chèn vào đề từng câu (có ô tick).
- Đoạn không hiểu được vẫn giữ lại, đánh dấu **Cần xem lại**, kèm chữ gốc.

### Giới hạn

- Excel: chỉ .xlsx (tệp .xls cũ phải "Lưu thành" .xlsx), tối đa 8 MB và 5000 dòng. Word: chỉ .docx, tối đa 15 MB. Không nhập hình ảnh, công thức phức tạp hay hộp văn bản. Số thứ tự tự động của Word không có trong chữ đọc ra.
- Ảnh / PDF gửi AI: tối đa 4 MB mỗi lần (ảnh được tự thu nhỏ còn cạnh dài 1600 px). PDF chọn được chữ thì nên **dán văn bản**: nhanh hơn, không tốn lượt AI, chép đúng từng chữ. Ứng dụng tự nhận ra loại PDF này và nhắc thầy/cô.
- AI soạn: 1–20 câu mỗi lần. Mỗi lần soạn hoặc đọc ảnh tốn 1 lượt AI (mặc định 60 lượt / thầy/cô / ngày, dùng chung với các tác vụ soạn khác).
- Chưa có khóa AI trên máy chủ: hai thẻ cần AI sẽ báo rõ và gợi ý chuyển sang Dán văn bản / Excel / Gõ nhanh.
- Chế độ demo: AI soạn chạy ngay trên máy (môn Toán ra phép tính có đáp án đúng, môn khác ra câu giữ chỗ). "Ảnh chụp / PDF" trả về 3 câu mẫu cố định, có nhãn **bản mẫu (demo)**.

## Phần kĩ thuật

### Mã nguồn

- `packages/data/src/import/` (thuần, có kiểm thử, xuất qua `@openedu/data/import`; app GV tải lười):
  - `textParser.ts`: `parseQuestionText(text, defaults, source)`. Không bao giờ ném lỗi; khối hỏng → `review`.
  - `xlsx.ts`: đọc/ghi .xlsx tối giản trên `fflate`. Ghi chuỗi nội tuyến, số, tiêu đề đậm cố định, độ rộng cột, danh sách chọn. Đọc sharedStrings (kể cả rich text), inlineStr, boolean, kết quả công thức. Tự chứa (agent xuất sổ điểm có thể dùng lại).
  - `docx.ts`: `docxToText` (đoạn, bảng, công thức OMML dạng a/b, đánh dấu ✓ cho chữ đậm/gạch chân/tô màu trong lựa chọn).
  - `template.ts`: cột mẫu, `buildTemplateXlsx`, `importXlsx` / `rowsToDrafts`, `exportItemsXlsx` / `itemToRow`. Xuất → nhập giữ nguyên nội dung và đáp án; dòng có "Mã câu" trùng câu trong ngân hàng → cập nhật (giữ ảnh, thẻ, sao).
  - `dedupe.ts`: `promptKey` (bỏ "Câu n:", chữ thường, gộp khoảng trắng, bỏ dấu câu cuối; **giữ** dấu tiếng Việt). Đề ≥ 20 kí tự thì trùng đề là trùng; đề ngắn ("Tính:") phải trùng cả nội dung lựa chọn / đáp án.
  - `check.ts`: `checkItem`, `draftStatus`, `draftReasons`.
  - `ai.ts`: `aiGenerateItems`, `aiExtractItems` (demo → bản mẫu), `prepareAiFile` (nén ảnh bằng `compressWorkImage`, giới hạn 4 MB), `pdfLooksTextual`.
- App GV: `apps/teacher/src/pages/itembank/{QuickAdd,Review,SkillPicker,lib}.tsx`, `styles/itembank.css`; `pages/ItemBank.tsx` (nút, nhân bản, xuất).
- Lưu: `DataSource.saveItem` cho từng câu, chạy song song 3 câu một lúc, có thanh tiến độ, báo lỗi theo từng dòng.

### Edge Function `ai-gateway`

- **Mới, task `extract_items`** (`supabase/functions/ai-gateway/extract.ts`). Chỉ GV/admin, hạn mức nhóm `generate`. Vào `{ fileBase64, mimeType, grade?, subject? }`. Server kiểm tra mimeType, chữ kí đầu tệp và kích thước ≤ 4 MB. Gửi tệp cho mô hình như `ai-grade`: OpenRouter dùng `image_url` (data URL) với ảnh và `file` với PDF; Gemini dùng `inline_data`. Thời gian chờ 60 giây. Kết quả đi qua **cùng `normalizeItem`** với `generate_items`. Câu MCQ / SHORT_ANSWER không có đáp án vẫn được giữ, với đáp án rỗng (để màn hình soát báo "Thiếu đáp án"). Đáp án do AI tự giải được gắn thẻ `dap-an-ai`; màn hình soát nhắc GV kiểm tra, rồi bỏ thẻ này khi lưu.
- Thân yêu cầu giờ đọc tối đa ~6 MB. Các task khác vẫn bị chặn ở 100 KB (kiểm tra sau khi đọc).
- **Mở rộng `generate_items`**: ngoài `text` còn nhận `topic`, `skillCodes` + `skillTexts` (yêu cầu cần đạt), `difficultyMix`. Phải có `text` ≥ 20 kí tự **hoặc** `topic` / `skillTexts`. Có `skillCodes` thì gắn `skills` vào item trả về.

### Chưa kiểm thử / cần làm khi tích hợp

- **Chưa chạy Edge Function** (không có Deno, không có mạng tới Supabase/AI). Chỉ kiểm tra kiểu bằng `tsc` với shim Deno. Cần triển khai lại: `supabase functions deploy ai-gateway`, kèm tệp mới `extract.ts`.
- Chưa thử với mô hình thật: định dạng `file` của OpenRouter cho PDF (tùy mô hình; mặc định `google/gemini-2.5-flash` hỗ trợ) và chất lượng chép đề.
- `aiGenerateItems` / `aiExtractItems` ở chế độ Supabase gọi `functions.invoke('ai-gateway')`; đường đi này chưa chạy thật.
- Trình duyệt đã thử (bản build demo, Playwright): dán đề 6 câu lộn xộn → soát → sửa đáp án → lưu → câu có trong ngân hàng; dán lại → 6 câu bị đánh dấu trùng; tải mẫu → tải lên (6 câu sẵn sàng); xuất Excel → nhập lại (cập nhật câu cũ); thẻ Ảnh/PDF và AI soạn ở demo; lưới gõ nhanh; nhân bản.
