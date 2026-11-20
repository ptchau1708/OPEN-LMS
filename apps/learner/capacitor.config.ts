// Đóng gói app học sinh thành app Android/iOS bằng Capacitor (vỏ native bọc bản build web `dist`).
// Cài (một lần, cần mạng):  pnpm --filter @openedu/learner add @capacitor/core @capacitor/camera @capacitor/splash-screen
//                          pnpm --filter @openedu/learner add -D @capacitor/cli @capacitor/android @capacitor/ios @capacitor/assets
// Hướng dẫn đầy đủ: apps/learner/resources/README.md
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.openedu.hocsinh',
  appName: 'OPEN-EDU',
  webDir: 'dist',
  // Bản web nằm trong app (chạy được khi mạng yếu); dữ liệu gọi Supabase qua HTTPS.
  server: { androidScheme: 'https', iosScheme: 'capacitor' },
  android: { allowMixedContent: false, captureInput: true, webContentsDebuggingEnabled: false },
  ios: { contentInset: 'automatic', limitsNavigationsToAppBoundDomains: true },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#eaf4ff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
