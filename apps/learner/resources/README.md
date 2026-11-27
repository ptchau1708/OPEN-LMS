# App học sinh trên Android / iOS (Capacitor)

App giáo viên **không** đóng gói native — cài dạng PWA (Chrome/Edge: menu ⋮ → *Cài đặt ứng dụng*; Safari iPad:
Chia sẻ → *Thêm vào MH chính*). App học sinh dùng được cả PWA lẫn app cài từ cửa hàng.

## Thư mục này
| Tệp | Dùng cho |
|---|---|
| `icon-only.png` (1024²) | icon iOS, icon cũ Android |
| `icon-foreground.png` + `icon-background.png` (1024²) | adaptive icon Android (linh vật trong vùng an toàn 66 %) |
| `splash.png`, `splash-dark.png` (2732²) | màn hình chờ sáng / tối |
| `pwa-192.png`, `pwa-512.png` | icon PNG cho manifest PWA (tùy chọn; hiện manifest dùng `public/icon.svg`) |
| `mascot.svg` | linh vật Nghé Tí kết xuất từ `packages/ui` |

Sinh lại (sau khi đổi linh vật): `node tools/gen-app-icons.mjs [--mascot nghe]` (cần Python Playwright + Chromium).

## Cài đặt lần đầu (máy có mạng)
```bash
pnpm --filter @openedu/learner add @capacitor/core @capacitor/camera @capacitor/splash-screen
pnpm --filter @openedu/learner add -D @capacitor/cli @capacitor/android @capacitor/ios @capacitor/assets
cd apps/learner
pnpm exec cap add android          # cần Android Studio + JDK 17
pnpm exec cap add ios              # cần macOS + Xcode 15+, CocoaPods
pnpm cap:assets                    # sinh mọi kích thước icon/splash từ resources/
```
Hằng ngày: `pnpm --filter @openedu/learner cap:android` (hoặc `cap:ios`) = build web → `cap sync` → mở Android Studio / Xcode.
Biến môi trường `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` lấy từ `.env` gốc lúc build như bản web.
`@capacitor/camera` là tùy chọn: ô chụp bài làm hiện dùng `<input type="file" capture>` vẫn chạy trong WebView; plugin chỉ
cần nếu muốn giao diện chụp native (việc của nhóm app — TODO).

## Quyền camera / ảnh (tiếng Việt)
**iOS** — `ios/App/App/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>OPEN-EDU dùng máy ảnh để em chụp bài làm trên giấy gửi cho thầy/cô.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>OPEN-EDU mở thư viện ảnh để em chọn ảnh bài làm gửi cho thầy/cô.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>OPEN-EDU lưu ảnh bài làm vào thư viện khi em yêu cầu.</string>
<key>NSMicrophoneUsageDescription</key>
<string>OPEN-EDU dùng micrô khi em luyện đọc thành tiếng.</string>
<key>CFBundleDevelopmentRegion</key><string>vi</string>
```
**Android** — `android/app/src/main/AndroidManifest.xml`: `CAMERA`, `RECORD_AUDIO` (luyện đọc), `READ_MEDIA_IMAGES`
(Android 13+) / `READ_EXTERNAL_STORAGE` với `android:maxSdkVersion="32"`. Không xin quyền vị trí, danh bạ, quảng cáo
(`AD_ID`): thêm `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"/>`.
Lời giải thích hiện trước hộp xin quyền: "Cho phép OPEN-EDU dùng máy ảnh để chụp bài làm gửi thầy/cô nhé!"

## Google Play — chính sách Gia đình (Families)
- Play Console → *Nội dung ứng dụng* → **Đối tượng mục tiêu**: chọn nhóm tuổi **6–8** và **9–12** (tiểu học) ⇒ app thuộc
  chương trình Families, phải tuân thủ *Families Policy* + COPPA/GDPR-K.
- **Không quảng cáo**, không SDK quảng cáo; **không analytics/crash SDK bên thứ ba** (không Firebase Analytics,
  không Sentry…). App hiện chỉ gọi Supabase của trường + Edge Function AI (không gửi tên HS cho nhà cung cấp AI).
- **Data safety**: khai báo thu thập *tên, ảnh bài làm, giọng đọc (nếu dùng), tiến độ học tập*; mục đích: chức năng app;
  không chia sẻ cho bên thứ ba; mã hóa khi truyền; có cách yêu cầu xóa dữ liệu (qua nhà trường — ghi email trường).
- **Chính sách quyền riêng tư** (URL công khai, tiếng Việt), ghi rõ đơn vị chủ quản là nhà trường; tài khoản do trường
  cấp, không có đăng ký công khai, không chat tự do giữa HS.
- Xếp loại nội dung IARC: *Mọi lứa tuổi / 3+*. Danh mục: Giáo dục. Không có mua trong app.
- Tài khoản dành cho người duyệt (App access): cấp 1 tài khoản HS demo + mật khẩu.

## App Store — danh mục Kids
- App Store Connect → Category **Education** + bật **Kids Category**, nhóm tuổi **6–8** (hoặc **9–11**).
- Theo Guideline 1.3 & 5.1.4: **không quảng cáo theo hành vi, không analytics bên thứ ba**, không gửi dữ liệu nhận dạng
  ra ngoài; mọi liên kết ra ngoài app / trang mua hàng phải sau **parental gate** (cổng phụ huynh — vd. phép tính
  người lớn). Liên kết "Mở app cũ" (`VITE_LEGACY_URL`) và trang phụ huynh phải nằm sau cổng này — TODO nhóm app.
- *App Privacy* (nhãn dinh dưỡng): "Data Not Linked to You" chỉ khi đúng thực tế; dữ liệu học tập gắn tài khoản ⇒
  khai báo *Linked to You*, mục đích *App Functionality*, **không** *Tracking* (không cần ATT).
- Có Sign in tài khoản trường ⇒ cung cấp tài khoản demo cho người duyệt; ghi rõ app dành cho HS của trường đã cấp tài khoản.
- Ảnh chụp màn hình: iPhone 6.7″ và iPad 13″ (app chạy tốt trên iPad).
