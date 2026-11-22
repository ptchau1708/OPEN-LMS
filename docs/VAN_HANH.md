# Vận hành OPEN-EDU trên Supabase Free

## 1. Ba việc tự động (GitHub Actions)

Đưa mã lên một repo GitHub **riêng tư**, vào Settings → Secrets and variables → Actions, thêm:

| Secret | Giá trị | Dùng cho |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | keepalive |
| `SUPABASE_ANON_KEY` | khóa publishable / anon (công khai) | keepalive |
| `SUPABASE_DB_URL` | chuỗi kết nối Postgres (Dashboard → Connect → Session pooler), có mật khẩu CSDL | backup |
| `BACKUP_PASSPHRASE` | mật khẩu mã hóa bản sao lưu, trường tự đặt và cất ở nơi an toàn | backup |

| Workflow | Lịch | Làm gì |
|---|---|---|
| `keepalive.yml` | Thứ Hai, thứ Năm 08:23 | Gọi `public.openedu_ping()` để dự án không bị tạm dừng sau 7 ngày không dùng (nghỉ hè, nghỉ Tết) |
| `backup.yml` | Chủ nhật 01:41 | `pg_dump` schema `v2` + tài khoản, mã hóa AES-256, lưu artifact 60 ngày. Tuần đầu tháng chạy thêm `v2.run_maintenance()` |
| `ci.yml` | Mỗi lần đẩy mã | typecheck, ESLint, kiểm thử, build, ngân sách dung lượng, E2E, pgTAP |

**Gói Free không có sao lưu tự động.** Trước khi dùng thật, bấm chạy tay `backup` một lần (Actions → backup → Run workflow), tải artifact về và thử giải mã:
`gpg -d openedu-YYYY-MM-DD.sql.gz.gpg | gunzip | head`.

Khôi phục vào một dự án trống: chạy các migration trước, rồi `gpg -d <tệp> | gunzip | psql "$SUPABASE_DB_URL"`.

Không dùng GitHub: mỗi tuần mở app một lần là đủ để dự án không tạm dừng; mỗi tháng chạy `select v2.run_maintenance();` trong SQL Editor; sao lưu bằng `pg_dump` trên máy quản trị.

## 2. Kiểm thử trước khi cập nhật

```
pnpm typecheck && pnpm lint && pnpm test     # mã
pnpm e2e                                      # 15 kịch bản giao diện ở chế độ demo (cần: pnpm exec playwright install chromium)
tools/run-db-tests.sh --plain                 # 299 kiểm tra CSDL (cần Postgres 16 + pgTAP)
```

## 3. Cập nhật lên Supabase thật

1. Migration mới: dán vào SQL Editor theo thứ tự tên (hoặc `supabase db push`).
2. Hàm máy chủ đổi: `npx supabase@latest functions deploy <tên> --project-ref <ref> --use-api`.
   Riêng `lti` và `school-admin` thêm `--no-verify-jwt` (hai hàm này tự kiểm tra đăng nhập).
3. App: `pnpm build` với `.env.local` đúng, rồi đưa `apps/*/dist` lên nơi đặt web (xem `docs/HARDENING.md`).

## 4. Theo dõi

- Lỗi máy học sinh / giáo viên gặp: `select at, app, message, url from v2.client_errors order by at desc limit 50;`
- Dung lượng: Dashboard → Usage (CSDL 500 MB, lưu trữ 1 GB ở gói Free — kiểm tra lại trang Pricing).
- Lịch pg_cron (nếu có): `select jobname, schedule, active from cron.job;`
