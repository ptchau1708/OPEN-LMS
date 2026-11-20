import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCsp, EMBED_FRAME_ORIGINS, parseEnv, vercelConfig } from './make-headers.mjs';

test('CSP bản chạy thật chỉ mở cho Supabase, origin nội dung, R2', () => {
  const csp = buildCsp({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_CONTENT_ORIGIN: 'https://nd.truong.edu.vn/' });
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co https:\/\/\*\.r2\.cloudflarestorage\.com https:\/\/nd\.truong\.edu\.vn;/);
  assert.match(csp, /frame-src 'self' https:\/\/www\.youtube-nocookie\.com https:\/\/nd\.truong\.edu\.vn https:\/\/docs\.google\.com [^;]*https:\/\/scratch\.mit\.edu;/);
  assert.doesNotMatch(csp, /accounts\.google\.com|classroom\.googleapis/);
  assert.doesNotMatch(csp, /connect-src[^;]* (ws:|http:|https:)(;| )/);
  assert.doesNotMatch(csp, /unsafe-eval/);
});
test('bản demo được nới để chạy relay trong mạng lớp', () => {
  assert.match(buildCsp({}), /connect-src [^;]*ws: wss: http: https:/);
});
test('parseEnv bỏ chú thích và dấu nháy', () => {
  assert.deepEqual(parseEnv('# a\nVITE_X="1"\nVITE_Y=abc\n'), { VITE_X: '1', VITE_Y: 'abc' });
});
test('Google Classroom chỉ mở cho app giáo viên khi có VITE_GOOGLE_CLIENT_ID', () => {
  const env = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com' };
  const t = buildCsp(env, { app: 'teacher' });
  assert.match(t, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client;/);
  assert.match(t, /connect-src [^;]*https:\/\/accounts\.google\.com https:\/\/classroom\.googleapis\.com/);
  assert.match(t, /frame-src [^;]*https:\/\/accounts\.google\.com/);
  assert.doesNotMatch(buildCsp(env, { app: 'learner' }), /accounts\.google\.com/);
  assert.doesNotMatch(buildCsp({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }, { app: 'teacher' }), /accounts\.google\.com/);
});
test('danh sách nhúng trùng với lesson-player/embed.ts', () => {
  const src = readFileSync(new URL('../packages/lesson-player/src/embed.ts', import.meta.url), 'utf8');
  const block = /EMBED_FRAME_ORIGINS = \[([\s\S]*?)\]/.exec(src)[1];
  assert.deepEqual([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]), EMBED_FRAME_ORIGINS);
});

test('Vercel: header áp cho mọi đường dẫn, tệp tĩnh trước, còn lại về index.html', () => {
  const c = vercelConfig({ 'X-Frame-Options': 'DENY' });
  assert.equal(c.version, 3);
  const i = c.routes.findIndex((r) => r.handle === 'filesystem');
  assert.ok(i > 0);
  assert.deepEqual(c.routes[i + 1], { src: '/(.*)', dest: '/index.html' });
  assert.ok(c.routes.slice(0, i).every((r) => r.continue === true));
  assert.ok(new RegExp(`^${c.routes[1].src}$`).test('/sw.js'));
});
