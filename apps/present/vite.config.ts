import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: { port: 5175, host: true },
  preview: { port: 4175, host: true },
  build: { target: ['chrome87', 'safari14'] },
});
