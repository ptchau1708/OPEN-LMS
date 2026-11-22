#!/usr/bin/env node
/** Build 3 app ở chế độ demo (bỏ qua .env.local trỏ Supabase thật) rồi chạy Playwright. Tham số chuyển tiếp cho `playwright test`. */
import { spawnSync } from 'node:child_process';
const env = { ...process.env, VITE_DATA_MODE: 'demo', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '',
  // Đăng nhập chung: hai app chuyển phiên cho nhau theo đúng cổng của Playwright.
  VITE_LEARNER_URL: 'http://localhost:4611', VITE_TEACHER_URL: 'http://localhost:4612', VITE_PRESENT_URL: 'http://localhost:4613/' };
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' }); if (r.status !== 0) process.exit(r.status ?? 1); };
if (!process.argv.includes('--no-build')) run('pnpm', ['-r', '--filter', './apps/*', 'build']);
run('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2).filter((a) => a !== '--no-build')]);
