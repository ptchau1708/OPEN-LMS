/**
 * Từ learning_events → quan sát (observation) cho bộ máy thành thạo; nhận diện quan niệm sai từ câu trả lời.
 * THUẦN — chép sang Edge Function.
 */
import type { AnyResponse, Choice, Item, LearningEvent } from '@openedu/contracts';
import { UNGRADED_ITEM_TYPES } from './constants';

export interface AnswerObservation {
  kind: 'answer';
  at: string;
  itemId: string;
  correct: boolean;
  /** 0..1 */
  score: number;
  skills: string[];
  misconceptions: string[];
}

export interface RemediationObservation {
  kind: 'remediation';
  at: string;
  setId: string;
  skills: string[];
  passed: boolean;
}

export type Observation = AnswerObservation | RemediationObservation;

/** Phần item mà bộ máy cần (item đầy đủ cũng dùng được). */
export type ItemLike = Pick<Item, 'id' | 'type'> & Partial<Pick<Item, 'skills' | 'difficulty' | 'grade' | 'subject' | 'payload' | 'key'>>;

export function isGradedType(type: string): boolean {
  return !(UNGRADED_ITEM_TYPES as readonly string[]).includes(type);
}

/** Chuẩn hoá câu trả lời ngắn để tra bảng quan niệm sai: "0,50" = "0.5", "96 kg" → "96", "3 / 4" → "3/4". */
export function normalizeAnswer(s: string): string {
  let t = (s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const lead = /^([-+]?[\d.,\s]*\d)(?:\s*[^\d\s.,/].*)?$/.exec(t);
  if (lead) {
    const raw = lead[1].replace(/\s/g, '');
    const dots = (raw.match(/\./g) ?? []).length;
    const commas = (raw.match(/,/g) ?? []).length;
    let num = raw;
    if (commas === 1 && dots === 0) num = raw.replace(',', '.');
    else if (dots > 1 || (dots === 1 && commas === 0 && /\.\d{3}$/.test(raw) && raw.length > 4)) num = raw.replace(/\./g, '');
    const n = Number(num);
    if (Number.isFinite(n)) return String(n);
  }
  t = t.replace(/\s*\/\s*/g, '/');
  return t;
}

function choiceCodes(options: Choice[] | undefined, chosen: string[], table: Record<string, string> | undefined): string[] {
  const out: string[] = [];
  for (const id of chosen) {
    const c = options?.find((o) => o.id === id)?.misconception ?? table?.[id];
    if (c) out.push(c);
  }
  return out;
}

/**
 * Mã quan niệm sai mà câu trả lời này thể hiện (rỗng nếu không khớp). Đọc `Choice.misconception` và
 * `key.misconceptions` (quy ước khóa: xem KeyExtras trong contracts/items.ts).
 */
export function detectMisconceptions(item: ItemLike, response: AnyResponse | unknown): string[] {
  if (!response || typeof response !== 'object') return [];
  const r = response as Record<string, unknown>;
  const key = (item.key ?? null) as { misconceptions?: Record<string, string> } | null;
  const table = key?.misconceptions;
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  const look = (k: string) => {
    const c = table?.[k];
    if (c) out.push(c);
  };
  switch (item.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE':
      if (typeof r.choice === 'string') out.push(...choiceCodes(payload.options as Choice[], [r.choice], table));
      break;
    case 'MCQ_MULTIPLE':
      if (Array.isArray(r.choices)) out.push(...choiceCodes(payload.options as Choice[], r.choices.map(String), table));
      break;
    case 'SHORT_ANSWER':
      if (typeof r.text === 'string' && table) {
        const given = normalizeAnswer(r.text);
        for (const [k, code] of Object.entries(table)) if (normalizeAnswer(k) === given) out.push(code);
      }
      break;
    case 'MATH_MANIPULATIVE':
      if (typeof r.value === 'number') look(String(r.value));
      break;
    case 'ORDERING':
    case 'SENTENCE_SCRAMBLE':
      if (Array.isArray(r.order)) look(r.order.map(String).join(','));
      break;
    case 'DRAG_DROP':
    case 'WORD_CLASSIFY':
    case 'MATCHING': {
      const m = (r.placement ?? r.pairs) as Record<string, string> | undefined;
      if (m && typeof m === 'object') for (const [a, b] of Object.entries(m)) look(`${a}>${b}`);
      break;
    }
    case 'FILL_IN_PASSAGE':
    case 'INLINE_DROPDOWN': {
      const m = r.blanks as Record<string, string> | undefined;
      if (m && typeof m === 'object')
        for (const [b, v] of Object.entries(m)) {
          look(`${b}=${v}`);
          if (table) for (const [k, code] of Object.entries(table)) if (k.startsWith(`${b}=`) && k !== `${b}=${v}` && normalizeAnswer(k.slice(b.length + 1)) === normalizeAnswer(String(v))) out.push(code);
        }
      break;
    }
    case 'HOTSPOT':
      if (Array.isArray(r.regions)) for (const id of r.regions) look(String(id));
      break;
    default:
      break;
  }
  return [...new Set(out)];
}

/** Dữ liệu ghi kèm sự kiện 'answered' (result.skills / result.misconceptions). */
export function answerAnnotations(item: ItemLike, response: AnyResponse | unknown, correct: boolean): { skills: string[]; misconceptions: string[] } {
  if (!isGradedType(item.type)) return { skills: [], misconceptions: [] };
  return { skills: [...(item.skills ?? [])], misconceptions: correct ? [] : detectMisconceptions(item, response) };
}

/**
 * Sự kiện → quan sát, sắp theo thời gian. Ưu tiên result.skills/misconceptions đã ghi kèm; thiếu thì tra `items`.
 * Bỏ: câu không chấm, câu không gắn kĩ năng, sự kiện khác.
 */
export function observationsFromEvents(events: LearningEvent[], items?: Record<string, ItemLike | undefined>): Observation[] {
  const out: Observation[] = [];
  for (const e of events) {
    const res = e.result ?? {};
    if (e.verb === 'answered' && (e.objectType === 'item' || e.objectType === 'arena' || e.objectType === 'exam')) {
      const item = items?.[e.objectId];
      if (item && !isGradedType(item.type)) continue;
      const skills = res.skills ?? item?.skills ?? [];
      if (!skills.length) continue;
      const correct = !!res.correct;
      const misconceptions = res.misconceptions ?? (!correct && item && res.response !== undefined ? detectMisconceptions(item, res.response) : []);
      const score = typeof res.score === 'number' && Number.isFinite(res.score) ? Math.max(0, Math.min(1, res.score)) : correct ? 1 : 0;
      out.push({ kind: 'answer', at: e.at, itemId: e.objectId, correct, score, skills, misconceptions });
    } else if (e.verb === 'answered' && e.objectType === 'work') {
      // Bài làm viết đã được GV duyệt: tính như `weight` câu (mặc định 2) cùng thời điểm.
      const skills = res.skills ?? [];
      if (!skills.length) continue;
      const correct = !!res.correct;
      const score = typeof res.score === 'number' && Number.isFinite(res.score) ? Math.max(0, Math.min(1, res.score)) : correct ? 1 : 0;
      const w = typeof res.weight === 'number' && res.weight >= 1 ? Math.min(5, Math.round(res.weight)) : 2;
      for (let i = 0; i < w; i++) out.push({ kind: 'answer', at: e.at, itemId: e.objectId, correct, score, skills, misconceptions: i === 0 ? res.misconceptions ?? [] : [] });
    } else if (e.verb === 'completed' && e.objectType === 'remediation') {
      const skills = res.skills ?? [];
      if (!skills.length) continue;
      out.push({ kind: 'remediation', at: e.at, setId: e.objectId, skills, passed: !!res.correct });
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}
