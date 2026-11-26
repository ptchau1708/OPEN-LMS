import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '../..',
  plugins: [
    react(),
    // Cài lên điện thoại / máy tính như một app (Màn hình chính) + nhận thông báo đẩy (oe-sw-push.js, SQL 23).
    // Chỉ lưu sẵn trang chính + icon (nhẹ); mã JS tải qua mạng như bình thường (app giáo viên cần mạng).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192.png'],
      manifest: {
        name: 'OPEN-EDU Giáo viên',
        short_name: 'OE Giáo viên',
        description: 'Bàn làm việc của giáo viên tiểu học',
        lang: 'vi',
        theme_color: '#4f46e5',
        background_color: '#f5f6fb',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['index.html', '*.{svg,png}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/(api|functions)\//],
        importScripts: ['oe-sw-push.js'],
      },
    }),
  ],
  server: { port: 5174, host: true },
  preview: { port: 4174, host: true },
  build: { target: ['chrome87', 'safari14'] },
});
