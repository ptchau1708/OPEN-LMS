#!/usr/bin/env node
/**
 * Sinh cấu hình bảo mật trình duyệt cho bản dựng: dist/_headers (Cloudflare Pages, Netlify) + dist/_redirects
 * và vercel.json (Vercel). Chạy tự động sau `vite build` của mỗi app.
 *
 *   node tools/make-headers.mjs [thư mục app, mặc định thư mục hiện tại]
 *
 * Chính sách (CSP) chỉ cho app nói chuyện với: chính nó, Supabase, origin nội dung HTML5, kho R2 (tải gói lên),
 * máy chủ relay (nếu có), YouTube (không cookie). Đọc địa chỉ từ biến môi trường VITE_* hoặc tệp .env ở gốc repo —
 * giống hệt cách Vite đọc. Bản demo (không có VITE_SUPABASE_URL) được nới ws:/wss: để chạy relay trong mạng lớp.
 * Thêm origin khác: CSP_EXTRA_CONNECT, CSP_EXTRA_FRAME, CSP_EXTRA_IMG (cách nhau bởi dấu cách).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function loadEnv() {
  const env = {};
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const p = resolve(ROOT, f);
    if (existsSync(p)) Object.assign(env, parseEnv(readFileSync(p, 'utf8')));
  }
  return { ...env, ...process.env };
}

const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };

/**
 * Trang học tập được "Nhúng trang web" trong bài giảng (packages/lesson-player/src/embed.ts — EMBED_FRAME_ORIGINS).
 * Hai danh sách phải giống nhau; make-headers.test.mjs kiểm tra.
 */
export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube-nocookie.com', 'https://docs.google.com', 'https://drive.google.com', 'https://quizizz.com',
  'https://wayground.com', 'https://wordwall.net', 'https://www.canva.com', 'https://padlet.com',
  'https://www.geogebra.org', 'https://scratch.mit.edu',
];

/** opts.app: tên thư mục app ('teacher' | 'learner' | 'present') — Google Classroom chỉ mở cho app giáo viên. */
export function buildCsp(env, opts = {}) {
  const supa = origin(env.VITE_SUPABASE_URL ?? '');
  const demo = !supa || env.VITE_DATA_MODE === 'demo';
  const content = origin(env.VITE_CONTENT_ORIGIN || (demo ? 'http://localhost:5180' : ''));
  const relay = origin((env.VITE_RELAY_URL ?? '').replace(/^ws/i, 'http'));
  const extra = (k) => (env[k] ?? '').split(/\s+/).filter(Boolean);
  const connect = ["'self'"];
  if (supa) connect.push(supa, supa.replace(/^http/, 'ws'), 'https://*.r2.cloudflarestorage.com');
  if (relay) connect.push(relay, relay.replace(/^http/, 'ws'));
  if (content) connect.push(content);
  // Demo không có dữ liệu thật: mở để relay / origin nội dung trong mạng lớp (http://192.168.x.x) chạy được.
  if (demo) connect.push('ws:', 'wss:', 'http:', 'https:');
  // Google Classroom (docs/CAU_NOI_VNEDU_CLASSROOM.md): chỉ app giáo viên, chỉ khi có VITE_GOOGLE_CLIENT_ID.
  const google = opts.app === 'teacher' && !!(env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
  if (google) connect.push('https://accounts.google.com', 'https://classroom.googleapis.com');
  connect.push(...extra('CSP_EXTRA_CONNECT'));
  const frame = ["'self'", 'https://www.youtube-nocookie.com', ...(content ? [content] : []), ...EMBED_FRAME_ORIGINS, ...(google ? ['https://accounts.google.com'] : []), ...(demo ? ['http:'] : []), ...extra('CSP_EXTRA_FRAME')];
  const csp = [
    "default-src 'self'",
    google ? "script-src 'self' https://accounts.google.com/gsi/client" : "script-src 'self'",
    // React đặt style nội tuyến (vị trí kéo–thả, màu theo môn) nên phải cho 'unsafe-inline' với style; script thì KHÔNG.
    google ? "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style" : "style-src 'self' 'unsafe-inline'",
    // Ảnh / âm thanh / video bài giảng do thầy cô dán link từ nhiều nơi.
    `img-src 'self' data: blob: https: ${extra('CSP_EXTRA_IMG').join(' ')}`.trim(),
    "media-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    `frame-src ${[...new Set(frame)].join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return csp.join('; ');
}

export function buildHeaders(env, opts = {}) {
  return {
    'Content-Security-Policy': buildCsp(env, opts),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    // Micro: đọc thành tiếng; camera: chụp bài làm. Còn lại tắt.
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

function main() {
  const appDir = resolve(process.argv[2] ?? process.cwd());
  const dist = resolve(appDir, 'dist');
  if (!existsSync(dist)) { console.error(`Chưa có ${dist} — chạy vite build trước.`); process.exit(1); }
  const h = buildHeaders(loadEnv(), { app: basename(appDir) });
  const lines = Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  writeFileSync(resolve(dist, '_headers'),
    `/*\n${lines}\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/sw.js\n  Cache-Control: no-cache\n\n/index.html\n  Cache-Control: no-cache\n`);
  writeFileSync(resolve(dist, '_redirects'), '/*  /index.html  200\n');
  writeFileSync(resolve(dist, 'vercel.json'), JSON.stringify({
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    headers: [
      { source: '/(.*)', headers: Object.entries(h).map(([key, value]) => ({ key, value })) },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/(sw.js|index.html)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
  }, null, 2));
  console.log(`✓ _headers, _redirects, vercel.json → ${dist}`);
  // Trên Vercel (biến VERCEL=1 có sẵn lúc build): xuất theo Build Output API để Vercel áp dụng header + điều hướng SPA
  // mà không cần vercel.json ở thư mục gốc (CSP phụ thuộc biến môi trường nên phải sinh lúc build).
  if (process.env.VERCEL || process.argv.includes('--vercel')) writeVercelOutput(appDir, dist, h);
}

/** Cấu hình Build Output API v3 — tách riêng để kiểm thử. */
export function vercelConfig(h) {
  return {
    version: 3,
    routes: [
      { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/(sw\\.js|index\\.html|manifest\\.webmanifest)', headers: { 'Cache-Control': 'no-cache' }, continue: true },
      { src: '/(.*)', headers: h, continue: true },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  };
}

function writeVercelOutput(appDir, dist, h) {
  const out = resolve(appDir, '.vercel', 'output');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(dist, resolve(out, 'static'), { recursive: true });
  writeFileSync(resolve(out, 'config.json'), JSON.stringify(vercelConfig(h), null, 2));
  console.log(`✓ Vercel Build Output → ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
