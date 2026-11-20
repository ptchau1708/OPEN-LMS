import { defineConfig } from '@playwright/test';

/**
 * Kiểm thử giao diện đầu–cuối ở chế độ demo (không cần Supabase).
 * Chạy: `pnpm e2e` (tools/e2e.mjs build bản demo rồi gọi Playwright). Trong CI: job "e2e".
 */
const preview = (app: string, port: number) => ({
  command: `pnpm --filter @openedu/${app} exec vite preview --port ${port} --strictPort`,
  url: `http://localhost:${port}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
});

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', serviceWorkers: 'block', trace: 'retain-on-failure', viewport: { width: 1366, height: 900 } },
  webServer: [preview('learner', 4611), preview('teacher', 4612), preview('present', 4613)],
});
