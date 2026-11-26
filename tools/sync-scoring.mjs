#!/usr/bin/env node
/**
 * Chép mã chấm điểm THUẦN của activity-engine (và các kiểu trong contracts) sang
 * supabase/functions/_shared/scoring/ để Edge Function `grade` (Deno) chấm ở server
 * bằng đúng mã mà trình duyệt dùng.
 *
 *   node tools/sync-scoring.mjs          # đồng bộ (chạy lại bao nhiêu lần cũng được)
 *   node tools/sync-scoring.mjs --check  # chỉ kiểm tra; thoát mã 1 nếu bản chép đã cũ (dùng cho CI)
 *
 * Đồng thời chép bộ máy thành thạo kĩ năng THUẦN packages/data/src/mastery/*.ts (trừ *.test.ts) sang
 * supabase/functions/_shared/mastery/ (Edge Function `grade` cập nhật skill_mastery bằng đúng mã này), và
 * mã chấm bài làm THUẦN packages/data/src/assess/*.ts sang supabase/functions/_shared/assess/ (Edge Function `ai-grade`),
 * và mã gợi ý khi làm sai THUẦN packages/data/src/hint/*.ts sang supabase/functions/_shared/hint/ (Edge Function `ai-gateway`),
 * và nền tảng LTI 1.3 THUẦN packages/data/src/lti/*.ts sang supabase/functions/_shared/lti/ (Edge Function `lti`),
 * và thông báo đẩy THUẦN packages/data/src/webpush/*.ts sang supabase/functions/_shared/webpush/ (Edge Function `push`).
 *
 * Nguồn:
 *   packages/activity-engine/src/scoring.ts, src/types/<TYPE>/score.ts, src/shared/text.ts, src/shared/shuffle.ts
 *   (+ mọi file .ts mà chúng import tương đối), packages/contracts/src/{items,subjects,mascots}.ts
 * Đích:
 *   supabase/functions/_shared/scoring/{scoring.ts, types/…, shared/…, contracts/…, contracts.ts}
 * Viết lại import:
 *   '@openedu/contracts'      → đường dẫn tương đối tới contracts.ts (file re-export được sinh ra)
 *   '@openedu/contracts/xyz'  → contracts/xyz.ts
 *   './a', '../b'             → thêm đuôi .ts (hoặc /index.ts) cho Deno
 * Không cho phép .tsx, React hay thư viện ngoài trong mã chấm điểm (báo lỗi).
 */
import { promises as fs, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(ROOT, 'packages', 'activity-engine', 'src');
const CONTRACTS = path.join(ROOT, 'packages', 'contracts', 'src');
const OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'scoring');
const MASTERY = path.join(ROOT, 'packages', 'data', 'src', 'mastery');
const MASTERY_OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'mastery');
const ASSESS = path.join(ROOT, 'packages', 'data', 'src', 'assess');
const ASSESS_OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'assess');
const HINT = path.join(ROOT, 'packages', 'data', 'src', 'hint');
const HINT_OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'hint');
const LTI = path.join(ROOT, 'packages', 'data', 'src', 'lti');
const LTI_OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'lti');
const PUSH = path.join(ROOT, 'packages', 'data', 'src', 'webpush');
const PUSH_OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'webpush');
const OUT_DIRS = [OUT, MASTERY_OUT, ASSESS_OUT, HINT_OUT, LTI_OUT, PUSH_OUT];
const CONTRACT_BASE = ['items', 'subjects', 'mascots'];
const CHECK_ONLY = process.argv.includes('--check');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const posix = (p) => p.split(path.sep).join('/');
const errors = [];
const warnings = [];

function isFile(p) {
  return existsSync(p) && statSync(p).isFile();
}

function destFor(src) {
  if (src.startsWith(ENGINE + path.sep)) return path.join(OUT, path.relative(ENGINE, src));
  if (src.startsWith(CONTRACTS + path.sep)) return path.join(OUT, 'contracts', path.relative(CONTRACTS, src));
  if (src.startsWith(MASTERY + path.sep)) return path.join(MASTERY_OUT, path.relative(MASTERY, src));
  if (src.startsWith(ASSESS + path.sep)) return path.join(ASSESS_OUT, path.relative(ASSESS, src));
  if (src.startsWith(HINT + path.sep)) return path.join(HINT_OUT, path.relative(HINT, src));
  if (src.startsWith(LTI + path.sep)) return path.join(LTI_OUT, path.relative(LTI, src));
  if (src.startsWith(PUSH + path.sep)) return path.join(PUSH_OUT, path.relative(PUSH, src));
  return null;
}

function relImport(fromDest, toDest) {
  let r = posix(path.relative(path.dirname(fromDest), toDest));
  if (!r.startsWith('.')) r = './' + r;
  return r;
}

/** Tìm file .ts cho một import tương đối. */
function resolveRelative(fromSrc, spec) {
  const base = path.resolve(path.dirname(fromSrc), spec);
  const candidates = [base, base + '.ts', path.join(base, 'index.ts')];
  if (base.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts');
  for (const c of candidates) {
    if (c.endsWith('.ts') && isFile(c)) return c;
  }
  for (const c of [base + '.tsx', path.join(base, 'index.tsx'), base]) {
    if (c.endsWith('.tsx') && isFile(c)) return { tsx: c };
  }
  return null;
}

/** Các tên được export ở cấp trên cùng của một file contracts (regex đơn giản, đủ cho mã của dự án). */
function exportedNames(code) {
  const names = new Set();
  const re = /export\s+(?:declare\s+)?(?:type|interface|const|let|function|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(code))) names.add(m[1]);
  return names;
}

const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g;
const NAMED_CONTRACT_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@openedu\/contracts['"]/g;

async function main() {
  // 1) Điểm vào
  const entries = [];
  const scoringTs = path.join(ENGINE, 'scoring.ts');
  if (!isFile(scoringTs)) {
    console.error(`Không thấy ${rel(scoringTs)}.`);
    process.exit(1);
  }
  entries.push(scoringTs);
  const typesDir = path.join(ENGINE, 'types');
  if (existsSync(typesDir)) {
    for (const t of (await fs.readdir(typesDir)).sort()) {
      const f = path.join(typesDir, t, 'score.ts');
      if (isFile(f)) entries.push(f);
    }
  }
  for (const f of ['text.ts', 'shuffle.ts']) {
    const p = path.join(ENGINE, 'shared', f);
    if (isFile(p)) entries.push(p);
  }
  for (const dir of [MASTERY, ASSESS, HINT, LTI, PUSH]) {
    if (!existsSync(dir)) continue;
    for (const f of (await fs.readdir(dir)).sort()) {
      if (f.endsWith('.ts') && !f.endsWith('.test.ts')) entries.push(path.join(dir, f));
    }
  }

  // Kiểu/hằng của contracts: 3 file cơ bản + file khác nếu mã chấm điểm cần tên ở đó.
  const contractFiles = new Map(); // tên file (không đuôi) → mã nguồn
  for (const f of (await fs.readdir(CONTRACTS)).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    contractFiles.set(f.slice(0, -3), await fs.readFile(path.join(CONTRACTS, f), 'utf8'));
  }
  const reexport = new Set(CONTRACT_BASE.filter((n) => contractFiles.has(n)));
  for (const n of CONTRACT_BASE) {
    if (!contractFiles.has(n)) warnings.push(`thiếu packages/contracts/src/${n}.ts`);
    else entries.push(path.join(CONTRACTS, n + '.ts'));
  }

  // 2) Duyệt phụ thuộc, sinh nội dung
  const outputs = new Map(); // dest → content
  const queue = [...entries];
  const seen = new Set();
  const neededContractNames = new Set();
  const contractsIndex = path.join(OUT, 'contracts.ts');

  while (queue.length) {
    const src = queue.shift();
    if (seen.has(src)) continue;
    seen.add(src);
    const dest = destFor(src);
    if (!dest) {
      errors.push(`${rel(src)} nằm ngoài activity-engine/contracts/data/mastery/data/assess`);
      continue;
    }
    let code = await fs.readFile(src, 'utf8');

    let m;
    NAMED_CONTRACT_IMPORT_RE.lastIndex = 0;
    while ((m = NAMED_CONTRACT_IMPORT_RE.exec(code))) {
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (name) neededContractNames.add(name);
      }
    }

    code = code.replace(IMPORT_RE, (full, lead, q, spec) => {
      if (spec === '@openedu/contracts') return `${lead}${q}${relImport(dest, contractsIndex)}${q}`;
      if (spec.startsWith('@openedu/contracts/')) {
        const name = spec.slice('@openedu/contracts/'.length).replace(/\.ts$/, '');
        const csrc = path.join(CONTRACTS, name + '.ts');
        if (!isFile(csrc)) {
          errors.push(`${rel(src)}: không thấy ${spec}`);
          return full;
        }
        queue.push(csrc);
        return `${lead}${q}${relImport(dest, destFor(csrc))}${q}`;
      }
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const r = resolveRelative(src, spec);
        if (!r) {
          errors.push(`${rel(src)}: không tìm thấy import "${spec}"`);
          return full;
        }
        if (typeof r === 'object') {
          errors.push(`${rel(src)}: import "${spec}" là .tsx — mã chấm điểm phải thuần (không React/DOM)`);
          return full;
        }
        if (![ENGINE, CONTRACTS, MASTERY, ASSESS, HINT, LTI, PUSH].some((d) => r.startsWith(d + path.sep))) {
          errors.push(`${rel(src)}: import "${spec}" ra ngoài gói`);
          return full;
        }
        queue.push(r);
        return `${lead}${q}${relImport(dest, destFor(r))}${q}`;
      }
      if (spec.startsWith('npm:') || spec.startsWith('jsr:') || spec.startsWith('https://')) return full;
      errors.push(`${rel(src)}: import thư viện ngoài "${spec}" — không chép sang Deno được`);
      return full;
    });

    const header = `// GENERATED by tools/sync-scoring.mjs từ ${rel(src)} — KHÔNG sửa tay, sửa file gốc rồi chạy lại.\n`;
    outputs.set(dest, header + code);
  }

  // 3) contracts.ts: re-export 3 file cơ bản + file nào chứa tên mà mã chấm điểm cần
  const available = new Set();
  for (const n of reexport) for (const x of exportedNames(contractFiles.get(n))) available.add(x);
  for (const name of [...neededContractNames].sort()) {
    if (available.has(name)) continue;
    const owner = [...contractFiles.keys()].find((n) => exportedNames(contractFiles.get(n)).has(name));
    if (!owner) {
      errors.push(`tên "${name}" import từ @openedu/contracts không có trong packages/contracts/src`);
      continue;
    }
    reexport.add(owner);
    for (const x of exportedNames(contractFiles.get(owner))) available.add(x);
    const csrc = path.join(CONTRACTS, owner + '.ts');
    if (!seen.has(csrc)) {
      // chép thêm file contracts này (và phụ thuộc của nó) ở vòng sau
      queue.push(csrc);
    }
  }
  // Chép các file contracts vừa bổ sung (nếu có)
  while (queue.length) {
    const src = queue.shift();
    if (seen.has(src)) continue;
    seen.add(src);
    const dest = destFor(src);
    let code = await fs.readFile(src, 'utf8');
    code = code.replace(IMPORT_RE, (full, lead, q, spec) => {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const r = resolveRelative(src, spec);
        if (!r || typeof r === 'object') {
          errors.push(`${rel(src)}: không xử lý được import "${spec}"`);
          return full;
        }
        queue.push(r);
        return `${lead}${q}${relImport(dest, destFor(r))}${q}`;
      }
      errors.push(`${rel(src)}: import ngoài "${spec}"`);
      return full;
    });
    outputs.set(dest, `// GENERATED by tools/sync-scoring.mjs từ ${rel(src)} — KHÔNG sửa tay.\n` + code);
  }

  const indexLines = [
    '// GENERATED by tools/sync-scoring.mjs — thay cho "@openedu/contracts" trong Deno. KHÔNG sửa tay.',
    ...[...reexport].sort().map((n) => `export * from './contracts/${n}.ts';`),
    '',
  ];
  outputs.set(contractsIndex, indexLines.join('\n'));

  if (errors.length) {
    console.error('sync-scoring: LỖI');
    for (const e of errors) console.error('  ✗ ' + e);
    process.exit(1);
  }

  // 4) Ghi (chỉ khi khác) + xóa file cũ không còn nguồn
  const existing = [];
  async function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else existing.push(p);
    }
  }
  for (const d of OUT_DIRS) await walk(d);

  const changes = { written: [], unchanged: [], removed: [] };
  for (const [dest, content] of [...outputs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const old = isFile(dest) ? await fs.readFile(dest, 'utf8') : null;
    if (old === content) {
      changes.unchanged.push(dest);
      continue;
    }
    changes.written.push(dest);
    if (!CHECK_ONLY) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content);
    }
  }
  for (const p of existing) {
    if (!outputs.has(p)) {
      changes.removed.push(p);
      if (!CHECK_ONLY) await fs.rm(p);
    }
  }
  if (!CHECK_ONLY) {
    // dọn thư mục rỗng
    async function prune(dir) {
      if (!existsSync(dir)) return;
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await prune(path.join(dir, e.name));
      }
      if (!OUT_DIRS.includes(dir) && (await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
    }
    for (const d of OUT_DIRS) await prune(d);
  }

  for (const w of warnings) console.warn('  ! ' + w);
  const verb = CHECK_ONLY ? 'cần ghi' : 'đã ghi';
  for (const p of changes.written) console.log(`  ${verb}   ${rel(p)}`);
  for (const p of changes.removed) console.log(`  ${CHECK_ONLY ? 'cần xóa' : 'đã xóa'}   ${rel(p)}`);
  console.log(
    `sync-scoring: ${outputs.size} file → ${rel(OUT)}, ${rel(MASTERY_OUT)}, ${rel(ASSESS_OUT)}, ${rel(HINT_OUT)}, ${rel(LTI_OUT)}, ${rel(PUSH_OUT)} ` +
      `(${changes.written.length} ${verb}, ${changes.unchanged.length} không đổi, ${changes.removed.length} ${CHECK_ONLY ? 'cần xóa' : 'đã xóa'})`,
  );
  if (CHECK_ONLY && (changes.written.length || changes.removed.length)) {
    console.error('Bản chép đã cũ — chạy: node tools/sync-scoring.mjs');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
