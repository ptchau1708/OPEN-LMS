/**
 * Đổi hàng Postgres (snake_case, schema v2 — docs/SUPABASE_API.md) ↔ kiểu hợp đồng (camelCase).
 * Mọi chỗ đổi tên cột nằm ở file này. Hàm `from*` chấp nhận cả hai kiểu khóa vì RPC trả jsonb có thể
 * đã ở dạng camelCase (get_lesson, get_items, award_bonus…) còn đọc bảng trực tiếp thì là snake_case.
 * CHƯA KIỂM THỬ với Supabase thật.
 */
import type {
  Assignment,
  ClassInfo,
  ContentPackage,
  Course,
  Grade,
  Item,
  LearningEvent,
  Lesson,
  LessonProgress,
  LiveResponse,
  LiveSessionInfo,
  LiveState,
  MascotId,
  Passport,
  Profile,
  RewardEntry,
  Slide,
  Wallet,
} from '@openedu/contracts';
import { levelForXp } from '../rewards';

/** Hàng thô từ PostgREST / RPC: không có kiểu sinh sẵn nên dùng bản ghi chung. */
export type Row = Record<string, unknown>;

/** Lấy giá trị theo tên camelCase hoặc snake_case. */
export function pick<T = unknown>(r: Row | null | undefined, camel: string, snake?: string): T | undefined {
  if (!r) return undefined;
  if (r[camel] !== undefined && r[camel] !== null) return r[camel] as T;
  const s = snake ?? camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const v = r[s];
  return v === null ? undefined : (v as T | undefined);
}

function str(r: Row, camel: string, snake?: string): string {
  const v = pick(r, camel, snake);
  return v === undefined ? '' : String(v);
}
function optStr(r: Row, camel: string, snake?: string): string | undefined {
  const v = pick(r, camel, snake);
  return v === undefined ? undefined : String(v);
}
function num(r: Row, camel: string, snake?: string, d = 0): number {
  const v = Number(pick(r, camel, snake));
  return Number.isFinite(v) ? v : d;
}
function arr<T>(r: Row, camel: string, snake?: string): T[] {
  const v = pick(r, camel, snake);
  return Array.isArray(v) ? (v as T[]) : [];
}
/** Bỏ các khóa undefined để đối tượng gọn (so sánh trong kiểm thử, JSON). */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/* ---------- profiles ---------- */
export function fromProfile(r: Row): Profile {
  return compact({
    id: str(r, 'id'),
    role: str(r, 'role') as Profile['role'],
    name: str(r, 'name'),
    username: optStr(r, 'username'),
    grade: pick<number>(r, 'grade') as Grade | undefined,
    classId: optStr(r, 'classId'),
    avatarMascot: (optStr(r, 'avatarMascot') ?? 'nghe') as MascotId,
    avatarColor: optStr(r, 'avatarColor') ?? '#20a974',
    settings: pick(r, 'settings') as Profile['settings'],
    externalCode: optStr(r, 'externalCode'),
  });
}

/* ---------- classes ---------- */
/** r: classes + class_members(user_id, role, team_id) + class_teams(id, name, color). */
export function fromClass(r: Row): ClassInfo {
  const members = arr<Row>(r, 'classMembers', 'class_members');
  const teams = arr<Row>(r, 'classTeams', 'class_teams');
  const students = members.filter((m) => (optStr(m, 'role') ?? 'student') === 'student');
  return {
    id: str(r, 'id'),
    name: str(r, 'name'),
    grade: num(r, 'grade', undefined, 1) as Grade,
    teacherId: str(r, 'teacherId'),
    studentIds: students.map((m) => str(m, 'userId')),
    teams: teams.map((t) => ({
      id: str(t, 'id'),
      name: str(t, 'name'),
      color: optStr(t, 'color') ?? '#2f7bf6',
      studentIds: students.filter((m) => optStr(m, 'teamId') === str(t, 'id')).map((m) => str(m, 'userId')),
    })),
  };
}

/* ---------- items ---------- */
export function fromItem(r: Row): Item {
  const embedded = arr<Row>(r, 'itemSkills');
  const skills = arr<string>(r, 'skills').length
    ? arr<string>(r, 'skills')
    : embedded
        .slice()
        .sort((a, b) => num(a, 'position') - num(b, 'position'))
        .map((x) => str(x, 'skillCode'));
  const item = compact({
    id: str(r, 'id'),
    type: str(r, 'type'),
    grade: num(r, 'grade', undefined, 1) as Grade,
    subject: str(r, 'subject'),
    skill: optStr(r, 'skill'),
    skills: skills.length ? skills : undefined,
    difficulty: optStr(r, 'difficulty'),
    prompt: (pick(r, 'prompt') ?? { text: '' }) as Item['prompt'],
    payload: pick(r, 'payload') ?? {},
    key: pick(r, 'key'),
    hint: optStr(r, 'hint'),
    explanation: optStr(r, 'explanation'),
    stars: pick<number>(r, 'stars'),
    tags: pick<string[]>(r, 'tags'),
    updatedAt: optStr(r, 'updatedAt'),
  }) as unknown as Item;
  return restoreChoiceMisconceptions(item);
}

type ChoiceList = { id: string; misconception?: string }[];
function choiceLists(payload: Row): ChoiceList[] {
  return ['options', 'items', 'tokens', 'words', 'left', 'right', 'bank'].map((k) => payload[k]).filter((v): v is ChoiceList => Array.isArray(v));
}

/** GV đọc item có key: đưa key.misconceptions[idLựaChọn] về lại Choice.misconception (cho trình soạn câu hỏi). */
function restoreChoiceMisconceptions(it: Item): Item {
  const table = (it.key as { misconceptions?: Record<string, string> } | null | undefined)?.misconceptions;
  if (!table) return it;
  for (const list of choiceLists((it.payload ?? {}) as Row)) for (const c of list) if (!c.misconception && table[c.id]) c.misconception = table[c.id];
  return it;
}

/**
 * Item → tham số p_item của save_item (jsonb camelCase, server tách key sang item_keys).
 * `Choice.misconception` (nằm trong payload — HS đọc được) được chuyển sang `key.misconceptions` để không lộ
 * lựa chọn nào sai. `skills` lưu riêng vào bảng item_skills (SupabaseDataSource.saveItem).
 */
export function toItemJson(it: Item): Row {
  const j = JSON.parse(JSON.stringify(it)) as Row;
  delete j.skills;
  const moved: Record<string, string> = {};
  for (const list of choiceLists((j.payload ?? {}) as Row))
    for (const c of list) {
      if (c.misconception) moved[c.id] = c.misconception;
      delete c.misconception;
    }
  if (Object.keys(moved).length && j.key && typeof j.key === 'object') {
    const key = j.key as Row;
    key.misconceptions = { ...moved, ...((key.misconceptions as Record<string, string> | undefined) ?? {}) };
  }
  return j;
}

/* ---------- lessons ---------- */
/** lesson_slides(id, lesson_id, position, layout, data) → Slide (data = phần còn lại của Slide). */
export function fromSlideRow(r: Row): Slide {
  const data = (pick<Row>(r, 'data') ?? {}) as Partial<Slide>;
  return { ...data, id: str(r, 'id'), layout: str(r, 'layout') as Slide['layout'] } as Slide;
}

export function toSlideRow(lessonId: string, s: Slide, position: number): Row {
  const { id, layout, ...data } = s;
  return { id, lesson_id: lessonId, position, layout, data };
}

/** Hàng lessons (có thể kèm lesson_slides) hoặc jsonb Lesson từ get_lesson. */
export function fromLesson(r: Row): Lesson {
  const rawSlides = pick<unknown[]>(r, 'slides') ?? pick<unknown[]>(r, 'lessonSlides', 'lesson_slides') ?? [];
  const slides = (rawSlides as Row[])
    .slice()
    .sort((a, b) => num(a, 'position') - num(b, 'position'))
    .map((s) => ('data' in s ? fromSlideRow(s) : (s as unknown as Slide)));
  return compact({
    id: str(r, 'id'),
    title: str(r, 'title'),
    subject: str(r, 'subject') as Lesson['subject'],
    grade: num(r, 'grade', undefined, 1) as Grade,
    description: optStr(r, 'description'),
    mascot: optStr(r, 'mascot') as MascotId | undefined,
    slides,
    ownerId: str(r, 'ownerId'),
    status: (optStr(r, 'status') ?? 'draft') as Lesson['status'],
    minutes: pick<number>(r, 'minutes'),
    updatedAt: str(r, 'updatedAt'),
  });
}

export function toLessonJson(l: Lesson): Row {
  return JSON.parse(JSON.stringify(l)) as Row;
}

/* ---------- courses ---------- */
/** courses + course_nodes(lesson_id, position). CHƯA RÕ cột của course_nodes — giả định (course_id, lesson_id, position). */
export function fromCourse(r: Row): Course {
  const nodes = arr<Row>(r, 'courseNodes', 'course_nodes')
    .slice()
    .sort((a, b) => num(a, 'position') - num(b, 'position'));
  const lessonIds = nodes.length ? nodes.map((n) => str(n, 'lessonId')).filter(Boolean) : arr<string>(r, 'lessonIds');
  return { id: str(r, 'id'), title: str(r, 'title'), subject: str(r, 'subject') as Course['subject'], grade: num(r, 'grade', undefined, 1) as Grade, lessonIds };
}

/* ---------- packages ---------- */
export function fromPackage(r: Row): ContentPackage {
  return {
    id: str(r, 'id'),
    kind: str(r, 'kind') as ContentPackage['kind'],
    title: str(r, 'title'),
    baseUrl: str(r, 'baseUrl'),
    entry: str(r, 'entry'),
    ownerId: str(r, 'ownerId'),
    createdAt: str(r, 'createdAt'),
  };
}
export function toPackageRow(p: ContentPackage): Row {
  return { id: p.id, kind: p.kind, title: p.title, base_url: p.baseUrl, entry: p.entry, owner_id: p.ownerId, created_at: p.createdAt };
}

/* ---------- assignments ---------- */
export function fromAssignment(r: Row): Assignment {
  return compact({
    id: str(r, 'id'),
    targetType: str(r, 'targetType') as Assignment['targetType'],
    targetId: str(r, 'targetId'),
    title: str(r, 'title'),
    classId: str(r, 'classId'),
    studentIds: arr<string>(r, 'studentIds'),
    openAt: str(r, 'openAt'),
    dueAt: optStr(r, 'dueAt'),
    createdBy: str(r, 'createdBy'),
    latePolicy: (optStr(r, 'latePolicy') as Assignment['latePolicy']) ?? undefined,
    parentId: optStr(r, 'parentId'),
    round: typeof r.round === 'number' ? r.round : undefined,
  });
}
export function toAssignmentRow(a: Omit<Assignment, 'id'> & { id?: string }): Row {
  const row: Row = {
    target_type: a.targetType,
    target_id: a.targetId,
    title: a.title,
    class_id: a.classId,
    student_ids: a.studentIds ?? [],
    open_at: a.openAt,
    due_at: a.dueAt ?? null,
    created_by: a.createdBy,
  };
  // Cột mới (SQL 13) — chỉ gửi khi có, để bản CSDL chưa nâng cấp vẫn giao bài được như cũ.
  if (a.latePolicy && a.latePolicy !== 'allow') row.late_policy = a.latePolicy;
  if (a.parentId) row.parent_id = a.parentId;
  if (a.round && a.round > 1) row.round = a.round;
  if (a.id) row.id = a.id;
  return row;
}

/* ---------- lesson_progress ---------- */
export function fromProgress(r: Row): LessonProgress {
  return compact({
    userId: str(r, 'userId'),
    lessonId: str(r, 'lessonId'),
    slideIndex: num(r, 'slideIndex'),
    completedSlides: arr<string>(r, 'completedSlides'),
    answers: (pick(r, 'answers') ?? {}) as LessonProgress['answers'],
    starsEarned: num(r, 'starsEarned'),
    completedAt: optStr(r, 'completedAt'),
    updatedAt: str(r, 'updatedAt'),
  });
}
export function toProgressRow(p: LessonProgress): Row {
  return {
    user_id: p.userId,
    lesson_id: p.lessonId,
    slide_index: p.slideIndex,
    completed_slides: p.completedSlides,
    answers: p.answers,
    stars_earned: p.starsEarned,
    completed_at: p.completedAt ?? null,
    updated_at: p.updatedAt,
  };
}

/* ---------- learning_events ---------- */
export function fromEvent(r: Row): LearningEvent {
  return compact({
    id: str(r, 'id'),
    userId: str(r, 'userId'),
    verb: str(r, 'verb') as LearningEvent['verb'],
    objectType: str(r, 'objectType') as LearningEvent['objectType'],
    objectId: str(r, 'objectId'),
    lessonId: optStr(r, 'lessonId'),
    assignmentId: optStr(r, 'assignmentId'),
    liveSessionId: optStr(r, 'liveSessionId'),
    result: pick(r, 'result') as LearningEvent['result'],
    at: str(r, 'at'),
  });
}
export function toEventRow(e: Omit<LearningEvent, 'id' | 'at'>): Row {
  return {
    user_id: e.userId,
    verb: e.verb,
    object_type: e.objectType,
    object_id: e.objectId,
    lesson_id: e.lessonId ?? null,
    assignment_id: e.assignmentId ?? null,
    live_session_id: e.liveSessionId ?? null,
    result: e.result ?? null,
    // RPC record_event đọc khóa camelCase (bản cũ chỉ đọc camelCase — xem migration 20261113000010).
    objectType: e.objectType,
    objectId: e.objectId,
    lessonId: e.lessonId ?? null,
    assignmentId: e.assignmentId ?? null,
    ...(e.clientEventId ? { clientEventId: e.clientEventId } : {}),
    ...(e.offline ? { offline: true } : {}),
    ...((e as { clientAt?: string }).clientAt ? { clientAt: (e as { clientAt?: string }).clientAt } : {}),
  };
}

/* ---------- reward_ledger, wallets, passports ---------- */
export function fromReward(r: Row): RewardEntry {
  return compact({
    id: str(r, 'id'),
    userId: str(r, 'userId'),
    stars: num(r, 'stars'),
    coins: num(r, 'coins'),
    xp: num(r, 'xp'),
    reason: str(r, 'reason'),
    sourceType: str(r, 'sourceType') as RewardEntry['sourceType'],
    sourceId: optStr(r, 'sourceId'),
    at: str(r, 'at'),
  });
}

/** VIEW wallets hoặc jsonb Wallet từ RPC. Thiếu level thì tự tính từ xp. */
export function fromWallet(r: Row | null | undefined, userId: string): Wallet {
  if (!r) return { userId, stars: 0, coins: 0, xp: 0, level: 1, streakDays: 0 };
  const xp = num(r, 'xp');
  return {
    userId: optStr(r, 'userId') ?? userId,
    stars: num(r, 'stars'),
    coins: num(r, 'coins'),
    xp,
    level: num(r, 'level', undefined, levelForXp(xp)) || levelForXp(xp),
    streakDays: num(r, 'streakDays'),
  };
}

export function fromPassport(r: Row | null | undefined, userId: string): Passport {
  if (!r) return { userId, unlocked: ['nghe'], companion: 'nghe' };
  const unlocked = arr<MascotId>(r, 'unlocked');
  return { userId: optStr(r, 'userId') ?? userId, unlocked: unlocked.length ? unlocked : ['nghe'], companion: (optStr(r, 'companion') ?? 'nghe') as MascotId };
}

/* ---------- live ---------- */
export function fromLiveInfo(r: Row | null | undefined): LiveSessionInfo | null {
  if (!r) return null;
  const sessionId = optStr(r, 'sessionId') ?? optStr(r, 'id');
  if (!sessionId) return null;
  return { sessionId, pin: str(r, 'pin'), lessonId: str(r, 'lessonId'), lessonTitle: str(r, 'lessonTitle') };
}

export function fromLiveResponse(r: Row): LiveResponse {
  return compact({
    sessionId: str(r, 'sessionId'),
    userId: str(r, 'userId'),
    itemId: str(r, 'itemId'),
    slideIndex: num(r, 'slideIndex'),
    response: pick(r, 'response') as LiveResponse['response'],
    correct: pick<boolean>(r, 'correct'),
    score: pick<number>(r, 'score'),
    at: str(r, 'at'),
  });
}

/** live_sessions.state (jsonb) — có thể rỗng nếu start_live chưa khởi tạo. */
export function fromLiveStateColumn(v: unknown): LiveState | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as LiveState;
  return typeof s.sessionId === 'string' && s.sessionId ? s : null;
}
