/**
 * Ma trận đề (thuần): mức của câu hỏi, dạng TN/TL, hàng mặc định từ danh mục kĩ năng, tổng điểm, sinh đề A/B,
 * câu thay thế cho một ô. Không đọc kho — nhận ngân hàng câu hỏi và danh sách câu đã dùng gần đây.
 */
import {
  EXAM_LEVEL_LABEL,
  EXAM_LEVELS,
  EXAM_QTYPE_LABEL,
  SKILL_BY_CODE,
  cellKey,
  skillsFor,
  type ExamLevel,
  type ExamMatrix,
  type ExamPaper,
  type ExamQType,
  type ExamShortfall,
  type ExamSlot,
  type GenerateResult,
  type Grade,
  type Item,
  type ItemType,
  type MatrixRow,
  type SubjectId,
} from '@openedu/contracts';
import { hashString, seededOrder } from './shuffle';

/** Dạng không chấm tự động — không đưa vào đề. */
export const EXAM_EXCLUDED_TYPES: ItemType[] = ['DRAW', 'RECORD_READ', 'POLL'];
/** Dạng tự luận ngắn (HS gõ). Còn lại là trắc nghiệm. */
export const EXAM_TL_TYPES: ItemType[] = ['SHORT_ANSWER', 'FILL_IN_PASSAGE'];

const DIFF_LEVEL: Record<NonNullable<Item['difficulty']>, ExamLevel> = { 'nhan-biet': 1, 'ket-noi': 2, 'van-dung': 3 };

/**
 * Mức của câu: thẻ `muc:1|2|3` (GV gắn tay, ưu tiên) → `difficulty` → Mức 1 (ước lượng).
 * `inferred` = true khi không có cả hai.
 */
export function itemLevel(item: Pick<Item, 'difficulty' | 'tags'>): { level: ExamLevel; inferred: boolean } {
  for (const t of item.tags ?? []) {
    const m = /^m[uứ]c:([123])$/i.exec(t.trim());
    if (m) return { level: Number(m[1]) as ExamLevel, inferred: false };
  }
  if (item.difficulty && DIFF_LEVEL[item.difficulty]) return { level: DIFF_LEVEL[item.difficulty], inferred: false };
  return { level: 1, inferred: true };
}

/** Gắn mức bằng thẻ (thay thẻ `muc:` cũ). */
export function withLevelTag<T extends Pick<Item, 'tags'>>(item: T, level: ExamLevel): T {
  return { ...item, tags: [...(item.tags ?? []).filter((t) => !/^m[uứ]c:/i.test(t)), `muc:${level}`] };
}

export function itemQType(item: Pick<Item, 'type' | 'payload'>): ExamQType | null {
  if (EXAM_EXCLUDED_TYPES.includes(item.type)) return null;
  if (item.type === 'FILL_IN_PASSAGE') return (item.payload as { bank?: unknown[] }).bank?.length ? 'tn' : 'tl';
  return EXAM_TL_TYPES.includes(item.type) ? 'tl' : 'tn';
}

/** Hàng mặc định: gom kĩ năng của môn/lớp theo nội dung (topic); kĩ năng tạm → mỗi kĩ năng một hàng. */
export function defaultRows(subject: SubjectId, grade: Grade): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const byTopic = new Map<string, MatrixRow>();
  for (const s of skillsFor(subject, grade)) {
    if (s.provisional) {
      rows.push({ id: s.code, label: s.short, skills: [s.code] });
      continue;
    }
    const topicKey = s.code.split('.')[1] ?? s.topic;
    let r = byTopic.get(topicKey);
    if (!r) {
      r = { id: topicKey, label: s.topic, skills: [] };
      byTopic.set(topicKey, r);
      rows.push(r);
    }
    r.skills.push(s.code);
  }
  return rows;
}

export interface MatrixTotals {
  questions: number;
  tn: number;
  tl: number;
  points: number;
  byLevel: Record<ExamLevel, { questions: number; points: number }>;
  byRow: Record<string, { questions: number; points: number }>;
}

export function matrixTotals(m: Pick<ExamMatrix, 'rows' | 'cells'>): MatrixTotals {
  const t: MatrixTotals = { questions: 0, tn: 0, tl: 0, points: 0, byLevel: { 1: { questions: 0, points: 0 }, 2: { questions: 0, points: 0 }, 3: { questions: 0, points: 0 } }, byRow: {} };
  for (const r of m.rows) {
    const row = (t.byRow[r.id] = { questions: 0, points: 0 });
    for (const l of EXAM_LEVELS) {
      const c = m.cells[cellKey(r.id, l)];
      if (!c) continue;
      const q = Math.max(0, c.tn | 0) + Math.max(0, c.tl | 0);
      const p = q * Math.max(0, c.points || 0);
      t.questions += q;
      t.tn += Math.max(0, c.tn | 0);
      t.tl += Math.max(0, c.tl | 0);
      t.points += p;
      t.byLevel[l].questions += q;
      t.byLevel[l].points += p;
      row.questions += q;
      row.points += p;
    }
  }
  t.points = Math.round(t.points * 100) / 100;
  return t;
}

/** Lỗi cấu hình ma trận (rỗng = dùng được). */
export function validateMatrix(m: ExamMatrix): string[] {
  const out: string[] = [];
  if (!m.title.trim()) out.push('Đặt tên cho ma trận.');
  if (!m.rows.length) out.push('Thêm ít nhất một mạch kiến thức.');
  for (const r of m.rows) if (!r.skills.length) out.push(`Mạch “${r.label}” chưa chọn kĩ năng nào.`);
  const t = matrixTotals(m);
  if (!t.questions) out.push('Ma trận chưa có câu nào.');
  if (t.questions > 60) out.push('Đề tối đa 60 câu.');
  for (const [k, c] of Object.entries(m.cells)) if ((c.tn || c.tl) && !(c.points > 0)) out.push(`Ô ${k} chưa có điểm mỗi câu.`);
  return out;
}

/** Câu khớp hàng (có ít nhất 1 kĩ năng trùng), mức, dạng, môn, lớp. */
export function itemMatches(item: Item, m: Pick<ExamMatrix, 'subject' | 'grade'>, row: MatrixRow, level: ExamLevel, qtype: ExamQType): boolean {
  if (item.subject !== m.subject || item.grade !== m.grade) return false;
  if (itemQType(item) !== qtype || itemLevel(item).level !== level) return false;
  return (item.skills ?? []).some((s) => row.skills.includes(s));
}

export interface RankOptions {
  seed: number;
  /** itemId → số lần dùng trong đề gần đây (60 ngày). */
  recent?: Record<string, number>;
}

/** Xếp ứng viên: chưa dùng gần đây trước, khớp kĩ năng chính trước, rồi ngẫu nhiên theo seed. */
export function rankCandidates(cands: Item[], row: MatrixRow, opts: RankOptions): Item[] {
  const recent = opts.recent ?? {};
  const shuffled = seededOrder(cands, opts.seed ^ hashString(row.id));
  const pos = new Map(shuffled.map((it, i) => [it.id, i]));
  return shuffled.slice().sort((a, b) => {
    const ra = recent[a.id] ?? 0;
    const rb = recent[b.id] ?? 0;
    if (ra !== rb) return ra - rb;
    const pa = row.skills.includes(a.skills?.[0] ?? '') ? 0 : 1;
    const pb = row.skills.includes(b.skills?.[0] ?? '') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0);
  });
}

export function shortfallMessage(missing: number, level: ExamLevel, rowLabel: string, qtype: ExamQType): string {
  return `Thiếu ${missing} câu ${EXAM_LEVEL_LABEL[level]} – ${rowLabel} (${EXAM_QTYPE_LABEL[qtype]})`;
}

/**
 * Sinh đề A và B. Đề A: mỗi ô lấy câu tốt nhất chưa dùng trong đề; thiếu → slot itemId null + báo "Thiếu …".
 * Đề B: cùng ô, ưu tiên câu KHÔNG có trong đề A; không đủ thì dùng lại câu của đề A (báo reusedInB).
 * Thứ tự trên đề: phần trắc nghiệm trước, tự luận sau; trong mỗi phần theo hàng rồi mức.
 */
export function generatePaper(m: ExamMatrix, bank: Item[], opts: RankOptions): GenerateResult {
  const usable = bank.filter((it) => itemQType(it) !== null);
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const shortfalls: ExamShortfall[] = [];
  const groups: { qtype: ExamQType; a: ExamSlot[]; b: ExamSlot[] }[] = [
    { qtype: 'tn', a: [], b: [] },
    { qtype: 'tl', a: [], b: [] },
  ];
  // Hai lượt: chọn A cho mọi ô trước, rồi B (để B tránh mọi câu của A, kể cả ở ô sau).
  type Plan = { row: MatrixRow; level: ExamLevel; qtype: ExamQType; n: number; points: number; ranked: Item[]; a: Item[] };
  const plans: Plan[] = [];
  for (const row of m.rows) {
    for (const level of EXAM_LEVELS) {
      const cell = m.cells[cellKey(row.id, level)];
      if (!cell) continue;
      for (const g of groups) {
        const n = Math.max(0, (g.qtype === 'tn' ? cell.tn : cell.tl) | 0);
        if (!n) continue;
        const ranked = rankCandidates(usable.filter((it) => itemMatches(it, m, row, level, g.qtype)), row, opts);
        const a = ranked.filter((it) => !usedA.has(it.id)).slice(0, n);
        a.forEach((it) => usedA.add(it.id));
        plans.push({ row, level, qtype: g.qtype, n, points: cell.points, ranked, a });
      }
    }
  }
  for (const p of plans) {
    const fresh = p.ranked.filter((it) => !usedA.has(it.id) && !usedB.has(it.id)).slice(0, p.n);
    fresh.forEach((it) => usedB.add(it.id));
    const g = groups.find((x) => x.qtype === p.qtype)!;
    let reused = 0;
    for (let i = 0; i < p.n; i++) {
      const id = `${p.row.id}:${p.level}:${p.qtype}:${i + 1}`;
      const aId = p.a[i]?.id ?? null;
      let bId = fresh[i]?.id ?? null;
      if (!bId && aId) {
        bId = aId;
        reused++;
      }
      const base = { rowId: p.row.id, level: p.level, qtype: p.qtype, points: p.points, no: 0 };
      g.a.push({ ...base, id, itemId: aId });
      g.b.push({ ...base, id, itemId: bId });
    }
    const missing = p.n - p.a.length;
    if (missing > 0 || reused > 0) {
      shortfalls.push({
        rowId: p.row.id,
        rowLabel: p.row.label,
        level: p.level,
        qtype: p.qtype,
        missing,
        reusedInB: reused,
        message: missing > 0 ? shortfallMessage(missing, p.level, p.row.label, p.qtype) : `Đề B dùng lại ${reused} câu của đề A ở ${EXAM_LEVEL_LABEL[p.level]} – ${p.row.label}`,
      });
    }
  }
  const number = (list: ExamSlot[]) => list.map((s, i) => ({ ...s, no: i + 1 }));
  const paper: ExamPaper = { A: number([...groups[0].a, ...groups[1].a]), B: number([...groups[0].b, ...groups[1].b]) };
  return { paper, shortfalls };
}

/** Câu thay được cho một ô (đã loại `exclude`), xếp như khi sinh đề. */
export function slotCandidates(m: ExamMatrix, bank: Item[], slot: Pick<ExamSlot, 'rowId' | 'level' | 'qtype'>, exclude: string[], opts: RankOptions): Item[] {
  const row = m.rows.find((r) => r.id === slot.rowId);
  if (!row) return [];
  return rankCandidates(bank.filter((it) => !exclude.includes(it.id) && itemMatches(it, m, row, slot.level, slot.qtype)), row, opts);
}

/** Thay câu ở một slot (trả về đề mới). */
export function swapSlot(paper: ExamPaper, variant: keyof ExamPaper, slotId: string, itemId: string | null): ExamPaper {
  return { ...paper, [variant]: paper[variant].map((s) => (s.id === slotId ? { ...s, itemId } : s)) };
}

/** Thiếu còn lại sau khi GV thay tay (slot null) — để chặn xuất bản. */
export function openSlots(paper: ExamPaper): { variant: keyof ExamPaper; slot: ExamSlot }[] {
  return (['A', 'B'] as const).flatMap((v) => paper[v].filter((s) => !s.itemId).map((slot) => ({ variant: v, slot })));
}

export function paperPoints(slots: ExamSlot[]): number {
  return Math.round(slots.reduce((a, s) => a + s.points, 0) * 100) / 100;
}

/** Tên kĩ năng ngắn (cho bảng ma trận). */
export function skillLabel(code: string): string {
  return SKILL_BY_CODE[code]?.short ?? code;
}
