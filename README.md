# OPEN-EDU

Hệ thống học tập cho học sinh tiểu học, viết lại từ OpenLMS. Đợt 1 gồm: nền móng monorepo, 16 dạng hoạt động,
Góc học tập của học sinh, phân hệ **bài giảng tương tác** (soạn bài, tự học, trình chiếu trực tiếp trên TV, gói HTML5),
và bộ linh vật "Những người bạn khắp thế giới".

## Chạy thử nhanh (chế độ demo, không cần server)
Cần Node.js 20 trở lên và pnpm 10 (`npm i -g pnpm`).

```bash
pnpm install
pnpm relay            # máy chủ lớp học trực tiếp (cổng 8787) — mở một cửa sổ riêng
pnpm dev:learner      # Góc học tập học sinh  → http://localhost:5173
pnpm dev:teacher      # Bàn làm việc giáo viên → http://localhost:5174
pnpm dev:present      # Màn hình lớp (TV)      → http://localhost:5175
npx vite content-host --port 5180   # origin nội dung cho gói HTML5 mẫu
```

Tài khoản demo (mật khẩu `123456`): giáo viên `colan`, quản trị `admin`, học sinh `an2a1`, `binh2a2`, `chi2a3`,
`dung2a4` (lớp 2A), `em1b1` (lớp 1), `phuong3c1` (lớp 3), phụ huynh `phuhuynh`.

Thử trong lớp thật: chạy các lệnh trên ở laptop giáo viên; máy tính bảng / điện thoại học sinh trong cùng Wi-Fi mở
`http://<địa-chỉ-IP-laptop>:5173`. TV mở `http://<địa-chỉ-IP-laptop>:5175`.

## Dùng với Supabase (gói Free)
Xem `supabase/README.md`: thêm schema `v2`, chạy migrations, triển khai Edge Functions, rồi chép `.env.example`
thành `.env` và điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Cấu trúc
Xem `docs/CONVENTIONS.md` và `docs/SUPABASE_API.md`.

## Chuyển đổi, kiểm thử & phát hành (Phase 5)
- **Kế hoạch chạy song song & chuyển hẳn** (thí điểm HK2 2026–2027, chuyển năm học 2027–2028, hoàn tác): `docs/CUTOVER.md`.
- **Chuyển dữ liệu app cũ**: `node tools/migrate-v1/run.mjs --dry-run` rồi chạy thật — báo cáo đối soát Markdown/CSV
  (`tools/migrate-v1/README.md`). Đồng bộ hằng đêm: `.github/workflows/nightly-migrate.yml`.
- **Kiểm thử bảo mật CSDL** (pgTAP): `tools/run-db-tests.sh` (Docker) hoặc `tools/run-db-tests.sh --plain --migrate`.
- **CI** (`.github/workflows/ci.yml`): typecheck, test, build 3 app, ngân sách chunk chính app HS ≤ 170 KB gzip
  (`node tools/check-budget.mjs`), pgTAP + ETL.
- **App Android/iOS** (Capacitor, `vn.openedu.hocsinh`): `apps/learner/resources/README.md`. App GV: cài PWA.
- **Tài liệu tập huấn**: `docs/huong-dan/` — giáo viên, phụ huynh, quản trị, buổi tập huấn 90 phút.
