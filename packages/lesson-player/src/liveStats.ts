import { displayOptions } from '@openedu/activity-engine';
/**
 * Thống kê câu trả lời trực tiếp cho màn hình TV. THUẦN: không React, không DOM, không import activity-engine.
 */
import type { Choice, Item, LiveResponse } from '@openedu/contracts';

export interface LiveOptionStat {
  id: string;
  /** Chữ hiển thị (text, hoặc "A", "B"… khi lựa chọn chỉ có ảnh). */
  label: string;
  image?: string;
  count: number;
  /** Lựa chọn đúng (cần item.key). POLL luôn false. */
  correct: boolean;
}

export interface LiveStats {
  /** 'choice' với MCQ, LISTEN_CHOOSE, MCQ_MULTIPLE, POLL — vẽ cột theo lựa chọn. */
  kind: 'choice' | 'other';
  /** Số học sinh đã trả lời (mỗi em tính một lần, lấy câu gửi sau cùng). */
  answered: number;
  /** Số em trả lời đúng (theo server/relay, hoặc tự chấm với dạng chọn khi có key). */
  correct: number;
  /** false với POLL, DRAW, RECORD_READ hoặc khi không biết đúng/sai. */
  graded: boolean;
  options: LiveOptionStat[];
}

const LETTERS = 'ABCDEFGHIJKLMNOP';

function optionsOf(item: Item): Choice[] | null {
  return displayOptions(item);
}

function correctIds(item: Item): string[] {
  switch (item.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE':
      return item.key ? [item.key.correct] : [];
    case 'MCQ_MULTIPLE':
      return item.key ? item.key.correct.slice() : [];
    default:
      return [];
  }
}

function chosenIds(item: Item, r: LiveResponse): string[] {
  const resp = r.response as unknown as Record<string, unknown> | null;
  if (!resp) return [];
  if (item.type === 'MCQ_MULTIPLE') return Array.isArray(resp.choices) ? (resp.choices as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return typeof resp.choice === 'string' ? [resp.choice] : [];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}

/** Giữ câu gửi sau cùng của mỗi học sinh cho item này. */
export function latestPerStudent(item: Item, responses: LiveResponse[]): LiveResponse[] {
  const byUser: Record<string, LiveResponse> = {};
  for (const r of responses) {
    if (r.itemId !== item.id) continue;
    const prev = byUser[r.userId];
    if (!prev || (r.at || '') >= (prev.at || '')) byUser[r.userId] = r;
  }
  return Object.keys(byUser).map((k) => byUser[k]);
}

export function computeLiveStats(item: Item, responses: LiveResponse[]): LiveStats {
  const latest = latestPerStudent(item, responses);
  const opts = optionsOf(item);
  const keyIds = correctIds(item);
  const isPoll = item.type === 'POLL';
  const ungradedType = isPoll || item.type === 'DRAW' || item.type === 'RECORD_READ';

  let correct = 0;
  let known = 0;
  for (const r of latest) {
    let ok: boolean | undefined = r.correct;
    if (ok === undefined && opts && keyIds.length && !isPoll) {
      const chosen = chosenIds(item, r);
      ok = item.type === 'MCQ_MULTIPLE' ? sameSet(chosen, keyIds) : chosen[0] === keyIds[0];
    }
    if (ok !== undefined) known++;
    if (ok) correct++;
  }

  const options: LiveOptionStat[] = [];
  if (opts) {
    const counts: Record<string, number> = {};
    for (const r of latest) for (const id of chosenIds(item, r)) counts[id] = (counts[id] ?? 0) + 1;
    opts.forEach((o, i) => {
      options.push({
        id: o.id,
        label: o.text && o.text.trim() ? o.text : LETTERS[i] ?? String(i + 1),
        image: o.image,
        count: counts[o.id] ?? 0,
        correct: !isPoll && keyIds.indexOf(o.id) >= 0,
      });
    });
  }

  return {
    kind: opts ? 'choice' : 'other',
    answered: latest.length,
    correct,
    graded: !ungradedType && (known > 0 || keyIds.length > 0),
    options,
  };
}
