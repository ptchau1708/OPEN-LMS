# Cầu nối VnEdu và Google Classroom

Trang **Xuất / nhập dữ liệu** (`/xuat-nhap` trong app giáo viên, mục TRƯỜNG) gom mọi việc trao đổi dữ liệu với
VnEdu (qua tệp Excel) và Google Classroom. Giáo viên thấy các lớp mình chủ nhiệm; quản trị thấy mọi lớp.

> **Chưa nối trực tiếp với VnEdu** vì VNPT chưa cấp cổng kết nối (API) cho trường. Trường chỉ có tài khoản web VnEdu
> thông thường, nên cầu nối hiện tại đi qua tệp Excel: tải mẫu từ VnEdu → OPEN-EDU điền → tải tệp lên lại VnEdu.

## Làm được gì hôm nay

| Việc | Cần cấu hình? | Đã kiểm thử |
|---|---|---|
| Điền điểm / nhận xét TT27 / chuyên cần vào tệp Excel tải từ VnEdu | Không | Có (kiểm thử đơn vị + trình duyệt, tệp mở được bằng openpyxl) |
| Nhập danh sách lớp từ tệp VnEdu (tạo tài khoản, lưu mã học sinh) | Không | Có (chế độ demo) |
| Cập nhật mã học sinh cho em đã có (ghép theo họ tên) | Không | Có (demo + pgTAP) |
| Xuất nhanh: danh sách lớp, bảng điểm một đề, tổng hợp TT27, chuyên cần tháng | Không | Có |
| Nút “Chia sẻ lên Classroom” (Bài giảng, Giao bài, Bài viết, Đề kiểm tra) | Không | Có (link đúng dạng; chưa bấm thử với Google thật) |
| Nhập danh sách từ Google Classroom, đẩy điểm sang Classroom | `VITE_GOOGLE_CLIENT_ID` | **Chưa thử với Google thật** — chỉ kiểm thử bằng phản hồi giả |
| Slide “Nhúng trang web” (Google Trang trình bày / Biểu mẫu, GeoGebra, Wordwall…) | Không | Có (chuyển link; khung nhúng chưa thử với từng trang thật) |

## Hướng dẫn cho thầy cô

### 1. Điền vào mẫu VnEdu
1. Trên VnEdu, tải tệp Excel của lớp (sổ điểm, bảng nhận xét TT27, bảng chuyên cần…) về máy. Nếu VnEdu cho chọn
   định dạng, chọn **.xlsx**. Tệp **.xls** đời cũ: mở bằng Excel → *Lưu thành* → *Excel Workbook (.xlsx)*.
2. Vào **Xuất / nhập dữ liệu → Điền vào mẫu**, chọn lớp, kì (TT27) và tháng (chuyên cần), rồi **Chọn tệp Excel từ VnEdu**.
3. **Ghép học sinh**: OPEN-EDU tự tìm dòng tiêu đề (bỏ qua tên trường, tên bảng phía trên), rồi ghép từng dòng với học sinh
   trong lớp — theo **mã học sinh** trước, sau đó theo **họ tên** (không phân biệt dấu, nhận cả khi tệp ghi đủ họ còn
   OPEN-EDU ghi tên ngắn). Dòng “Cần chọn” / “Chưa thấy”: chọn tay trong ô bên phải, hoặc để trống (dòng đó giữ nguyên).
4. **Chọn dữ liệu cho từng cột**: mỗi cột của tệp có một ô chọn: điểm đề kiểm tra (thang 10) hoặc mức đạt T/H/C theo đề,
   điểm trung bình bài viết đã duyệt, TT27 theo môn (mức đạt, điểm KTĐK, nhận xét), năng lực, phẩm chất, nhận xét chung,
   số buổi vắng có phép / không phép / đi muộn / có mặt trong tháng… OPEN-EDU gợi ý sẵn theo tên cột; thầy cô xem lại.
   Tích “Giữ nguyên ô đã có dữ liệu” nếu chỉ muốn điền ô trống.
5. **Xem trước** (ô xanh = sẽ điền; “–” = OPEN-EDU chưa có dữ liệu, ô để nguyên) rồi **Tải tệp đã điền**. Tệp mới tên
   `<tên cũ>-da-dien.xlsx`; mở kiểm tra rồi nhập vào VnEdu như bình thường.
6. Lần sau dùng cùng mẫu (cùng tiêu đề cột), OPEN-EDU **nhớ cách ghép cột** trên máy này — chỉ cần bấm tải.

Tệp được xử lí ngay trong trình duyệt, không gửi lên máy chủ. OPEN-EDU chỉ sửa giá trị các ô được chọn bên trong tệp
gốc: định dạng, ô gộp, độ rộng cột, các trang tính khác giữ nguyên. Nếu tệp có cấu trúc lạ không sửa trực tiếp được,
OPEN-EDU tạo tệp mới có **cùng dòng tiêu đề và thứ tự cột** (mất màu sắc/phông chữ) và báo rõ trên màn hình.
Ô công thức bị điền đè sẽ thành giá trị.

### 2. Nhập danh sách lớp từ VnEdu
1. Xuất danh sách học sinh của lớp từ VnEdu ra Excel (cần cột Họ và tên; nên có Mã học sinh / Mã định danh).
2. **Xuất / nhập dữ liệu → Nhập danh sách** → chọn tệp.
3. Bảng xem trước cho biết em nào **đã có** (sẽ cập nhật mã), em nào **sẽ tạo mới**, dòng nào cần chọn tay.
4. **Cập nhật mã cho … em đã có** và/hoặc **Tạo … tài khoản mới**. Tài khoản mới tạo qua đường tạo hàng loạt sẵn có
   (Edge Function `school-admin`, action `create-students`; tối đa 60 em mỗi lượt, tự chia lượt) rồi ghi mã học sinh.
   Mật khẩu chỉ hiện một lần — in phiếu ngay.
5. Xem / sửa mã từng em ở thẻ **Mã học sinh** (hoặc từ đầu trang Hồ sơ học sinh → “thêm mã HS”).

Tạo tài khoản: quản trị, hoặc GV **chủ nhiệm** của lớp (giống Edge Function). Ghi mã: GV chủ nhiệm, GV dạy cùng, quản trị.

### 3. Xuất nhanh
Thẻ **Xuất nhanh**: danh sách lớp; bảng điểm một đề; tổng hợp TT27 theo kì (tiêu đề 2 tầng: môn → mức đạt / điểm /
nhận xét; năng lực; phẩm chất); chuyên cần tháng (M/P/K theo ngày + tổng); hoặc tất cả trong một tệp nhiều trang.
Mọi bảng bắt đầu bằng **STT, Mã học sinh, Họ và tên**; dòng tiêu đề in đậm, cố định khi cuộn; mã học sinh là chữ
(giữ số 0 ở đầu).

### 4. Chia sẻ lên Google Classroom
Nút **Classroom** cạnh mỗi bài giảng đã xuất bản, bài đã giao, bài viết, đề kiểm tra đã phát hành mở trang chia sẻ
của Google (`https://classroom.google.com/share?url=…&title=…`). Thầy cô chọn lớp Classroom và đăng dạng thông báo /
bài tập / tài liệu. Học sinh bấm link sẽ mở thẳng bài trong app học sinh:
`/bai/<id>` (bài giảng), `/goi/<id>` (gói HTML5), `/bai-viet/<id>`, `/kiem-tra/<id>`. Địa chỉ app học sinh lấy từ
`VITE_LEARNER_URL` — **phải đặt** ở bản chạy thật, nếu không link sẽ trỏ về `http://<máy>:5173`.

### 5. Nhập danh sách / đẩy điểm qua Google Classroom (cần cấu hình)
- **Nhập danh sách**: Kết nối Google → chọn lớp Classroom → xem học sinh (họ tên, email) → ghép với học sinh lớp
  OPEN-EDU (tự ghép theo họ tên) hoặc tạo mới → Lưu. OPEN-EDU lưu id + email Google của từng em.
- **Đẩy điểm**: chọn nguồn điểm (một đề đã phát hành, hoặc điểm TB bài viết) → chọn lớp Classroom → OPEN-EDU **tạo
  bài tập mới** trên Classroom (điểm tối đa 10, kèm link tới đề) rồi điền điểm từng em; kết quả hiện theo từng em.
  Mặc định điền **điểm nháp** (chỉ GV thấy, bấm “Trả bài” trong Classroom để HS thấy); có ô chọn điền luôn điểm chính thức.
- Vì sao phải tạo bài mới: Google chỉ cho một ứng dụng sửa điểm ở bài tập **do chính ứng dụng đó tạo**. Bài tập GV tự
  tạo trong Classroom sẽ báo lỗi 403 — OPEN-EDU dừng sớm và báo cách xử lí. Lần sau có thể chọn lại bài tập OPEN-EDU đã tạo.
- **Classroom không có chức năng nhập điểm từ tệp.** Tệp “Bảng điểm theo bố cục Classroom / Google Sheets” (CSV/XLSX:
  Mã HS, Họ tên, Email Google, mỗi đề một cột, dòng 2 = điểm tối đa) chỉ để lưu, mở bằng Google Sheets, hoặc đối chiếu.

### 6. Slide “Nhúng trang web”
Trong trình soạn, slide **Toàn màn hình** (không có video) có ô **Nhúng trang web**: dán link chia sẻ hoặc cả mã
`<iframe>`. Nhận: YouTube; Google Trang trình bày / Tài liệu / Trang tính / Biểu mẫu (link “đã xuất bản” hoặc chia sẻ
“Bất kì ai có đường liên kết”) / tệp Drive; Quizizz (Wayground); Wordwall (mã nhúng); Canva (link xem); Padlet (mã
nhúng); GeoGebra; Scratch. Link được đổi sang dạng nhúng, hiện trong khung sandbox; luôn có nút **Mở trong tab mới**
(trang có thể từ chối hiện trong khung — trình duyệt không cho biết). Trang khác bị từ chối kèm lời nhắn.
Danh sách nằm ở `packages/lesson-player/src/embed.ts` và phải trùng `EMBED_FRAME_ORIGINS` trong `tools/make-headers.mjs`
(kiểm thử so khớp).

## Cài đặt Google Client ID (quản trị / người triển khai)
1. Vào https://console.cloud.google.com bằng tài khoản Google Workspace của trường → tạo dự án (vd “OPEN-EDU”).
2. *APIs & Services → Library* → bật **Google Classroom API**.
3. *OAuth consent screen*: User type **Internal** (chỉ tài khoản trong tên miền trường; không cần Google duyệt).
   Nếu trường không dùng Workspace phải chọn External — khi đó các phạm vi Classroom là “sensitive”, cần Google xác minh
   ứng dụng hoặc để ở chế độ Testing (tối đa 100 người dùng thử, phải thêm từng email).
   Phạm vi (scopes):
   - `https://www.googleapis.com/auth/classroom.courses.readonly`
   - `https://www.googleapis.com/auth/classroom.rosters.readonly`
   - `https://www.googleapis.com/auth/classroom.profile.emails`
   - `https://www.googleapis.com/auth/classroom.coursework.students`
4. *Credentials → Create credentials → OAuth client ID* → **Web application**. *Authorized JavaScript origins*: địa chỉ
   app giáo viên (vd `https://gv.truong.edu.vn`, và `http://localhost:5174` nếu thử trên máy). Không cần redirect URI
   (dùng luồng token của Google Identity Services).
5. Đặt `VITE_GOOGLE_CLIENT_ID=<…>.apps.googleusercontent.com` (biến công khai, không bí mật) rồi dựng lại app giáo viên.
   `tools/make-headers.mjs` khi đó tự mở CSP cho app giáo viên: script `https://accounts.google.com/gsi/client`,
   style `https://accounts.google.com/gsi/style`, frame + connect `https://accounts.google.com`,
   connect `https://classroom.googleapis.com`. App học sinh / màn hình lớp không đổi.
6. Quản trị Google Workspace có thể phải cho phép ứng dụng (Admin console → Security → API controls → App access control).

Token chỉ giữ trong bộ nhớ trang (khoảng 1 giờ), không lưu xuống máy, không qua máy chủ OPEN-EDU.

## Giới hạn và phần chưa kiểm thử
- **Google Classroom API chưa thử với Google thật** (môi trường dựng mã không có tài khoản Google). Lớp API
  (`packages/data/src/export/classroom.ts`) là hàm thuần trên `fetch` tiêm vào, có kiểm thử với phản hồi giả: phân trang,
  403 “ProjectPermissionDenied”, 401, mất mạng, lỗi từng phần. Luồng đăng nhập GIS (`gis.ts`) chưa chạy lần nào.
- **Chưa có tệp mẫu VnEdu thật.** Bộ nhận dạng đã thử với tệp giả lập kiểu VnEdu (dòng tên trường gộp ô, tiêu đề 2 tầng
  ở dòng 6–7, mã định danh có số 0 đầu, dòng chữ kí cuối bảng) tạo bằng openpyxl và bằng chính bộ ghi của OPEN-EDU.
  Khi có tệp thật, thêm vào kiểm thử `packages/data/src/__tests__/bridge.test.ts`; tên cột lạ thêm vào `ALIASES`
  trong `export/detect.ts`.
- Không đọc được tệp .xls đời cũ (BIFF) và tệp có mật khẩu — báo lỗi kèm cách lưu lại thành .xlsx. Tệp “.xls” thực chất
  là bảng HTML thì đọc được (khi điền sẽ ghi ra .xlsx mới).
- Cách ghép cột nhớ theo máy (localStorage), không theo tài khoản.
- Bản Supabase của `BridgeSource` (RPC `set_student_external_ids`, bảng `student_external_ids`) có kiểm thử pgTAP nhưng
  chưa chạy với project thật.
- Khung nhúng: chưa thử từng trang thật trong trình duyệt (cần mạng ra ngoài).

## Kĩ thuật
- `packages/data/src/export/` (xuất ra `@openedu/data` dưới không gian tên `bridge`):
  `xlsx.ts` (đọc/ghi .xlsx tự viết trên fflate), `xlsxPatch.ts` (điền ô trong tệp gốc: sửa XML trang tính,
  sharedStrings / inlineStr, bỏ calcChain khi đè công thức), `detect.ts` (dòng tiêu đề, cột, dấu vân tay mẫu),
  `match.ts` (ghép học sinh), `fields.ts` (trường dữ liệu + tải dữ liệu lớp), `template.ts` (kế hoạch điền, dự phòng,
  nhớ cách ghép), `exports.ts` (bảng dựng sẵn), `vnedu.ts` (đường nối), `classroom.ts`, `gis.ts`, `externalIds.ts`.
- UI: `apps/teacher/src/pages/bridge/*`; nút chia sẻ `ShareClassroom.tsx`.
- CSDL: `supabase/migrations/20261117000003_v2_external_ids.sql` — cột `v2.profiles.external_code` (+ chỉ mục, HS không
  tự sửa được), bảng `v2.student_external_ids` (provider `google`, RLS: chính HS / GV của lớp / quản trị đọc; ghi qua
  RPC), RPC `v2.set_student_external_ids(p_class, p_rows jsonb)`. Kiểm thử: `supabase/tests/database/external_ids.test.sql`.
- Edge Function `school-admin` **không đổi**: tài khoản tạo xong thì ghi mã bằng RPC.

## Kết nối trực tiếp VnEdu sau này
Chỗ cắm: `packages/data/src/export/vnedu.ts` — interface `VnEduConnector` (`pullRoster`, `pushMarks`, `pushComments`),
bản hiện tại `ExcelVnEduConnector`. Khi có API: viết `ApiVnEduConnector` gọi qua một Edge Function (giấu khóa), đổi
`getVnEduConnector()`; giao diện không phải sửa. Cần VNPT cung cấp:
1. Tài liệu API chính thức và môi trường thử (sandbox);
2. Cách xác thực (khóa / OAuth) cấp cho trường, phạm vi quyền theo trường / giáo viên;
3. Mã trường, mã lớp, mã học sinh (mã định danh) dùng trong API;
4. Định dạng đọc danh sách học sinh; định dạng ghi điểm, mức đạt, nhận xét TT27 (môn, năng lực, phẩm chất), chuyên cần;
5. Quy tắc khóa sổ / chốt kì, giới hạn số lần gọi, cam kết bảo vệ dữ liệu học sinh (Nghị định 13/2023/NĐ-CP).
