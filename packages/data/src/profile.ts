/**
 * Lắp ráp hồ sơ 360° và bản tóm tắt phụ huynh từ dữ liệu thô (THUẦN). Demo và Supabase cùng dùng.
 */
import {
  SKILL_BY_CODE,
  TT27_LEVEL_LABEL,
  type AttendanceRecord,
  type Behavior,
  type BehaviorLog,
  type StudentWorkEntry,
  type Tt27Evaluation,
  type Assignment,
  type ClassInfo,
  type LearningEvent,
  type Lesson,
  type LessonProgress,
  type LessonProgressSummary,
  type MasteryLevel,
  type ParentSummary,
  type Passport,
  type Profile,
  type RemediationSet,
  type RewardEntry,
  type SkillMastery,
  type StudentProfile,
  type SubjectId,
  type TimelineEntry,
  type Wallet,
} from '@openedu/contracts';
import { countLevels, findGaps, planRemediation, vnDayKey, type ItemLike } from './mastery';
import { homeSuggestions, lowerFirst, shortOf } from './suggestions';
import { attendanceSummary, behaviorSummary, workSummary } from './engagement';
import { fmtScore } from './assess/rules';

export type LessonLite = Pick<Lesson, 'id' | 'title' | 'subject'> & { slides: { id: string }[] };

export interface ProfileInput {
  now: Date;
  student: Profile;
  cls: ClassInfo | null;
  teacherName?: string;
  wallet: Wallet;
  passport: Passport;
  masteries: SkillMastery[];
  /** Ngân hàng câu hỏi (chỉ cần id, type, difficulty, skills) để lập bộ ôn tập. */
  items: ItemLike[];
  assignments: Assignment[];
  lessons: Record<string, LessonLite | undefined>;
  progress: LessonProgress[];
  /** Sự kiện gần đây của HS (mới hoặc cũ đều được). */
  events: LearningEvent[];
  rewards: RewardEntry[];
  /* ---- Phase 4 (tuỳ chọn) ---- */
  /** Bài đã duyệt (workEntryOf). */
  works?: StudentWorkEntry[];
  /** Số bài đã nộp chưa duyệt. */
  workPending?: number;
  behaviorLogs?: BehaviorLog[];
  behaviors?: Behavior[];
  attendance?: AttendanceRecord[];
  /** Đánh giá TT27 mới nhất người xem được. */
  tt27?: Tt27Evaluation | null;
}

/** @deprecated từ Phase 4 các mô-đun đã có — luôn rỗng. */
export const PENDING_MODULES = {} as const;

function ratio(lesson: LessonLite | undefined, p: LessonProgress | undefined): number {
  if (!p) return 0;
  if (p.completedAt) return 1;
  const ids = new Set((lesson?.slides ?? []).map((s) => s.id));
  if (!ids.size) return 0;
  return Math.min(1, p.completedSlides.filter((id) => ids.has(id)).length / ids.size);
}

export function lessonSummaries(student: Profile, assignments: Assignment[], lessons: Record<string, LessonLite | undefined>, progress: LessonProgress[]): LessonProgressSummary[] {
  const byLesson: Record<string, LessonProgress> = {};
  for (const p of progress) if (p.userId === student.id) byLesson[p.lessonId] = p;
  const out: LessonProgressSummary[] = [];
  const seen = new Set<string>();
  const add = (lessonId: string, a?: Assignment) => {
    if (seen.has(lessonId)) return;
    const l = lessons[lessonId];
    if (!l) return;
    seen.add(lessonId);
    const p = byLesson[lessonId];
    const r = ratio(l, p);
    out.push({
      ...(a ? { assignmentId: a.id } : {}),
      lessonId,
      title: a?.title || l.title,
      subject: l.subject,
      status: r >= 1 ? 'hoan-thanh' : p ? 'dang-hoc' : 'chua-bat-dau',
      progress: r,
      starsEarned: p?.starsEarned ?? 0,
      ...(a?.dueAt ? { dueAt: a.dueAt } : {}),
      ...(p?.completedAt ? { completedAt: p.completedAt } : {}),
    });
  };
  for (const a of assignments) {
    if (a.targetType !== 'lesson') continue;
    if (a.studentIds.length ? !a.studentIds.includes(student.id) : a.classId !== student.classId) continue;
    add(a.targetId, a);
  }
  for (const p of Object.values(byLesson)) add(p.lessonId);
  const rank = { 'dang-hoc': 0, 'chua-bat-dau': 1, 'hoan-thanh': 2 } as const;
  return out.sort((x, y) => rank[x.status] - rank[y.status] || (x.dueAt ?? '9').localeCompare(y.dueAt ?? '9'));
}

export function buildTimeline(events: LearningEvent[], rewards: RewardEntry[], lessons: Record<string, LessonLite | undefined>, limit = 30): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const title = (id?: string) => (id && lessons[id]?.title) || 'bài học';
  const practice = new Map<string, { at: string; n: number; ok: number }>();
  const live = new Map<string, { at: string; n: number; ok: number }>();
  for (const e of events) {
    if (e.verb === 'completed' && e.objectType === 'lesson') out.push({ at: e.at, kind: 'lesson', title: `Hoàn thành bài: ${title(e.objectId)}`, refId: e.objectId, ...(e.offline ? { offline: true } : {}) });
    else if (e.verb === 'started' && e.objectType === 'lesson') out.push({ at: e.at, kind: 'lesson', title: `Bắt đầu bài: ${title(e.objectId)}`, refId: e.objectId });
    else if (e.verb === 'joined' && e.objectType === 'live') out.push({ at: e.at, kind: 'live', title: 'Tham gia lớp học trực tiếp', refId: e.liveSessionId ?? e.objectId });
    else if (e.verb === 'completed' && e.objectType === 'remediation') {
      const sk = e.result?.skills?.[0];
      const ok = !!e.result?.correct;
      out.push({ at: e.at, kind: 'remediation', title: `Ôn tập: ${sk ? shortOf(sk) : 'kĩ năng'} — ${ok ? 'đạt' : 'chưa đạt'}`, detail: e.result?.total ? `Đúng ${e.result.correctCount ?? 0}/${e.result.total} câu` : undefined, refId: e.objectId, ...(e.offline ? { offline: true } : {}) });
    } else if (e.verb === 'answered' && e.objectType === 'item' && !e.lessonId) {
      const map = e.liveSessionId ? live : practice;
      const k = e.liveSessionId ? e.liveSessionId : vnDayKey(e.at);
      const g: { at: string; n: number; ok: number; off?: number } = map.get(k) ?? { at: e.at, n: 0, ok: 0 };
      g.n++;
      if (e.offline) g.off = (g.off ?? 0) + 1;
      if (e.result?.correct) g.ok++;
      if (e.at > g.at) g.at = e.at;
      map.set(k, g);
    }
  }
  for (const [, g] of practice) out.push({ at: g.at, kind: 'practice', title: `Luyện tập ${g.n} câu`, detail: `Đúng ${g.ok}/${g.n} câu`, ...((g as { off?: number }).off ? { offline: true } : {}) });
  for (const [id, g] of live) out.push({ at: g.at, kind: 'live', title: `Trả lời ${g.n} câu trong lớp trực tiếp`, detail: `Đúng ${g.ok}/${g.n} câu`, refId: id });
  for (const r of rewards) {
    if (r.sourceType === 'arena') out.push({ at: r.at, kind: 'arena', title: r.reason || 'Đấu trường', stars: r.stars });
    else if (r.sourceType === 'behavior' || r.sourceType === 'bonus') out.push({ at: r.at, kind: 'reward', title: r.reason || 'Được thầy/cô khen', stars: r.stars });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function masteryBySubject(student: Profile, masteries: SkillMastery[]): StudentProfile['mastery'] {
  const subjects = new Map<SubjectId, SkillMastery[]>();
  for (const m of masteries) {
    const s = SKILL_BY_CODE[m.skillCode]?.subject;
    if (!s) continue;
    subjects.set(s, [...(subjects.get(s) ?? []), m]);
  }
  const bySubject = [...subjects.entries()].map(([subject, list]) => {
    const counts = countLevels(list);
    const total = Object.values(SKILL_BY_CODE).filter((s) => s.subject === subject && s.grade === student.grade).length;
    const inGrade = list.filter((m) => SKILL_BY_CODE[m.skillCode]?.grade === student.grade).length;
    counts['chua-hoc'] += Math.max(0, total - inGrade);
    return { subject, counts, total: Math.max(total, list.length) };
  });
  const counts: Record<MasteryLevel, number> = { 'chua-hoc': 0, 'dang-hoc': 0, 'can-on': 0, vung: 0 };
  for (const s of bySubject) for (const k of Object.keys(counts) as MasteryLevel[]) counts[k] += s.counts[k];
  return { bySubject: bySubject.sort((a, b) => a.subject.localeCompare(b.subject)), counts };
}

export function strengthsOf(masteries: SkillMastery[], n = 5): StudentProfile['strengths'] {
  return masteries
    .filter((m) => m.level === 'vung')
    .sort((a, b) => b.p - a.p || b.attempts - a.attempts)
    .slice(0, n)
    .map((m) => ({ skillCode: m.skillCode, short: shortOf(m.skillCode), p: m.p }));
}

export function liveParticipation(events: LearningEvent[]): StudentProfile['live'] {
  const sessions = new Set<string>();
  let answered = 0;
  let correct = 0;
  let lastAt: string | undefined;
  for (const e of events) {
    if (!e.liveSessionId && e.objectType !== 'live') continue;
    sessions.add(e.liveSessionId ?? e.objectId);
    if (e.verb === 'answered') {
      answered++;
      if (e.result?.correct) correct++;
    }
    if (!lastAt || e.at > lastAt) lastAt = e.at;
  }
  return { sessions: sessions.size, answered, correct, ...(lastAt ? { lastAt } : {}) };
}

export function workTimeline(works: StudentWorkEntry[]): TimelineEntry[] {
  return works.map((w) => ({ at: w.at, kind: 'work' as const, title: `Bài làm: ${w.title} — ${TT27_LEVEL_LABEL[w.level]}`, detail: `${fmtScore(w.total)}/${fmtScore(w.max)} điểm`, refId: w.submissionId }));
}

function mergeTimeline(a: TimelineEntry[], b: TimelineEntry[], limit = 30): TimelineEntry[] {
  return [...a, ...b].sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export function buildStudentProfile(input: ProfileInput): StudentProfile {
  const { student, cls } = input;
  const team = cls?.teams.find((t) => t.studentIds.includes(student.id));
  const remediation: RemediationSet[] = planRemediation({ userId: student.id, masteries: input.masteries, items: input.items, now: input.now });
  return {
    generatedAt: input.now.toISOString(),
    student,
    class: cls
      ? {
          id: cls.id,
          name: cls.name,
          grade: cls.grade,
          teacherId: cls.teacherId,
          ...(input.teacherName ? { teacherName: input.teacherName } : {}),
          ...(team ? { team: { id: team.id, name: team.name, color: team.color } } : {}),
        }
      : null,
    wallet: input.wallet,
    passport: input.passport,
    mastery: masteryBySubject(student, input.masteries),
    gaps: findGaps(input.masteries).slice(0, 5),
    strengths: strengthsOf(input.masteries),
    lessons: lessonSummaries(student, input.assignments, input.lessons, input.progress),
    timeline: mergeTimeline(buildTimeline(input.events, input.rewards, input.lessons), workTimeline(input.works ?? [])),
    live: liveParticipation(input.events),
    remediation,
    work: workSummary(input.works ?? [], input.workPending ?? 0),
    behavior: behaviorSummary(input.behaviorLogs ?? [], input.behaviors ?? [], input.now),
    attendance: attendanceSummary(input.attendance ?? [], student.id, input.now),
    tt27: input.tt27 ?? null,
    pendingModules: {},
  };
}

/* ======================= phụ huynh ======================= */
export interface ParentInput {
  now: Date;
  child: Profile;
  masteries: SkillMastery[];
  /** Sự kiện của con, tối thiểu 14 ngày gần nhất (để so với tuần trước). */
  events: LearningEvent[];
  rewards: RewardEntry[];
  items: ItemLike[];
  /* ---- Phase 4 (tuỳ chọn) ---- */
  works?: StudentWorkEntry[];
  behaviorLogs?: BehaviorLog[];
  behaviors?: Behavior[];
  attendance?: AttendanceRecord[];
}

/** Gợi ý ở nhà ngắn từ nhận xét phụ huynh của bài làm ("… Gợi ý ở nhà: …" → phần sau). */
function tipOf(parentComment: string): string {
  const m = parentComment.match(/gợi ý ở nhà:\s*(.+)$/i);
  if (m) return m[1].trim();
  const parts = parentComment.replace(/([.!?])\s+/g, '$1\n').split('\n');
  return (parts.length > 1 ? parts[parts.length - 1] : parentComment).trim();
}

function weekStats(events: LearningEvent[], rewards: RewardEntry[], from: number, to: number) {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };
  const ev = events.filter((e) => inRange(e.at));
  const graded = ev.filter((e) => e.verb === 'answered' && e.objectType === 'item' && (e.result?.skills?.length ?? 0) > 0);
  const answered = ev.filter((e) => e.verb === 'answered').length;
  const ok = graded.filter((e) => e.result?.correct).length;
  return {
    daysActive: new Set(ev.map((e) => vnDayKey(e.at))).size,
    answered,
    correctRate: graded.length ? Math.round((ok / graded.length) * 100) / 100 : null,
    stars: rewards.filter((r) => inRange(r.at)).reduce((a, r) => a + (r.stars || 0), 0),
    lessonsCompleted: ev.filter((e) => e.verb === 'completed' && e.objectType === 'lesson').length,
  };
}

export function buildParentSummary(input: ParentInput): ParentSummary {
  const { child, now } = input;
  const name = child.name;
  const to = now.getTime();
  // 7 ngày theo lịch Việt Nam: từ 0 giờ (UTC+7) của 6 ngày trước tới bây giờ.
  const vnMidnight = Date.parse(`${vnDayKey(now.toISOString())}T00:00:00+07:00`);
  const from = vnMidnight - 6 * 86_400_000;
  const week = weekStats(input.events, input.rewards, from, to);
  const prev = weekStats(input.events, input.rewards, from - 7 * 86_400_000, from - 1);
  const gaps = findGaps(input.masteries).slice(0, 6);
  const strengths = input.masteries.filter((m) => m.level === 'vung').sort((a, b) => b.p - a.p).slice(0, 4).map((m) => shortOf(m.skillCode));
  const sets = planRemediation({ userId: child.id, masteries: input.masteries, items: input.items, now }).filter((s) => new Date(s.dueAt).getTime() <= to);

  const headline =
    week.answered > 0
      ? `Tuần này ${name} học ${week.daysActive} ngày, làm ${week.answered} câu${week.correctRate !== null ? `, đúng khoảng ${Math.round(week.correctRate * 100)}%` : ''}.`
      : `Tuần này ${name} chưa làm bài trên OPEN-EDU. Bố mẹ nhắc con dành 10 phút mỗi ngày nhé.`;
  const sentences: string[] = [headline];
  if (week.correctRate !== null && prev.correctRate !== null) {
    const d = Math.round((week.correctRate - prev.correctRate) * 100);
    if (d >= 5) sentences.push(`So với tuần trước, con làm đúng nhiều hơn (tăng ${d} điểm phần trăm). Bố mẹ khen con nhé!`);
    else if (d <= -5) sentences.push(`So với tuần trước, tỉ lệ đúng giảm ${-d} điểm phần trăm — có thể con đang học phần mới, bố mẹ động viên con.`);
  }
  if (week.stars > 0) sentences.push(`Con nhận được ${week.stars} ngôi sao trong tuần.`);
  if (strengths.length) sentences.push(`Con đã vững: ${strengths.map((s) => `“${s}”`).join(', ')}.`);
  // Gộp các lỗ hổng cùng gốc thành một câu.
  const byRoot = new Map<string, typeof gaps>();
  for (const g of gaps) byRoot.set(g.rootSkill, [...(byRoot.get(g.rootSkill) ?? []), g]);
  const gapNotes = [...byRoot.entries()].slice(0, 3).map(([rootSkill, list]) => {
    const root = lowerFirst(shortOf(rootSkill));
    const shown = list.filter((g) => g.skillCode !== rootSkill).map((g) => `“${lowerFirst(shortOf(g.skillCode))}”`);
    const mc = list.flatMap((g) => g.topMisconceptions).sort((a, b) => b.count - a.count)[0];
    const sentence =
      `Con đang chưa chắc phần ${root}` +
      (shown.length ? `, nên còn nhầm khi làm bài ${shown.join(', ')}.` : '.') +
      (mc ? ` Lỗi con hay gặp: ${lowerFirst(mc.text).replace(/\.$/, '')}.` : '');
    const skillCode = (list.find((g) => g.skillCode !== rootSkill) ?? list[0]).skillCode;
    return { skillCode, rootSkill, sentence, suggestions: homeSuggestions(skillCode, rootSkill) };
  });
  for (const g of gapNotes) sentences.push(g.sentence);
  if (!gapNotes.length && week.answered > 0) sentences.push('Hiện chưa thấy phần nào con bị hổng. Tiếp tục duy trì thói quen học đều nhé!');
  if (sets.length) {
    const mins = sets.reduce((a, s) => a + s.minutes, 0);
    sentences.push(`Hôm nay con có ${sets.length} bộ ôn tập ngắn (khoảng ${mins} phút) trong mục “Hôm nay”.`);
  }
  /* ---- Phase 4: bài làm, thi đua, chuyên cần ---- */
  const latestWork = [...(input.works ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0];
  let work: ParentSummary['work'] = null;
  if (latestWork) {
    const tip = tipOf(latestWork.parentComment);
    const sentence = `Bài “${latestWork.title}” được thầy/cô nhận xét: ${lowerFirst(TT27_LEVEL_LABEL[latestWork.level])} (${fmtScore(latestWork.total)}/${fmtScore(latestWork.max)} điểm).`;
    work = { title: latestWork.title, level: latestWork.level, sentence, tip, at: latestWork.at };
    sentences.push(`${sentence} Gợi ý: ${tip}`);
  }
  const beh = behaviorSummary(input.behaviorLogs ?? [], input.behaviors ?? [], now);
  if (beh && (beh.weekPositive || beh.weekNeedsWork)) {
    const good = beh.topPositive[0] ? ` (nhất là “${lowerFirst(beh.topPositive[0])}”)` : '';
    const nw = beh.weekNeedsWork ? ` Thầy/cô nhắc con: ${lowerFirst(beh.topNeedsWork[0] ?? 'giữ nề nếp')}.` : '';
    sentences.push(`Tuần này con được khen ${beh.weekPositive} điểm thi đua${good}.${nw}`);
  }
  const att = attendanceSummary(input.attendance ?? [], child.id, now);
  if (att && (att.unexcused || att.late || att.excused)) {
    sentences.push(`Chuyên cần 30 ngày: con đi học ${att.present + att.late}/${att.days} buổi${att.late ? `, đi muộn ${att.late} buổi` : ''}${att.unexcused ? `, vắng không phép ${att.unexcused} buổi — bố mẹ lưu ý giúp con nhé` : ''}.`);
  }
  return {
    childId: child.id,
    childName: name,
    generatedAt: now.toISOString(),
    headline,
    sentences,
    week: { from: new Date(from).toISOString(), to: now.toISOString(), ...week },
    gaps: gapNotes,
    strengths,
    work,
  };
}
