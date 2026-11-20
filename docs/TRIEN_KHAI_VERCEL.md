# Đưa OPEN-EDU lên GitHub và Vercel

## 1. GitHub (một lần)

Trong thư mục dự án (cửa sổ dòng lệnh):

```
git init
git add .
git commit -m "OPEN-EDU"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/<kho>.git
git push -u origin main
```

`.gitignore` đã loại `node_modules`, `dist`, `.env.local`, `.vercel` — không có mật khẩu hay khóa bí mật nào lên GitHub.
Khóa publishable của Supabase là khóa công khai (nằm sẵn trong app), không phải bí mật.

Lần sau cập nhật: `git add . && git commit -m "mô tả" && git push`.

## 2. Vercel — 3 dự án từ cùng một kho

| Dự án Vercel | Root Directory | Ai dùng |
|---|---|---|
| `…-hoc` | `apps/learner` | học sinh, phụ huynh |
| `…-gv` | `apps/teacher` | giáo viên, quản trị |
| `…-tv` | `apps/present` | màn hình lớp |

Mỗi dự án: **Add New → Project → Import** kho GitHub → **Root Directory** chọn thư mục ở bảng trên →
**Framework Preset: Other** → để trống Build / Output / Install (Vercel tự dùng `pnpm`) → thêm biến môi trường → **Deploy**.

Biến môi trường (Settings → Environment Variables):

| Biến | Giá trị | Dự án |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | cả 3 |
| `VITE_SUPABASE_ANON_KEY` | khóa publishable (`sb_publishable_…`) | cả 3 |
| `VITE_STUDENT_EMAIL_DOMAIN` | `openlms.edu` | cả 3 |
| `VITE_LEARNER_URL` | địa chỉ dự án học sinh | giáo viên, TV |
| `VITE_PRESENT_URL` | địa chỉ dự án TV | giáo viên |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | cả 3 (dùng đúng pnpm 10 ghi trong package.json) |

Đổi biến môi trường xong phải **Redeploy** (biến được đóng vào app lúc build).

Cách app chạy trên Vercel: khi build có biến `VERCEL=1`, `tools/make-headers.mjs` xuất thêm `.vercel/output`
(Build Output API) gồm tệp tĩnh + header bảo mật (CSP…) + điều hướng mọi đường dẫn về `index.html`.

## 3. Sau khi có địa chỉ Vercel

1. Cho Edge Functions nhận yêu cầu từ 3 địa chỉ mới:
   `npx supabase@latest secrets set CORS_ORIGINS=https://…-hoc.vercel.app,https://…-gv.vercel.app,https://…-tv.vercel.app --project-ref <ref>`
2. Supabase → Authentication → URL Configuration → **Site URL** = địa chỉ app học sinh.
3. Đăng ký app ngoài (app đọc hiểu) với địa chỉ mới ở Quản trị → Ứng dụng kết nối.
4. Kiểm tra: mở app học sinh → F12 → Console không có dòng "Refused to …" (CSP chặn).

## Lỗi hay gặp

- **404 khi tải lại trang con** (ví dụ `/hoc`): dự án chưa dùng bản `make-headers.mjs` mới, hoặc Framework Preset không phải Other → Redeploy.
- **Trang vào chế độ demo**: thiếu `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → thêm rồi Redeploy.
- **Build lỗi `pnpm`**: thêm `ENABLE_EXPERIMENTAL_COREPACK=1`.
- **Chấm bài / AI báo lỗi mạng**: chưa đặt `CORS_ORIGINS` (mục 3.1).
