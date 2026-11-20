import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '../..',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'OPEN-EDU Góc học tập',
        short_name: 'OPEN-EDU',
        description: 'Góc học tập cho học sinh tiểu học',
        lang: 'vi',
        theme_color: '#2f7bf6',
        background_color: '#eaf4ff',
        display: 'standalone',
        orientation: 'any',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      // oe-sw-offline.js (public/): ảnh/âm thanh bài đã tải về + Background Sync hàng đợi (docs/PHASE6_OFFLINE.md).
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: 'index.html', importScripts: ['oe-sw-offline.js'] },
    }),
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: { target: ['chrome87', 'safari14'], chunkSizeWarningLimit: 400 },
});
