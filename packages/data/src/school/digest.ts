/** Bản tin tuần cho phụ huynh (thuần): hoạt động 7 ngày, bài viết đã duyệt, chuyên cần, nề nếp, TT27 đã chốt. */
import {
  TT27_COMPETENCY_LABEL,
  TT27_QUALITY_LABEL,
  type AttendanceRecord,
  type Behavior,
  type BehaviorLog,
  type LearningEvent,
  type ParentDigest,
  type ParentSummary,
  type ParentTt27,
  type Profile,
  type RewardEntry,
  type StudentWorkEntry,
  type SubjectId,
  type Tt27Evaluation,
  type Tt27TermId,
} from '@openedu/contracts';
import { vnDayKey } from '../mastery';
import { vnWeekStart } from '../engagement';

const DAY = 86_400_000;
const LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const TERM_ORDER: Tt27TermId[] = ['GK1', 'CK1', 'GK2', 'CN'];

/** Chuẩn hoá về thứ Hai 0 giờ giờ VN của tuần chứa thời điểm đó. */
export function digestWeekStart(weekStart: string | undefined, now: Date): string {
  return vnWeekStart(weekStart ? new Date(weekStart) : now);
}

export function latestFinalTt27(list: Tt27Evaluation[], studentId: string): Tt27Evaluation | null {
  return (
    list
      .filter((e) => e.studentId === studentId && e.status === 'final')
      .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || TERM_ORDER.indexOf(b.termId) - TERM_ORDER.indexOf(a.termId))[0] ?? null
  );
}

export function toParentTt27(e: Tt27Evaluation, teacherName?: string): ParentTt27 {
  return {
    termId: e.termId,
    schoolYear: e.schoolYear,
    subjects: (Object.entries(e.subjects) as [SubjectId, NonNullable<Tt27Evaluation['subjects'][SubjectId]>][]).map(([subject, r]) => ({ subject, level: r.level, comment: r.comment, ...(r.score !== undefined ? { score: r.score } : {}) })),
    qualities: Object.keys(TT27_QUALITY_LABEL).filter((k) => e.qualities[k as keyof Tt27Evaluation['qualities']]).map((k) => ({ key: k, rating: e.qualities[k as keyof Tt27Evaluation['qualities']] })),
    competencies: Object.keys(TT27_COMPETENCY_LABEL).filter((k) => e.competencies[k as keyof Tt27Evaluation['competencies']]).map((k) => ({ key: k, rating: e.competencies[k as keyof Tt27Evaluation['competencies']] as ParentTt27['competencies'][number]['rating'] })),
    generalComment: e.generalComment,
    ...(teacherName ? { teacherName } : {}),
    ...(e.updatedAt ? { updatedAt: e.updatedAt } : {}),
  };
}

export interface DigestInput {
  now: Date;
  child: Profile;
  className?: string;
  teacherName?: string;
  weekStart?: string;
  events: LearningEvent[];
  rewards: RewardEntry[];
  works: StudentWorkEntry[];
  attendance: AttendanceRecord[];
  behaviorLogs: BehaviorLog[];
  behaviors: Behavior[];
  /** Danh sách TT27 HS / phụ huynh được xem (chỉ 'final' được dùng). */
  tt27: Tt27Evaluation[];
  /** Tóm tắt hiện tại (để lấy gợi ý ở nhà). */
  summary?: ParentSummary | null;
}

export function buildParentDigest(i: DigestInput): ParentDigest {
  const start = digestWeekStart(i.weekStart, i.now);
  const startMs = Date.parse(start);
  const endMs = Math.min(startMs + 7 * DAY, i.now.getTime());
  const isCurrent = startMs + 7 * DAY > i.now.getTime();
  const inWeek = (iso: string) => { const t = Date.parse(iso); return t >= startMs && t < startMs + 7 * DAY && t <= i.now.getTime(); };
  const cid = i.child.id;
  const ev = i.events.filter((e) => e.userId === cid && inWeek(e.at));
  const rw = i.rewards.filter((r) => r.userId === cid && inWeek(r.at));
  const days: ParentDigest['days'] = LABELS.map((label, k) => {
    const key = vnDayKey(new Date(startMs + k * DAY + 12 * 3_600_000).toISOString());
    const de = ev.filter((e) => vnDayKey(e.at) === key);
    return {
      date: key,
      label,
      active: de.length > 0,
      answered: de.filter((e) => e.verb === 'answered').length,
      stars: rw.filter((r) => vnDayKey(r.at) === key).reduce((s, r) => s + r.stars, 0),
    };
  });
  const answered = ev.filter((e) => e.verb === 'answered' && typeof e.result?.correct === 'boolean');
  const correct = answered.filter((e) => e.result?.correct).length;
  const totals: ParentDigest['totals'] = {
    daysActive: days.filter((d) => d.active).length,
    answered: answered.length,
    correctRate: answered.length ? correct / answered.length : null,
    stars: rw.reduce((s, r) => s + r.stars, 0),
    lessonsCompleted: ev.filter((e) => e.verb === 'completed' && e.objectType === 'lesson').length,
    remediationPassed: ev.filter((e) => e.verb === 'completed' && e.objectType === 'remediation' && e.result?.correct).length,
  };
  const works = i.works.filter((w) => inWeek(w.at)).sort((a, b) => b.at.localeCompare(a.at));

  const keyFrom = vnDayKey(start);
  const keyTo = vnDayKey(new Date(endMs).toISOString());
  const att = i.attendance
    .filter((r) => r.date >= keyFrom && r.date <= keyTo && r.entries[cid])
    .map((r) => r.entries[cid]);
  const attendance = att.length
    ? { days: att.length, present: att.filter((s) => s === 'co-mat').length, late: att.filter((s) => s === 'muon').length, excused: att.filter((s) => s === 'vang-co-phep').length, unexcused: att.filter((s) => s === 'vang-khong-phep').length }
    : null;

  const logs = i.behaviorLogs.filter((l) => l.studentId === cid && inWeek(l.at));
  const label = new Map(i.behaviors.map((b) => [b.id, b.label]));
  const posCount = new Map<string, number>();
  logs.filter((l) => l.points > 0).forEach((l) => posCount.set(l.behaviorId, (posCount.get(l.behaviorId) ?? 0) + 1));
  const topId = [...posCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const behavior = logs.length
    ? { points: logs.reduce((s, l) => s + l.points, 0), positive: logs.filter((l) => l.points > 0).length, needsWork: logs.filter((l) => l.points < 0).length, ...(topId && label.get(topId) ? { topPositive: label.get(topId) } : {}) }
    : null;

  const t = latestFinalTt27(i.tt27, cid);
  const tips: string[] = [];
  for (const w of works) if (w.parentComment) { const m = /Gợi ý ở nhà:\s*(.+)$/i.exec(w.parentComment); if (m) tips.push(m[1].trim()); }
  for (const g of i.summary?.gaps ?? []) if (g.suggestions[0]) tips.push(g.suggestions[0]);

  const name = i.child.name;
  let headline: string;
  if (!totals.daysActive && !works.length) headline = isCurrent ? `Tuần này ${name} chưa học trên OPEN-EDU. Bố mẹ nhắc con học 10–15 phút mỗi ngày nhé.` : `Tuần này ${name} không có hoạt động học trên OPEN-EDU.`;
  else if (totals.daysActive >= 5) headline = `${name} học đều ${totals.daysActive}/7 ngày${totals.stars ? `, nhận ${totals.stars} sao` : ''}. Thật đáng khen!`;
  else headline = `${name} có học ${totals.daysActive}/7 ngày${totals.answered ? `, làm ${totals.answered} câu` : ''}${totals.correctRate !== null ? ` (đúng ${Math.round(totals.correctRate * 100)}%)` : ''}.`;

  return {
    childId: cid,
    childName: name,
    ...(i.className ? { className: i.className } : {}),
    weekStart: start,
    weekEnd: new Date(endMs).toISOString(),
    isCurrentWeek: isCurrent,
    headline,
    days,
    totals,
    works,
    attendance,
    behavior,
    tt27: t ? toParentTt27(t, i.teacherName) : null,
    tips: [...new Set(tips)].slice(0, 3),
  };
}
