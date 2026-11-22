/**
 * Thi đua, điểm danh, bài làm trong hồ sơ, gợi ý nhận xét TT27 — THUẦN (demo + Supabase client cùng dùng).
 */
import {
  SKILL_BY_CODE,
  SUBJECTS,
  TT27_TERM_LABEL,
  schoolYearOf,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceSummary,
  type Behavior,
  type BehaviorLog,
  type BehaviorSummary,
  type ClassInfo,
  type ClassLeaderboard,
  type Grade,
  type LeaderboardRow,
  type Profile,
  type SkillMastery,
  type StudentWorkEntry,
  type StudentWorkSummary,
  type SubjectId,
  type SubmissionDetail,
  type Tt27Competency,
  type Tt27Level,
  type Tt27Quality,
  type Tt27Rating,
  type Tt27Suggestion,
  type Tt27TermId,
} from '@openedu/contracts';
import { mergeFinal } from './assess/rules';
import { vnDayKey } from './mastery';
import { lowerFirst, shortOf } from './suggestions';

const DAY = 86_400_000;

/* ======================= thời gian (giờ Việt Nam) ======================= */
/** 0 giờ (UTC+7) thứ Hai của tuần chứa `now` → ISO. */
export function vnWeekStart(now: Date): string {
  const key = vnDayKey(now.toISOString());
  const midnight = Date.parse(`${key}T00:00:00+07:00`);
  const dow = new Date(midnight + 7 * 3_600_000).getUTCDay(); // 0 = CN
  const back = (dow + 6) % 7;
  return new Date(midnight - back * DAY).toISOString();
}

/* ======================= hành vi mặc định ======================= */
export const DEFAULT_BEHAVIORS: Omit<Behavior, 'classId'>[] = [
  { id: 'bh-phat-bieu', label: 'Hăng hái phát biểu', points: 1, icon: '🙋', kind: 'positive' },
  { id: 'bh-giup-ban', label: 'Giúp đỡ bạn', points: 2, icon: '🤝', kind: 'positive' },
  { id: 'bh-trat-tu', label: 'Giữ trật tự', points: 1, icon: '🤫', kind: 'positive' },
  { id: 'bh-hoan-thanh', label: 'Hoàn thành bài tập', points: 1, icon: '✅', kind: 'positive' },
  { id: 'bh-vo-sach', label: 'Vở sạch, chữ đẹp', points: 1, icon: '✍️', kind: 'positive' },
  { id: 'bh-trung-thuc', label: 'Trung thực', points: 2, icon: '💎', kind: 'positive' },
  { id: 'bh-quen-do', label: 'Quên đồ dùng học tập', points: -1, icon: '🎒', kind: 'needs-work' },
  { id: 'bh-noi-chuyen', label: 'Nói chuyện riêng', points: -1, icon: '💬', kind: 'needs-work' },
  { id: 'bh-chua-lam-bai', label: 'Chưa làm bài tập', points: -1, icon: '📒', kind: 'needs-work' },
];

export function defaultBehaviors(classId: string): Behavior[] {
  return DEFAULT_BEHAVIORS.map((b) => ({ ...b, classId }));
}

/** Lớp 1–3 thi đua theo tổ trước. */
export function leaderboardMode(grade: Grade | undefined): 'team' | 'student' {
  return grade && grade <= 3 ? 'team' : 'student';
}

export function classLeaderboard(input: { cls: ClassInfo; students: Pick<Profile, 'id' | 'name'>[]; logs: BehaviorLog[]; from: string; to: string }): ClassLeaderboard {
  const { cls, logs } = input;
  const f = Date.parse(input.from);
  const t = Date.parse(input.to);
  const inRange = logs.filter((l) => l.classId === cls.id && Date.parse(l.at) >= f && Date.parse(l.at) <= t);
  const row = (id: string, name: string, color?: string): LeaderboardRow => ({ id, name, ...(color ? { color } : {}), points: 0, positive: 0, needsWork: 0 });
  const byStudent = new Map(input.students.map((s) => [s.id, row(s.id, s.name)]));
  const teamOf = new Map<string, string>();
  for (const tm of cls.teams) for (const sid of tm.studentIds) teamOf.set(sid, tm.id);
  const byTeam = new Map(cls.teams.map((tm) => [tm.id, row(tm.id, tm.name, tm.color)]));
  for (const l of inRange) {
    const add = (r: LeaderboardRow | undefined) => {
      if (!r) return;
      r.points += l.points;
      if (l.points > 0) r.positive += l.points;
      else r.needsWork += -l.points;
    };
    add(byStudent.get(l.studentId));
    add(byTeam.get(l.teamId ?? teamOf.get(l.studentId) ?? ''));
  }
  const sort = (a: LeaderboardRow, b: LeaderboardRow) => b.points - a.points || b.positive - a.positive || a.name.localeCompare(b.name, 'vi');
  return {
    classId: cls.id,
    from: input.from,
    to: input.to,
    mode: leaderboardMode(cls.grade),
    teams: [...byTeam.values()].sort(sort),
    students: [...byStudent.values()].sort(sort),
  };
}

export function behaviorSummary(logs: BehaviorLog[], behaviors: Behavior[], now: Date): BehaviorSummary | null {
  if (!logs.length) return null;
  const by = new Map(behaviors.map((b) => [b.id, b]));
  const week = logs.filter((l) => Date.parse(l.at) >= now.getTime() - 7 * DAY);
  const month = logs.filter((l) => Date.parse(l.at) >= now.getTime() - 30 * DAY);
  const top = (kind: Behavior['kind']) => {
    const c = new Map<string, number>();
    for (const l of month) {
      const b = by.get(l.behaviorId);
      if (b?.kind === kind) c.set(b.label, (c.get(b.label) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  return {
    weekPoints: week.reduce((a, l) => a + l.points, 0),
    weekPositive: week.filter((l) => l.points > 0).reduce((a, l) => a + l.points, 0),
    weekNeedsWork: week.filter((l) => l.points < 0).reduce((a, l) => a - l.points, 0),
    topPositive: top('positive'),
    topNeedsWork: top('needs-work'),
    recent: [...logs]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10)
      .map((l) => {
        const b = by.get(l.behaviorId);
        return { at: l.at, label: b?.label ?? 'Thầy cô ghi nhận', icon: b?.icon ?? '⭐', points: l.points, ...(l.note ? { note: l.note } : {}) };
      }),
  };
}

export function attendanceSummary(records: AttendanceRecord[], studentId: string, now: Date): AttendanceSummary | null {
  const from = vnDayKey(new Date(now.getTime() - 30 * DAY).toISOString());
  const mine = records
    .filter((r) => r.date >= from && r.entries[studentId])
    .map((r) => ({ date: r.date, status: r.entries[studentId] as AttendanceStatus }))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!mine.length) return null;
  const n = (s: AttendanceStatus) => mine.filter((m) => m.status === s).length;
  const present = n('co-mat');
  const late = n('muon');
  return {
    days: mine.length,
    present,
    late,
    excused: n('vang-co-phep'),
    unexcused: n('vang-khong-phep'),
    rate: Math.round(((present + late) / mine.length) * 100) / 100,
    recentAbsences: mine.filter((m) => m.status !== 'co-mat').slice(0, 5),
  };
}

/* ======================= bài làm trong hồ sơ ======================= */
export function workEntryOf(d: SubmissionDetail): StudentWorkEntry | null {
  if (d.status !== 'approved' || !d.grade) return null;
  const final = d.final ?? mergeFinal(d.grade, d.review);
  return {
    submissionId: d.id,
    taskId: d.taskId,
    title: d.taskTitle ?? d.task?.title ?? 'Bài làm',
    subject: d.task?.subject ?? 'khac',
    at: d.review?.at ?? d.updatedAt ?? d.createdAt,
    level: final.level,
    total: final.total,
    max: final.max,
    comment: final.feedbackStudent,
    parentComment: final.feedbackParent,
    ...(final.feedbackTeacher ? { teacherComment: final.feedbackTeacher } : {}),
    ...(d.images[0]?.url ? { thumbnail: d.images[0].url } : {}),
    kind: d.kind,
    skills: d.grade.skills.filter((s) => s.evidence !== 'chua-ro').map((s) => s.code),
    edited: d.review?.decision === 'edited',
    ...(d.grade.mock ? { mock: true } : {}),
  };
}

export function workSummary(entries: StudentWorkEntry[], pending: number): StudentWorkSummary {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  const counts: Record<Tt27Level, number> = { T: 0, H: 0, C: 0 };
  for (const e of sorted) counts[e.level]++;
  let trend: StudentWorkSummary['trend'] = null;
  if (sorted.length >= 3) {
    const r = (e: StudentWorkEntry) => (e.max > 0 ? e.total / e.max : 0);
    const recent = sorted.slice(0, 2);
    const before = sorted.slice(2, 4);
    const d = recent.reduce((a, e) => a + r(e), 0) / recent.length - before.reduce((a, e) => a + r(e), 0) / before.length;
    trend = d >= 0.1 ? 'tien-bo' : d <= -0.1 ? 'giam' : 'on-dinh';
  }
  return { latest: sorted.slice(0, 6), counts, trend, pending };
}

/* ======================= gợi ý TT27 ======================= */
const LEVEL_WORD: Record<Tt27Level, string> = { T: 'Hoàn thành tốt', H: 'Hoàn thành', C: 'Chưa hoàn thành' };
const WORK_SCORE: Record<Tt27Level, number> = { T: 1, H: 0.65, C: 0.3 };
const QUALITY_BEHAVIORS: Record<Tt27Quality, string[]> = {
  'yeu-nuoc': [],
  'nhan-ai': ['bh-giup-ban'],
  'cham-chi': ['bh-phat-bieu', 'bh-hoan-thanh', 'bh-vo-sach', 'bh-chua-lam-bai'],
  'trung-thuc': ['bh-trung-thuc'],
  'trach-nhiem': ['bh-trat-tu', 'bh-quen-do', 'bh-noi-chuyen'],
};

export interface SuggestTt27Input {
  student: Profile;
  classId: string;
  termId: Tt27TermId;
  schoolYear?: string;
  now: Date;
  masteries: SkillMastery[];
  works: StudentWorkEntry[];
  behaviorLogs: BehaviorLog[];
  attendance?: AttendanceSummary | null;
  /** Điểm bài kiểm tra định kì (Phase 6, exam/*) — lớp 4–5: điền `score` (Điểm KTĐK) cho môn, đúng kì `termId`. */
  examScores?: { subject: SubjectId; termId?: Tt27TermId; score10: number; title: string; at: string }[];
}

function levelFromScore(x: number): Tt27Level {
  return x >= 0.8 ? 'T' : x >= 0.5 ? 'H' : 'C';
}

function rateFromLevel(l: Tt27Level | undefined): Tt27Rating {
  return l === 'T' ? 'T' : l === 'C' ? 'C' : 'Đ';
}

function joinVi(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} và ${list[list.length - 1]}`;
}

/**
 * Soạn nháp đánh giá TT27 cho GV sửa: mức từng môn từ thành thạo kĩ năng (60%) + bài làm đã duyệt (40%),
 * nhận xét kiểu giáo viên (điểm mạnh → điều cần rèn), phẩm chất từ thi đua, năng lực từ học tập.
 */
export function suggestTt27(input: SuggestTt27Input): Tt27Suggestion {
  const { student, termId, now } = input;
  const grade = student.grade;
  const basis: string[] = [];
  const subjects: Tt27Suggestion['subjects'] = {};
  const subjectIds = new Set<SubjectId>();
  for (const m of input.masteries) {
    const sk = SKILL_BY_CODE[m.skillCode];
    if (sk && (!grade || sk.grade <= grade)) subjectIds.add(sk.subject);
  }
  for (const w of input.works) subjectIds.add(w.subject);
  // Điểm KTĐK chỉ cho lớp 4–5 (TT27): bài mới nhất của đúng kì.
  const examOf = new Map<SubjectId, { score10: number; title: string }>();
  if (grade && grade >= 4) {
    for (const x of (input.examScores ?? []).filter((e) => e.termId === termId).sort((a, b) => b.at.localeCompare(a.at))) {
      if (!examOf.has(x.subject)) examOf.set(x.subject, x);
      subjectIds.add(x.subject);
    }
  }
  for (const subject of [...subjectIds].sort()) {
    // Chỉ kĩ năng đủ bằng chứng (≥ 3 lần làm); bài viết đã có trong `ws`.
    const ms = input.masteries.filter((m) => SKILL_BY_CODE[m.skillCode]?.subject === subject && m.level !== 'chua-hoc' && m.attempts >= 3);
    const ws = input.works.filter((w) => w.subject === subject);
    const ms01 = ms.length ? ms.reduce((a, m) => a + (m.level === 'vung' ? 1 : m.level === 'dang-hoc' ? 0.65 : 0.25), 0) / ms.length : null;
    const ws01 = ws.length ? ws.reduce((a, w) => a + WORK_SCORE[w.level], 0) / ws.length : null;
    const ex = examOf.get(subject);
    if (ms01 === null && ws01 === null && !ex) continue;
    const score = ms01 !== null && ws01 !== null ? 0.6 * ms01 + 0.4 * ws01 : (ms01 ?? ws01 ?? (ex ? ex.score10 / 10 : 0));
    const level = levelFromScore(score);
    const strong = ms.filter((m) => m.level === 'vung').sort((a, b) => b.p - a.p).slice(0, 2).map((m) => lowerFirst(shortOf(m.skillCode)));
    const weak = ms.filter((m) => m.level === 'can-on').sort((a, b) => a.p - b.p).slice(0, 2).map((m) => lowerFirst(shortOf(m.skillCode)));
    const bestWork = ws.find((w) => w.level === 'T');
    const parts: string[] = [];
    parts.push(`${LEVEL_WORD[level]} nội dung môn học ${TT27_TERM_LABEL[termId].charAt(0).toLowerCase()}${TT27_TERM_LABEL[termId].slice(1)}.`);
    if (strong.length) parts.push(`Em thực hiện tốt ${joinVi(strong)}.`);
    if (bestWork) parts.push(`Bài “${bestWork.title}” làm tốt.`);
    if (weak.length) parts.push(`Cần rèn thêm ${joinVi(weak)}.`);
    else if (level !== 'T') parts.push('Cần cẩn thận hơn khi làm bài và tự kiểm tra lại.');
    subjects[subject] = { level, comment: parts.join(' '), ...(ex ? { score: ex.score10 } : {}) };
    if (ex) basis.push(`${SUBJECTS[subject]?.name ?? subject}: điểm KTĐK ${ex.score10} (“${ex.title}”).`);
    basis.push(
      `${SUBJECTS[subject]?.name ?? subject}: ${ms.length} kĩ năng (vững ${ms.filter((m) => m.level === 'vung').length}, cần ôn ${ms.filter((m) => m.level === 'can-on').length})` +
        (ws.length ? `; ${ws.length} bài viết đã duyệt (${ws.map((w) => w.level).join(', ')})` : '') +
        ` → ${level}.`,
    );
  }

  /* phẩm chất từ thi đua (60 ngày) */
  const since = now.getTime() - 60 * DAY;
  const logs = input.behaviorLogs.filter((l) => Date.parse(l.at) >= since);
  const pointsFor = (ids: string[]) => logs.filter((l) => ids.includes(l.behaviorId)).reduce((a, l) => a + l.points, 0);
  const qualities = {} as Record<Tt27Quality, Tt27Rating>;
  for (const q of Object.keys(QUALITY_BEHAVIORS) as Tt27Quality[]) {
    const ids = QUALITY_BEHAVIORS[q];
    const p = ids.length ? pointsFor(ids) : 0;
    qualities[q] = p >= 4 ? 'T' : p <= -3 ? 'C' : 'Đ';
  }
  const att = input.attendance;
  if (att && att.unexcused >= 3) qualities['trach-nhiem'] = 'C';
  if (logs.length) basis.push(`Thi đua 60 ngày: ${logs.length} lần ghi, tổng ${logs.reduce((a, l) => a + l.points, 0)} điểm.`);
  if (att) basis.push(`Chuyên cần 30 ngày: có mặt ${att.present}/${att.days} buổi, muộn ${att.late}, vắng ${att.excused + att.unexcused}.`);

  /* năng lực */
  const activeDays = new Set(input.masteries.map((m) => m.lastAt?.slice(0, 10)).filter(Boolean)).size;
  const remediated = input.masteries.filter((m) => m.reviewStage > 0).length;
  const comp: Partial<Record<Tt27Competency, Tt27Rating>> = {
    'tu-chu-tu-hoc': activeDays >= 6 || remediated >= 1 ? 'T' : activeDays >= 2 ? 'Đ' : 'C',
    'giao-tiep-hop-tac': pointsFor(['bh-phat-bieu', 'bh-giup-ban']) >= 4 ? 'T' : 'Đ',
    'gqvd-sang-tao': rateFromLevel(subjects.toan?.level),
    'ngon-ngu': rateFromLevel(subjects['tieng-viet']?.level),
    'tinh-toan': rateFromLevel(subjects.toan?.level),
  };
  if (subjects['khoa-hoc'] || subjects.tnxh) comp['khoa-hoc'] = rateFromLevel((subjects['khoa-hoc'] ?? subjects.tnxh)?.level);

  const name = student.name.split(' ').slice(-1)[0] || student.name;
  const tLevels = Object.values(subjects).filter((s) => s?.level === 'T').length;
  const cLevels = Object.entries(subjects).filter(([, s]) => s?.level === 'C').map(([k]) => SUBJECTS[k as SubjectId]?.name ?? k);
  const pos = behaviorSummary(logs, defaultBehaviors(input.classId), now)?.topPositive ?? [];
  const general = [
    `${name} ngoan, ${qualities['cham-chi'] === 'T' ? 'chăm chỉ' : 'có ý thức'} trong học tập.`,
    pos.length ? `Em ${lowerFirst(pos[0])}${pos[1] ? `, ${lowerFirst(pos[1])}` : ''}.` : '',
    tLevels ? `Hoàn thành tốt ${tLevels} môn học.` : '',
    cLevels.length ? `Cần cố gắng thêm ở môn ${joinVi(cLevels)}; cô sẽ cùng em ôn lại.` : 'Tiếp tục phát huy em nhé!',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    studentId: student.id,
    classId: input.classId,
    termId,
    schoolYear: input.schoolYear ?? schoolYearOf(now),
    subjects,
    qualities,
    competencies: comp,
    generalComment: general,
    status: 'draft',
    basis: basis.length ? basis : ['Chưa có dữ liệu học tập — thầy cô tự đánh giá.'],
  };
}
