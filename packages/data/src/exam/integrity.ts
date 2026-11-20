/**
 * Chống gian lận nhẹ (thuần): gom sự kiện rời màn hình / thoát toàn màn hình / chặn dán / mở trùng + câu trả lời quá
 * nhanh thành câu mô tả TRUNG TÍNH cho GV. Không bao giờ trừ điểm — GV tự xem và trò chuyện với em.
 */
import type { ExamAnswer, IntegrityEvent, IntegritySummary } from '@openedu/contracts';

/** Câu trả lời dưới 3 giây coi là "rất nhanh". */
export const FAST_ANSWER_MS = 3000;
/** Chỉ ghi chú khi có ít nhất ngần này câu rất nhanh. */
export const FAST_ANSWER_MIN = 3;
/** Giới hạn sự kiện lưu mỗi lần làm (chống spam). */
export const MAX_INTEGRITY_EVENTS = 300;

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}

export interface SummarizeInput {
  events: IntegrityEvent[];
  answers: Record<string, ExamAnswer | undefined>;
  startedAt?: string;
  submittedAt?: string | null;
  durationMin?: number;
  /** Tỉ lệ đúng 0..1 (khi đã chấm). */
  correctRatio?: number;
}

export function summarizeIntegrity(input: SummarizeInput): IntegritySummary {
  const ev = input.events ?? [];
  const count = (k: IntegrityEvent['kind']) => ev.filter((e) => e.kind === k).length;
  const leavesEv = ev.filter((e) => e.kind === 'hidden' || e.kind === 'blur');
  const awayMs = leavesEv.reduce((a, e) => a + (typeof e.awayMs === 'number' && e.awayMs > 0 ? Math.min(e.awayMs, 3_600_000) : 0), 0);
  const answered = Object.values(input.answers ?? {}).filter((a): a is ExamAnswer => !!a && a.response !== undefined && a.response !== null);
  const fastAnswers = answered.filter((a) => a.ms > 0 && a.ms < FAST_ANSWER_MS).length;
  let veryFastFinish = false;
  let usedMs = 0;
  if (input.startedAt && input.submittedAt && input.durationMin) {
    usedMs = Date.parse(input.submittedAt) - Date.parse(input.startedAt);
    veryFastFinish = usedMs > 0 && usedMs < input.durationMin * 60_000 * 0.25 && (input.correctRatio ?? 0) >= 0.9 && answered.length >= 5;
  }
  const s: IntegritySummary = {
    leaves: leavesEv.length,
    awayMs,
    fullscreenExits: count('fullscreen-exit'),
    pasteBlocked: count('paste-blocked'),
    duplicateSessions: count('duplicate-session'),
    resumes: count('resume'),
    fastAnswers,
    veryFastFinish,
    lines: [],
    timeline: ev.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
  };
  if (s.leaves) s.lines.push(`Rời màn hình ${s.leaves} lần${awayMs >= 1000 ? ` (tổng ${formatDuration(awayMs)})` : ''}`);
  if (s.fullscreenExits) s.lines.push(`Thoát toàn màn hình ${s.fullscreenExits} lần`);
  if (s.pasteBlocked) s.lines.push(`Thử dán chữ ${s.pasteBlocked} lần (máy đã chặn)`);
  if (s.duplicateSessions) s.lines.push(`Bài được mở cùng lúc ở máy hoặc tab khác (${s.duplicateSessions} lần)`);
  if (s.resumes) s.lines.push(`Mở lại bài ${s.resumes} lần`);
  if (fastAnswers >= FAST_ANSWER_MIN) s.lines.push(`Trả lời rất nhanh ${fastAnswers} câu (dưới ${FAST_ANSWER_MS / 1000} giây)`);
  if (veryFastFinish) s.lines.push(`Nộp bài sau ${formatDuration(usedMs)} — nhanh hơn nhiều so với thời gian làm bài`);
  return s;
}

/** Lọc sự kiện hợp lệ từ máy HS (kiểu, thời gian, giới hạn số lượng). */
export function sanitizeIntegrity(events: unknown, existing = 0): IntegrityEvent[] {
  if (!Array.isArray(events)) return [];
  const kinds = new Set(['blur', 'hidden', 'fullscreen-exit', 'paste-blocked', 'duplicate-session', 'resume']);
  const out: IntegrityEvent[] = [];
  for (const e of events) {
    if (out.length + existing >= MAX_INTEGRITY_EVENTS) break;
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (typeof x.kind !== 'string' || !kinds.has(x.kind) || typeof x.at !== 'string' || Number.isNaN(Date.parse(x.at))) continue;
    out.push({
      kind: x.kind as IntegrityEvent['kind'],
      at: new Date(x.at).toISOString(),
      ...(typeof x.awayMs === 'number' && x.awayMs >= 0 ? { awayMs: Math.min(Math.round(x.awayMs), 3_600_000) } : {}),
      ...(typeof x.itemId === 'string' && x.itemId.length <= 128 ? { itemId: x.itemId } : {}),
    });
  }
  return out;
}
