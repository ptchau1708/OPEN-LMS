// Hàm thuần cho run.mjs (không I/O) — có kiểm thử ở test/lib.test.mjs.

export const STEPS = [
  '00_prepare.sql', '01_people.sql', '02_classes.sql', '03_items.sql', '04_lessons.sql', '05_rewards.sql',
  '06_history.sql', '91_reconcile.sql',
];

export const RECONCILE_COLUMNS = ['hạng_mục', 'cũ', 'bỏ_qua', 'mới', 'lệch', 'trạng_thái', 'ghi_chú'];

export function parseArgs(argv) {
  const o = { dryRun: false, db: null, only: null, out: null, cleanup: false, allowDiff: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') o.dryRun = true;
    else if (a === '--cleanup') o.cleanup = true;
    else if (a === '--allow-diff') o.allowDiff = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--db') o.db = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Tham số lạ: ${a}`);
  }
  if (o.dryRun && o.cleanup) throw new Error('--cleanup không dùng cùng --dry-run');
  return o;
}

/** Chọn bước: --only 03,06 → các file bắt đầu bằng 03_, 06_. Luôn kèm 00_prepare và 91_reconcile. */
export function selectSteps(only) {
  if (!only) return [...STEPS];
  const want = new Set(['00', '91', ...only.map((s) => s.slice(0, 2))]);
  return STEPS.filter((f) => want.has(f.slice(0, 2)));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Kịch bản psql. dryRun: mọi bước trong MỘT giao dịch rồi ROLLBACK (không ghi gì).
 * Chạy thật: mỗi bước một giao dịch — bước lỗi tự hoàn tác, các bước trước đã COMMIT (chạy lại được).
 */
export function buildDriver(files, { dir, dryRun, cleanup = false }) {
  const L = ['\\set ON_ERROR_STOP on', '\\pset pager off', "set client_min_messages = warning;"];
  if (dryRun) L.push('begin;');
  for (const f of files) {
    L.push(`\\echo @@STEP ${f}`);
    if (!dryRun) L.push('begin;');
    L.push(`\\i ${q(`${dir}/${f}`)}`);
    if (!dryRun) L.push('commit;');
    L.push(`\\echo @@DONE ${f}`);
  }
  L.push('\\pset format csv', '\\echo @@CSV',
    `select ${RECONCILE_COLUMNS.join(', ')} from v1etl.reconcile order by ord;`, '\\echo @@ENDCSV', '\\pset format aligned');
  if (dryRun) L.push('rollback;');
  if (cleanup) { L.push('\\echo @@STEP 99_cleanup.sql', `\\i ${q(`${dir}/99_cleanup.sql`)}`, '\\echo @@DONE 99_cleanup.sql'); }
  return L.join('\n') + '\n';
}

const TAG = /^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|MERGE \d+|SELECT \d+|CREATE [A-Z ]+|DROP [A-Z ]+|ALTER [A-Z ]+|COMMENT|DO|BEGIN|COMMIT|ROLLBACK|SET|GRANT|REVOKE|TRUNCATE [A-Z]*)$/;

/** Số dòng của một command tag ("INSERT 0 12" → 12, "UPDATE 3" → 3), không phải DML → null. */
export function tagRows(tag) {
  const m = /^(INSERT) \d+ (\d+)$|^(UPDATE|DELETE|MERGE) (\d+)$/.exec(tag);
  if (!m) return null;
  return Number(m[2] ?? m[4]);
}

export function summarizeTags(tags) {
  const s = { insert: 0, update: 0, delete: 0, statements: tags.length };
  for (const t of tags) {
    const n = tagRows(t);
    if (n == null) continue;
    if (t.startsWith('INSERT')) s.insert += n; else if (t.startsWith('UPDATE') || t.startsWith('MERGE')) s.update += n; else s.delete += n;
  }
  return s;
}

/** Tách stdout của psql theo dấu @@STEP/@@DONE, gom command tag từng bước và khối CSV đối soát. */
export function parseOutput(text) {
  const steps = []; let cur = null; let csv = null; let inCsv = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('@@STEP ')) { cur = { file: line.slice(7), tags: [], done: false }; steps.push(cur); continue; }
    if (line.startsWith('@@DONE ')) { if (cur) cur.done = true; cur = null; continue; }
    if (line === '@@CSV') { inCsv = true; csv = []; continue; }
    if (line === '@@ENDCSV') { inCsv = false; continue; }
    if (inCsv) { csv.push(raw); continue; }
    if (cur && TAG.test(line.trim())) cur.tags.push(line.trim());
  }
  return { steps, csv: csv ? csv.join('\n') : null };
}

/** CSV tối giản theo RFC 4180 (đủ cho đầu ra psql --csv). */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let i = 0; let quoted = false;
  const s = text ?? '';
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some((x) => x !== '') || row.length > 1) rows.push(row); row = []; i++; continue;
    }
    f += c; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  if (!rows.length) return [];
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ''])));
}

export function toCsv(rows, cols = RECONCILE_COLUMNS) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export function toMarkdown(rows, { title = 'Đối soát dữ liệu OpenLMS → OPEN-EDU', meta = [] } = {}) {
  const head = ['Hạng mục', 'Cũ', 'Bỏ qua', 'Mới', 'Lệch', 'Trạng thái', 'Ghi chú'];
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const lines = [`# ${title}`, '', ...meta.map((m) => `- ${m}`), meta.length ? '' : null,
    `| ${head.join(' | ')} |`, '|---|---:|---:|---:|---:|---|---|',
    ...rows.map((r) => `| ${RECONCILE_COLUMNS.map((c) => cell(c === 'trạng_thái' && r[c] !== 'OK' ? `**${r[c]}**` : r[c])).join(' | ')} |`)];
  const bad = rows.filter((r) => r['trạng_thái'] !== 'OK');
  lines.push('', bad.length ? `**${bad.length} hạng mục lệch** — xem 90_verify.sql và \`select * from v1etl.history_rejects\`.` : 'Tất cả hạng mục khớp.');
  return lines.filter((l) => l !== null).join('\n') + '\n';
}

export function diffRows(rows) {
  return rows.filter((r) => r['trạng_thái'] !== 'OK');
}

/** '2026-11-13T02:00:00.000Z' → '20261113-020000' (tên tệp báo cáo). */
export function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}
