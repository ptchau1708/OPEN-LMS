/**
 * Ôn thi ở chế độ demo: lưu trong kho localStorage của DemoDataSource (khóa `onthi.*`), chấm trên máy.
 * Nạp mẫu 4 bài luyện khối 5 (onthi/seed.ts) và vài bài làm của các bạn lớp 5A để bảng xếp hạng có dữ liệu.
 */
import {
  ONTHI_GRACE_MS,
  ONTHI_MAX_ITEMS,
  ONTHI_PRACTICE_SIZE,
  uid,
  type AnyResponse,
  type DataSource,
  type Item,
  type ItemType,
  type OnThiBest,
  type OnThiBoard,
  type OnThiCard,
  type OnThiItemResult,
  type OnThiReport,
  type OnThiResult,
  type OnThiSavedAnswer,
  type OnThiService,
  type OnThiSession,
  type OnThiSet,
  type OnThiSetInput,
  type OnThiStyle,
  type Profile,
  type ScoreResult,
} from '@openedu/contracts';
import type { DemoDataSource } from '../demo/DemoDataSource';
import { readJson, writeJson, type KVStorage } from '../storage';
import { compareOnThi, buildCards, orderSets, rankRows, summarize, validateSet } from './scoring';

const K = { meta: 'onthi.meta', sets: 'onthi.sets', attempts: 'onthi.attempts' } as const;
const SEED_V = 1;

interface Attempt {
  id: string;
  setId: string;
  studentId: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  status: 'in-progress' | 'submitted';
  answers: Record<string, OnThiSavedAnswer>;
  score?: number;
  maxScore?: number;
  correct?: number;
  wrong?: number;
  skipped?: number;
  durationMs?: number;
  items?: OnThiItemResult[];
}

type Engine = { score: (i: Item, r: AnyResponse | undefined) => ScoreResult; isComplete: (i: Item, r: AnyResponse | undefined) => boolean };
let engineP: Promise<Engine> | null = null;
function engine(): Promise<Engine> {
  engineP ??= import('@openedu/activity-engine').then((m) => ({ score: m.scoreItem, isComplete: m.isComplete }));
  engineP.catch(() => { engineP = null; });
  return engineP;
}

const friendly = (m: string) => Object.assign(new Error(m), { friendly: true });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const strip = (it: Item): Item => {
  const { key: _k, ...rest } = it as Item & { key?: unknown };
  void _k;
  return rest as Item;
};
const isStaff = (u: Profile) => u.role === 'teacher' || u.role === 'admin';

export class DemoOnThiService implements OnThiService {
  private seeded: Promise<void> | null = null;
  constructor(private ds: DataSource) {}

  private async kv(): Promise<{ s: KVStorage; now: Date }> {
    const { storage, now } = await (this.ds as DemoDataSource).schoolKv();
    if (!this.seeded) this.seeded = this.ensureSeed(storage, now()).catch((e) => { this.seeded = null; throw e; });
    await this.seeded;
    return { s: storage, now: now() };
  }

  private async ensureSeed(s: KVStorage, now: Date): Promise<void> {
    const base = readJson<{ seededAt?: string } | null>(s, 'meta', null)?.seededAt ?? '';
    const meta = readJson<{ v: number; base: string } | null>(s, K.meta, null);
    if (meta && meta.v === SEED_V && meta.base === base) return;
    const { SEED_RUNS, rightAnswer, seedSets, wrongAnswer } = await import('./seed');
    const iso = now.toISOString();
    const sets = seedSets().map((x) => ({ ...x, createdAt: iso, updatedAt: iso }));
    const eng = await engine();
    const attempts: Attempt[] = [];
    for (const [studentId, setId, misses, minutes, agoMin, wrongAt] of SEED_RUNS) {
      const st = sets.find((x) => x.id === setId)!;
      const items = await this.ds.getItems(st.itemIds);
      const answers: Record<string, OnThiSavedAnswer> = {};
      const per = Math.round((minutes * 60_000) / Math.max(1, items.length));
      items.forEach((it, i) => {
        if (i < misses) return; // bỏ qua mấy câu đầu
        answers[it.id] = { response: (wrongAt.includes(i) ? wrongAnswer(it) : null) ?? rightAnswer(it), ms: per };
      });
      const sum = summarize({ style: st.style, points: st.points, items, answers, score: eng.score, isComplete: eng.isComplete });
      const end = new Date(now.getTime() - agoMin * 60_000);
      const durationMs = Math.round(minutes * 60_000);
      attempts.push({
        id: uid('oa'), setId, studentId, startedAt: new Date(end.getTime() - durationMs).toISOString(),
        deadlineAt: new Date(end.getTime() - durationMs + st.minutes * 60_000).toISOString(), submittedAt: end.toISOString(), status: 'submitted', answers,
        score: sum.score, maxScore: sum.maxScore, correct: sum.correct, wrong: sum.wrong, skipped: sum.skipped, durationMs, items: sum.items,
      });
    }
    writeJson(s, K.sets, sets);
    writeJson(s, K.attempts, attempts);
    writeJson(s, K.meta, { v: SEED_V, base });
  }

  private sets(s: KVStorage): OnThiSet[] {
    return readJson<OnThiSet[]>(s, K.sets, []);
  }
  private attempts(s: KVStorage): Attempt[] {
    return readJson<Attempt[]>(s, K.attempts, []);
  }
  private putAttempt(s: KVStorage, a: Attempt): void {
    writeJson(s, K.attempts, [...this.attempts(s).filter((x) => x.id !== a.id), a]);
  }
  private async me(): Promise<Profile> {
    const u = await this.ds.getCurrentUser();
    if (!u) throw friendly('Em đăng nhập lại nhé.');
    return u;
  }
  private async staff(): Promise<Profile> {
    const u = await this.me();
    if (!isStaff(u)) throw friendly('Chỉ thầy/cô dùng được chức năng này.');
    return u;
  }
  private async student(): Promise<Profile> {
    const u = await this.me();
    if (u.role !== 'student' || !u.grade) throw friendly('Trang Ôn thi dành cho học sinh.');
    return u;
  }
  private best(list: Attempt[], set: OnThiSet): OnThiBest | undefined {
    const done = list.filter((a) => a.status === 'submitted' && a.score !== undefined).map((a) => this.bestOf(a, set));
    return done.sort(compareOnThi)[0];
  }
  private bestOf(a: Attempt, set: OnThiSet): OnThiBest {
    return { attemptId: a.id, score: a.score ?? 0, durationMs: a.durationMs ?? 0, wrong: a.wrong ?? 0, passed: (a.score ?? 0) >= set.passScore, at: a.submittedAt ?? a.startedAt };
  }
  /** Bài quá giờ chưa nộp → nộp hộ. */
  private async finalizeOverdue(s: KVStorage, now: Date): Promise<void> {
    for (const a of this.attempts(s)) {
      if (a.status === 'in-progress' && Date.parse(a.deadlineAt) + ONTHI_GRACE_MS < now.getTime()) await this.finalize(s, a, now);
    }
  }
  private async finalize(s: KVStorage, a: Attempt, now: Date): Promise<Attempt> {
    const set = this.sets(s).find((x) => x.id === a.setId);
    if (!set) throw friendly('Không tìm thấy bài luyện này.');
    const items = await this.ds.getItems(set.itemIds);
    const eng = await engine();
    const sum = summarize({ style: set.style, points: set.points, items, answers: a.answers, score: eng.score, isComplete: eng.isComplete });
    const end = Math.min(now.getTime(), Date.parse(a.deadlineAt));
    const done: Attempt = {
      ...a, status: 'submitted', submittedAt: new Date(Math.max(Date.parse(a.startedAt), end)).toISOString(),
      score: sum.score, maxScore: sum.maxScore, correct: sum.correct, wrong: sum.wrong, skipped: sum.skipped,
      durationMs: Math.max(0, end - Date.parse(a.startedAt)), items: sum.items,
    };
    this.putAttempt(s, done);
    return done;
  }
  private async gradeStudents(grade: number): Promise<Profile[]> {
    const classes = (await this.ds.listClasses()).filter((c) => c.grade === grade);
    const lists = await Promise.all(classes.map((c) => this.ds.listStudents(c.id)));
    return lists.flat();
  }

  /* ---------------- thầy/cô ---------------- */
  async listSets(filter: { style?: OnThiStyle; grade?: number } = {}): Promise<OnThiSet[]> {
    await this.staff();
    const { s } = await this.kv();
    const all = this.attempts(s);
    return orderSets(this.sets(s).filter((x) => (!filter.style || x.style === filter.style) && (!filter.grade || x.grade === filter.grade)))
      .map((x) => ({ ...x, done: new Set(all.filter((a) => a.setId === x.id && a.status === 'submitted').map((a) => a.studentId)).size }));
  }
  async saveSet(input: OnThiSetInput): Promise<OnThiSet> {
    const me = await this.staff();
    const { s, now } = await this.kv();
    const bad = validateSet(input, ONTHI_MAX_ITEMS);
    if (bad) throw friendly(bad);
    const items = await this.ds.getItems(input.itemIds);
    if (items.length !== input.itemIds.length) throw friendly('Có câu hỏi không còn trong ngân hàng.');
    if (items.some((i) => i.grade !== input.grade)) throw friendly(`Mọi câu hỏi phải thuộc lớp ${input.grade}.`);
    const list = this.sets(s);
    const old = input.id ? list.find((x) => x.id === input.id) : undefined;
    if (old && old.createdBy && old.createdBy !== me.id && me.role !== 'admin') throw friendly('Chỉ thầy/cô tạo bài này mới sửa được.');
    const iso = now.toISOString();
    const { done: _d, ...clean } = input as OnThiSetInput & { done?: number };
    void _d;
    const out: OnThiSet = {
      ...clean, id: old?.id ?? uid('ots'), title: input.title.trim(),
      createdBy: old?.createdBy ?? me.id, createdByName: old?.createdByName ?? me.name, createdAt: old?.createdAt ?? iso, updatedAt: iso,
    };
    writeJson(s, K.sets, [...list.filter((x) => x.id !== out.id), out]);
    return clone(out);
  }
  async deleteSet(id: string): Promise<void> {
    const me = await this.staff();
    const { s } = await this.kv();
    const old = this.sets(s).find((x) => x.id === id);
    if (!old) return;
    if (old.createdBy && old.createdBy !== me.id && me.role !== 'admin') throw friendly('Chỉ thầy/cô tạo bài này mới xoá được.');
    writeJson(s, K.sets, this.sets(s).filter((x) => x.id !== id));
    writeJson(s, K.attempts, this.attempts(s).filter((a) => a.setId !== id));
  }
  async report(setId: string): Promise<OnThiReport> {
    const me = await this.staff();
    const { s, now } = await this.kv();
    await this.finalizeOverdue(s, now);
    const set = this.sets(s).find((x) => x.id === setId);
    if (!set) throw friendly('Không tìm thấy bài luyện này.');
    const classes = (await this.ds.listClasses()).filter((c) => c.grade === set.grade);
    const full = me.role === 'admin' || set.createdBy === me.id;
    const mine = full ? classes : classes.filter((c) => c.teacherId === me.id);
    const students = (await Promise.all(mine.map(async (c) => (await this.ds.listStudents(c.id)).map((p) => ({ p, c }))))).flat();
    const all = this.attempts(s).filter((a) => a.setId === setId);
    const items = await this.ds.getItems(set.itemIds);
    const tally = new Map(items.map((i) => [i.id, { itemId: i.id, type: i.type as ItemType, tried: 0, correct: 0 }]));
    const rows = students.map(({ p, c }) => {
      const list = all.filter((a) => a.studentId === p.id);
      const best = this.best(list, set);
      if (best) {
        const a = list.find((x) => x.id === best.attemptId);
        for (const r of a?.items ?? []) {
          const t = tally.get(r.itemId);
          if (t && r.answered) { t.tried++; if (r.correct) t.correct++; }
        }
      }
      return { studentId: p.id, name: p.name, classId: c.id, className: c.name, attempts: list.filter((a) => a.status === 'submitted').length, ...(best ? { best } : {}) };
    });
    return { set: clone(set), students: rows, items: [...tally.values()] };
  }

  /* ---------------- học sinh ---------------- */
  private visibleSets(s: KVStorage, me: Profile, style?: OnThiStyle): OnThiSet[] {
    return this.sets(s).filter((x) => x.status === 'published' && x.grade === me.grade && (!style || x.style === style));
  }
  async myCards(style: OnThiStyle): Promise<OnThiCard[]> {
    const me = await this.student();
    const { s, now } = await this.kv();
    await this.finalizeOverdue(s, now);
    const sets = this.visibleSets(s, me, style);
    const mine = this.attempts(s).filter((a) => a.studentId === me.id);
    const setOf = new Map(sets.map((x) => [x.id, x]));
    return buildCards(
      sets,
      (id) => this.best(mine.filter((a) => a.setId === id), setOf.get(id)!),
      (id) => mine.filter((a) => a.setId === id && a.status === 'submitted').length,
      (id) => {
        const a = mine.find((x) => x.setId === id && x.status === 'in-progress');
        return a ? { attemptId: a.id, deadlineAt: a.deadlineAt } : undefined;
      },
    );
  }
  async start(setId: string): Promise<OnThiSession> {
    const me = await this.student();
    const { s, now } = await this.kv();
    await this.finalizeOverdue(s, now);
    const set = this.visibleSets(s, me).find((x) => x.id === setId);
    if (!set) throw friendly('Không tìm thấy bài luyện này.');
    const card = (await this.myCards(set.style)).find((c) => c.setId === setId);
    let a = this.attempts(s).find((x) => x.setId === setId && x.studentId === me.id && x.status === 'in-progress');
    if (!a) {
      if (card?.locked) throw friendly(`Em cần đạt bài "${card.lockedBy}" trước nhé.`);
      a = {
        id: uid('oa'), setId, studentId: me.id, startedAt: now.toISOString(),
        deadlineAt: new Date(now.getTime() + set.minutes * 60_000).toISOString(), submittedAt: null, status: 'in-progress', answers: {},
      };
      this.putAttempt(s, a);
    }
    const items = (await this.ds.getItems(set.itemIds)).map(strip);
    return {
      attemptId: a.id, setId, style: set.style, title: set.title, minutes: set.minutes, points: set.points,
      maxScore: Math.round(set.itemIds.length * set.points * 100) / 100, passScore: set.passScore,
      startedAt: a.startedAt, deadlineAt: a.deadlineAt, serverNow: now.toISOString(), items, answers: clone(a.answers),
    };
  }
  async saveAnswer(attemptId: string, itemId: string, answer: OnThiSavedAnswer): Promise<void> {
    const me = await this.student();
    const { s, now } = await this.kv();
    const a = this.attempts(s).find((x) => x.id === attemptId && x.studentId === me.id);
    if (!a || a.status !== 'in-progress') throw friendly('Bài này đã nộp rồi.');
    if (Date.parse(a.deadlineAt) + ONTHI_GRACE_MS < now.getTime()) throw friendly('Đã hết giờ làm bài.');
    const set = this.sets(s).find((x) => x.id === a.setId);
    if (!set?.itemIds.includes(itemId)) throw friendly('Câu này không có trong bài.');
    this.putAttempt(s, { ...a, answers: { ...a.answers, [itemId]: { response: answer.response ?? null, ms: Math.max(0, Math.round(answer.ms)) } } });
  }
  async submit(attemptId: string): Promise<OnThiResult> {
    const me = await this.student();
    const { s, now } = await this.kv();
    const a = this.attempts(s).find((x) => x.id === attemptId && x.studentId === me.id);
    if (!a) throw friendly('Không tìm thấy bài làm.');
    const prevBest = this.best(this.attempts(s).filter((x) => x.setId === a.setId && x.studentId === me.id && x.id !== a.id), this.sets(s).find((x) => x.id === a.setId)!);
    const done = a.status === 'submitted' ? a : await this.finalize(s, a, now);
    return this.resultOf(s, done, prevBest);
  }
  async result(attemptId: string): Promise<OnThiResult> {
    const me = await this.me();
    const { s } = await this.kv();
    const a = this.attempts(s).find((x) => x.id === attemptId && (x.studentId === me.id || isStaff(me)));
    if (!a || a.status !== 'submitted') throw friendly('Bài này chưa nộp.');
    return this.resultOf(s, a);
  }
  private async resultOf(s: KVStorage, a: Attempt, prevBest?: OnThiBest): Promise<OnThiResult> {
    const set = this.sets(s).find((x) => x.id === a.setId)!;
    const mine = this.attempts(s).filter((x) => x.setId === a.setId && x.studentId === a.studentId);
    const best = this.best(mine, set);
    const items = set.revealAnswers ? await this.ds.getItems(set.itemIds) : [];
    const score = a.score ?? 0;
    return {
      attemptId: a.id, setId: set.id, style: set.style, title: set.title, score, maxScore: a.maxScore ?? 0, passScore: set.passScore,
      passed: score >= set.passScore, correct: a.correct ?? 0, wrong: a.wrong ?? 0, skipped: a.skipped ?? 0, durationMs: a.durationMs ?? 0,
      submittedAt: a.submittedAt ?? '', items: clone(a.items ?? []),
      responses: Object.fromEntries(Object.entries(a.answers).map(([k, v]) => [k, v.response])),
      ...(set.revealAnswers ? { keys: Object.fromEntries(items.map((i) => [i.id, (i as Item & { key?: unknown }).key ?? null])) } : {}),
      best: best?.score ?? score, newBest: !!prevBest && compareOnThi(this.bestOf(a, set), prevBest) < 0,
    };
  }
  async board(setId: string): Promise<OnThiBoard> {
    const me = await this.me();
    const { s, now } = await this.kv();
    await this.finalizeOverdue(s, now);
    const set = this.sets(s).find((x) => x.id === setId);
    if (!set) throw friendly('Không tìm thấy bài luyện này.');
    if (!isStaff(me) && !set.showBoard) return { setId, total: 0, rows: [], me: null, hidden: true };
    const people = await this.gradeStudents(set.grade);
    const classes = new Map((await this.ds.listClasses()).map((c) => [c.id, c.name]));
    const all = this.attempts(s).filter((a) => a.setId === setId);
    const rows = rankRows(people.flatMap((p) => {
      const b = this.best(all.filter((a) => a.studentId === p.id), set);
      return b ? [{ studentId: p.id, name: p.name, ...(p.classId ? { className: classes.get(p.classId) } : {}), mascot: p.avatarMascot, color: p.avatarColor, score: b.score, durationMs: b.durationMs, wrong: b.wrong, at: b.at }] : [];
    })).map(({ at: _at, ...r }) => r);
    const mineRow = rows.find((r) => r.studentId === me.id) ?? null;
    return { setId, total: rows.length, rows: isStaff(me) ? rows : rows.slice(0, 10), me: mineRow };
  }
  async practiceTypes(style: OnThiStyle): Promise<{ type: ItemType; count: number }[]> {
    const me = await this.student();
    const { s } = await this.kv();
    const ids = [...new Set(this.visibleSets(s, me, style).flatMap((x) => x.itemIds))];
    const items = await this.ds.getItems(ids);
    const count = new Map<ItemType, number>();
    for (const i of items) count.set(i.type, (count.get(i.type) ?? 0) + 1);
    return [...count.entries()].map(([type, n]) => ({ type, count: n }));
  }
  async practiceItems(style: OnThiStyle, type: ItemType): Promise<Item[]> {
    const me = await this.student();
    const { s } = await this.kv();
    const ids = [...new Set(this.visibleSets(s, me, style).flatMap((x) => x.itemIds))];
    const items = (await this.ds.getItems(ids)).filter((i) => i.type === type);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    // Chế độ demo giữ đáp án để chấm trên máy (submitAnswer của demo cũng chấm trên máy).
    return items.slice(0, ONTHI_PRACTICE_SIZE);
  }
}
