/**
 * Tính lại & lưu v2.skill_mastery cho một HS (dùng chung Edge Function `grade` và `ai-grade`).
 * Đọc learning_events: câu hỏi ('item'), bộ ôn ('remediation'), bài làm đã duyệt ('work', weight = số câu tương đương).
 */
import { SKILL_BY_CODE, type LearningEvent, type SkillMastery } from './scoring/contracts.ts';
import { computeMastery, masteryToRow } from './mastery/index.ts';
import { fromPgError, type AdminClient } from './supabase.ts';

/** Ngày lấy sự kiện để tính lại mức thành thạo (trọng số độ mới bán rã 10 ngày → 180 ngày là đủ). */
const MASTERY_WINDOW_DAYS = 180;

/** Tính lại và lưu skill_mastery cho `skills` của HS. */
export async function refreshMastery(admin: AdminClient, userId: string, skills: string[]): Promise<SkillMastery[]> {
  const codes = [...new Set(skills)].filter((c) => SKILL_BY_CODE[c]);
  if (!codes.length) return [];
  const since = new Date(Date.now() - MASTERY_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('learning_events')
    .select('id, verb, object_type, object_id, at, correct:result->correct, score:result->score, weight:result->weight, skills:result->skills, misconceptions:result->misconceptions')
    .eq('user_id', userId)
    .in('verb', ['answered', 'completed'])
    .in('object_type', ['item', 'arena', 'remediation', 'work', 'exam', 'external'])
    .gte('at', since)
    .order('at', { ascending: true })
    .limit(5000);
  if (error) throw fromPgError(error);
  const events: LearningEvent[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    userId,
    verb: r.verb as LearningEvent['verb'],
    objectType: r.object_type as LearningEvent['objectType'],
    objectId: String(r.object_id),
    at: String(r.at),
    result: {
      correct: r.correct === true,
      ...(typeof r.score === 'number' ? { score: r.score } : {}),
      ...(typeof r.weight === 'number' ? { weight: r.weight } : {}),
      skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
      misconceptions: Array.isArray(r.misconceptions) ? (r.misconceptions as string[]) : [],
    },
  }));
  const list = computeMastery(userId, events, undefined, { onlySkills: codes });
  if (list.length) {
    const now = new Date().toISOString();
    const up = await admin.from('skill_mastery').upsert(list.map((m) => masteryToRow(m, now)), { onConflict: 'user_id,skill_code' });
    if (up.error) throw fromPgError(up.error);
  }
  return list;
}

