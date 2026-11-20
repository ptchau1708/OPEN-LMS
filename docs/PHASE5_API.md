# Phase 5 (A) — Phụ huynh thật, mã liên kết, báo cáo trường, quản trị: API cho người làm giao diện

Kiểu dữ liệu: `packages/contracts/src/school.ts`. Mã: `packages/data/src/school/*` (thuần: `codes`, `accounts`, `csv`, `reports`, `digest`, `login`;
nguồn: `demo.ts`, `supabase.ts`; hook: `react.tsx`). Tách khỏi `DataSource`: lấy bằng `getSchoolSource(ds?)` hoặc hook `useSchoolSource()`.
Supabase: migration `20261113000002_v2_school.sql` + Edge Function `school-admin`. Kiểm thử: `src/__tests__/school.test.ts`, `supabase/tests/database/rls_school.test.sql`.

## 1. Tài khoản phụ huynh & mã liên kết
- Phụ huynh tự đăng ký (Supabase Auth, email **hoặc số điện thoại** làm tên đăng nhập; SĐT → `<số>@parent.<miền>`) — **bắt buộc có mã liên kết của con**; mã sai → không tạo tài khoản.
- GV lớp / admin sinh mã: 8 kí tự (bảng chữ `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, không 0/O/1/I/L), **dùng 1 lần**, hết hạn **14 ngày**; sinh mã mới thu hồi mã còn hạn cũ của HS đó.
- Mỗi HS tối đa **4 phụ huynh** (trigger), một phụ huynh nhiều con (nhập lần lượt từng mã). Nhập sai ≥ 10 lần/ngày → chặn đến hôm sau.
- Phiếu in (teacher `/phu-huynh`): 8 phiếu/A4, QR → `<learner>/phu-huynh/lien-ket?ma=CODE` (mã tự điền). Đặt `VITE_LEARNER_URL` cho app GV.
- GV xem phụ huynh đã liên kết (email/SĐT che bớt) và gỡ liên kết.

| Hàm (`SchoolSource`) | Hook | Ai |
|---|---|---|
| `createGuardianCodes(classId, studentIds?)` | `useCreateGuardianCodes().mutate({ classId, studentIds? })` | GV lớp, admin |
| `listGuardianCodes(classId)`, `revokeGuardianCode(code)` | `useGuardianCodes`, `useRevokeGuardianCode` | GV lớp, admin |
| `listGuardianLinks(classId)`, `revokeGuardianLink(parentId, studentId)` | `useGuardianLinks`, `useRevokeGuardianLink` | GV lớp, admin |
| `registerParent({ login, password, name, code, relation? })` → `Profile` (đã đăng nhập) | `useRegisterParent` | chưa đăng nhập |
| `redeemGuardianCode(code)` → `{ child, alreadyLinked }` | `useRedeemGuardianCode` | phụ huynh (dùng lại mã của chính mình không lỗi) |
| `getParentDigest(childId, weekStart?)` → `ParentDigest` | `useParentDigest(childId, weekStart?)` | phụ huynh của con, GV, chính HS |

Thuần: `generateGuardianCode`, `normalizeCode`, `formatCode` ("ABCD-EFGH"), `codeStatus`, `checkRedeem`, `maskLogin`, `normalizeParentLogin`.
`ParentDigest`: tuần thứ Hai→CN giờ VN; `days[7]`, `totals` (ngày học, câu, % đúng, sao, bài xong, bộ ôn đạt), `works` (bài viết đã duyệt trong tuần),
`attendance`, `behavior`, `tt27` (bản **final** mới nhất; `generalComment` = "Lời nhắn của cô"), `tips` (≤ 3). Lắp từ DataSource công khai (`school/generic.ts`) nên chạy cả demo lẫn Supabase.

App HS: `/phu-huynh/lien-ket` (công khai; đăng ký / đăng nhập + mã / thêm con), `/phu-huynh` có thanh chọn con + "Thêm con", bản tin tuần (lùi 12 tuần), thẻ TT27.
HS trên máy dùng chung vào chế độ phụ huynh qua khoá phép tính (đã có, `ParentGate`).

## 2. Báo cáo trường (admin cả trường, GV chỉ lớp mình)
| Hàm | Hook | Trả về |
|---|---|---|
| `getSchoolOverview({ from?, to? })` (mặc định thứ Hai tuần này → nay) | `useSchoolOverview(range)` | `SchoolOverview`: số lớp/GV/HS, HS hoạt động, bài hoàn thành, câu & % đúng, chuyên cần 30 ngày, % TT27 final (kì trong cài đặt), AI chấm (hôm nay / hạn mức, trong khoảng), `mastery[]` khối × môn, `rows: ClassReportRow[]` |
| `getGradeHeatmap(grade, subject='toan')` | `useGradeHeatmap` | `GradeHeatmap`: lớp × kĩ năng → `{ n, avgP, counts }` + `total` cả khối (gộp bản đồ nhiệt các lớp) |

Luật: thành thạo TB = trung bình `p` các ô (HS × kĩ năng) đã làm ≥ 3 lần; "có lỗ hổng" = HS có ≥ 1 kĩ năng `can-on`; chuyên cần = (có mặt + muộn)/lượt điểm danh.
Xuất CSV (trên máy): `schoolReportCsv(o)`, `tt27Rows(students, evals, subjects)` + `toCsv` (BOM, CRLF, dấu phẩy thập phân, chặn công thức) hoặc `toTsv` (sao chép → dán vào phần mềm quản lí trường / Excel). Cột TT27: STT, Mã HS, Họ và tên, mỗi môn *Mức đạt (T/H/C)*, *Điểm KTĐK*, *Nhận xét*, `NL …`, `PC …` (T/Đ/C), Nhận xét chung, Trạng thái. `downloadText(name, text)`.
Trang GV: `/bao-cao`, `/bao-cao/ban-do-khoi`.

## 3. Quản trị (admin)
| Hàm | Hook | Ghi chú |
|---|---|---|
| `getSchoolSettings()` / `saveSchoolSettings(s)` | `useSchoolSettings`, `useSaveSchoolSettings` | `{ schoolName, schoolYear '2026-2027', termId, aiDailyQuota }` |
| `listSchoolUsers({ role?, classId? })` | `useSchoolUsers` | GV: chỉ HS lớp mình |
| `saveClass({ id?, name, grade, teacherId? })` | `useSaveClass` | tên viết hoa, không trùng; đổi khối → khối HS |
| `createTeacher({ name, username?, password? })` → `AccountSlip` | `useCreateTeacher` | tên tự sinh "thunt" |
| `bulkCreateStudents(classId, names)` → `AccountSlip[]` | `useBulkCreateStudents` | ≤ 60/lần; `parseNameList(text)` bỏ STT/tiêu đề/cột thừa |
| `resetPassword(userId)` → `AccountSlip` | `useResetPassword` | admin; GV cho HS lớp mình; không áp dụng phụ huynh |

Tên đăng nhập HS = tên gọi không dấu + tên lớp + số thứ tự trong lớp (`an4a1`); trùng cả trường → tăng số (`generateStudentAccounts`). Mật khẩu 6 chữ số ngẫu nhiên (crypto), **chỉ hiện một lần** trên phiếu in / CSV.
Trang: `/quan-tri/lop`, `/quan-tri/tai-khoan`, `/quan-tri/cai-dat` (chỉ admin; menu ẩn với GV).

## 4. Dữ liệu demo
Admin `admin` / 123456 · phụ huynh `phuhuynh4a` / 123456 (→ Ngọc Lan) · mã mẫu **CHAU-2A3K** để thêm con thứ hai (Bảo Chi, 2A) ·
mã **QWTR-4A6M** (Tường Vy, còn hạn) để thử đăng ký phụ huynh mới. Tên trường "Trường Tiểu học Hòa Bình", kì GK1.
Demo lưu mật khẩu tự đặt ở khoá `passwords` (chỉ demo, trên máy). Kho localStorage riêng theo origin: mã tạo ở app GV không thấy ở app HS (Supabase thì có).

## 5. Bảo mật & dữ liệu cũ
- `public.parents.password` (chữ thường, hệ cũ) **không được đọc, chép hay dùng để đăng nhập**; trigger chỉ lấy tên. Phụ huynh đăng ký lại bằng mã.
  Khi app cũ ngừng: `alter table public.parents drop column password;` (hoặc ít nhất `revoke select on public.parents from anon, authenticated`).
- Vá `v2.handle_new_auth_user`: tài khoản tạo qua GoTrue chỉ nhận vai trò từ `app_metadata` (Edge Function đặt); `user_metadata.role` chỉ được `parent` → tự đăng ký không thành GV/admin.
- `guardian_codes`, `guardian_code_attempts`: không ai ghi trực tiếp (chỉ RPC security definer). Edge Function `school-admin` dùng service role sau khi tự kiểm tra quyền.
