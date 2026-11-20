// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server (cùng shared/text.ts).
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';
import { answersMatch, normalizeText } from '../../shared/text';

/** Bỏ đơn vị em gõ thêm ở cuối ("52 cm" khi đơn vị là cm). */
function stripUnit(text: string, unit: string | undefined): string {
  if (!unit) return text;
  const t = normalizeText(text);
  const u = normalizeText(unit);
  if (u && t.length > u.length && t.endsWith(u)) return t.slice(0, t.length - u.length).trim();
  return text;
}

export function score(item: ItemOf<'SHORT_ANSWER'>, r: ResponseOf<'SHORT_ANSWER'> | undefined): ScoreResult {
  const key = item.key;
  if (!key || !Array.isArray(key.accepted)) return { graded: false, correct: false, score: 0 };
  const given = typeof r?.text === 'string' ? r.text : '';
  const cs = !!key.caseSensitive;
  const correct = answersMatch(given, key.accepted, cs) || answersMatch(stripUnit(given, item.payload?.unit), key.accepted, cs);
  return { graded: true, correct, score: correct ? 1 : 0, parts: { answer: correct } };
}

export function isComplete(_item: ItemOf<'SHORT_ANSWER'>, r: ResponseOf<'SHORT_ANSWER'> | undefined): boolean {
  return !!r && typeof r.text === 'string' && normalizeText(r.text).length > 0;
}
