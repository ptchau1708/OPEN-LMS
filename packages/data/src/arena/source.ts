/**
 * Đấu trường — nguồn dữ liệu.
 *  - Supabase: các RPC của SQL 22 (arena_*, cup_*); câu trả lời trong trận chấm ở Edge Function `grade` (như Đấu 1–1).
 *  - Demo: lưu trên trình duyệt; chấm trên máy. Bản demo MÔ PHỎNG kết quả các bạn khác để thầy cô / học sinh
 *    xem được cả giải (học sinh demo đấu xong là thấy ngay đối thủ, vòng sau mở luôn).
 */
import {
  CUP_QUESTION_SECONDS, DEFAULT_ARENA_SETTINGS, uid,
  type AnyResponse, type ArenaAccess, type ArenaBoard, type ArenaRankRow, type ArenaSeason, type ArenaSettings, type Cup,
  type CupInput, type CupMatch, type CupMatchResult, type CupPlay, type CupPlayer, type DataSource, type DuelInfo, type Grade,
  type Item, type Profile,
} from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { loadScorer } from '../live/types';
import { answerAnnotations } from '../mastery';
import { duelPoints } from '../duel/logic';
import { getDuelService } from '../duel/service';
import { getRewardsSource } from '../badges/source';
import { arenaOpenAt } from './hours';
import { better, buildFirstRound, buildNextRound, decideMatch, EMPTY_RESULT, placements, roundsFor } from './bracket';

export interface ArenaSource {
  access(): Promise<ArenaAccess>;
  getSettings(classId: string): Promise<ArenaSettings>;
  saveSettings(classId: string, patch: Partial<Omit<ArenaSettings, 'classId'>>): Promise<ArenaSettings>;
  addToPool(classId: string, itemIds: string[]): Promise<number>;
  listCups(classId?: string): Promise<Cup[]>;
  getCup(id: string): Promise<Cup>;
  createCup(input: CupInput): Promise<Cup>;
  startCup(id: string): Promise<Cup>;
  closeRound(id: string): Promise<Cup>;
  setWinner(id: string, round: number, slot: number, userId: string): Promise<Cup>;
  cancelCup(id: string): Promise<Cup>;
  deleteCup(id: string): Promise<void>;
  setPlayer(id: string, userId: string, inCup: boolean): Promise<Cup>;
  joinCup(id: string, inCup: boolean): Promise<Cup>;
  play(id: string): Promise<CupPlay>;
  answer(play: CupPlay, q: number, item: Item, response: AnyResponse, ms: number): Promise<{ correct: boolean; points: number; ms: number }>;
  skip(play: CupPlay, q: number): Promise<void>;
  done(id: string): Promise<Cup>;
  board(classId?: string): Promise<ArenaBoard>;
  endSeason(classId: string, title?: string): Promise<ArenaSeason>;
  seasons(classId: string): Promise<ArenaSeason[]>;
}

/** Dạng câu dùng được để đấu (trả lời nhanh, máy chấm) — giống SQL 22. */
export const CUP_TYPES = ['MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING'];

/* =============================================================================
 * Supabase
 * ========================================================================== */
interface PgError { message?: string; code?: string }
function sqlErr(e: PgError, vi: string): Error {
  const m = e.message ?? '';
  if (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|arena_|cup_/i.test(m) && /schema cache|does not exist/i.test(m)) {
    return new Error('Cần chạy tệp SQL 22 trên Supabase để dùng Đấu trường mới (giải đấu, cài đặt, bảng xếp hạng).');
  }
  // Lỗi do hàm SQL báo (tiếng Việt) → giữ nguyên.
  if (/[À-ỹ]/.test(m)) return new Error(m);
  return new Error(vi);
}

class SupabaseArena implements ArenaSource {
  constructor(private ds: DataSource) {}
  private async rpc<T>(fn: string, args: Record<string, unknown>, vi: string): Promise<T> {
    const sb: V2Client = await getSupabaseClient();
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw sqlErr(error, vi);
    return data as T;
  }
  async access() {
    const r = await this.rpc<ArenaAccess>('arena_access', {}, 'Chưa tải được Đấu trường.');
    return { ...r, settings: normSettings(r.settings) };
  }
  async getSettings(classId: string) { return normSettings(await this.rpc<ArenaSettings>('arena_get_settings', { p_class: classId }, 'Chưa tải được cài đặt Đấu trường.')); }
  async saveSettings(classId: string, patch: Partial<ArenaSettings>) {
    return normSettings(await this.rpc<ArenaSettings>('arena_save_settings', { p_class: classId, p: patch }, 'Chưa lưu được cài đặt Đấu trường.'));
  }
  async addToPool(classId: string, itemIds: string[]) { return this.rpc<number>('arena_pool_add', { p_class: classId, p_items: itemIds }, 'Chưa đưa được câu vào Đấu trường.'); }
  async listCups(classId?: string) { return ((await this.rpc<Cup[]>('cup_list', { p_class: classId ?? null }, 'Chưa tải được giải đấu.')) ?? []).map(normCup); }
  async getCup(id: string) { return normCup(await this.rpc<Cup>('cup_get', { p_id: id }, 'Chưa tải được giải đấu.')); }
  async createCup(input: CupInput) {
    const p = { ...input, ...(input.startAt ? {} : { startAt: undefined }) };
    return normCup(await this.rpc<Cup>('cup_create', { p }, 'Chưa tạo được giải đấu.'));
  }
  async startCup(id: string) { return normCup(await this.rpc<Cup>('cup_start', { p_id: id }, 'Chưa bắt đầu được giải.')); }
  async closeRound(id: string) { return normCup(await this.rpc<Cup>('cup_close_round', { p_id: id }, 'Chưa đóng được vòng.')); }
  async setWinner(id: string, round: number, slot: number, userId: string) {
    return normCup(await this.rpc<Cup>('cup_set_winner', { p_id: id, p_round: round, p_slot: slot, p_winner: userId }, 'Chưa chọn được người thắng.'));
  }
  async cancelCup(id: string) { return normCup(await this.rpc<Cup>('cup_cancel', { p_id: id }, 'Chưa huỷ được giải.')); }
  async deleteCup(id: string) { await this.rpc('cup_delete', { p_id: id }, 'Chưa xoá được giải.'); }
  async setPlayer(id: string, userId: string, inCup: boolean) { return normCup(await this.rpc<Cup>('cup_set_player', { p_id: id, p_user: userId, p_in: inCup }, 'Chưa đổi được danh sách.')); }
  async joinCup(id: string, inCup: boolean) { return normCup(await this.rpc<Cup>('cup_join', { p_id: id, p_in: inCup }, 'Chưa đăng kí được.')); }
  async play(id: string) {
    const r = await this.rpc<Record<string, unknown>>('cup_play', { p_id: id }, 'Chưa vào được trận.');
    const { fromItem } = await import('../supabase/mapping');
    return {
      cupId: String(r.cupId), round: Number(r.round), slot: Number(r.slot), ...(r.closesAt ? { closesAt: String(r.closesAt) } : {}),
      opponent: r.opponent as CupPlayer, duel: r.duel as DuelInfo,
      items: ((r.items ?? []) as Record<string, unknown>[]).map((x) => fromItem(x)),
      answered: (r.answered ?? []) as CupPlay['answered'],
    };
  }
  async answer(play: CupPlay, q: number, item: Item, response: AnyResponse, ms: number) {
    const r = await getDuelService(this.ds).grade({ userId: '', duel: play.duel, q, item, response, ms });
    return { correct: r.correct, points: r.points, ms: r.ms };
  }
  async skip(play: CupPlay, q: number) { await getDuelService(this.ds).skip({ userId: '', duel: play.duel, q }); }
  async done(id: string) { return normCup(await this.rpc<Cup>('cup_done', { p_id: id }, 'Chưa cập nhật được kết quả.')); }
  async board(classId?: string) { return await this.rpc<ArenaBoard>('arena_board', { p_class: classId ?? null }, 'Chưa tải được bảng xếp hạng.'); }
  async endSeason(classId: string, title?: string) { return this.rpc<ArenaSeason>('arena_end_season', { p_class: classId, p_title: title ?? null }, 'Chưa kết thúc được mùa.'); }
  async seasons(classId: string) { return (await this.rpc<ArenaSeason[]>('arena_seasons', { p_class: classId }, 'Chưa tải được lịch sử mùa.')) ?? []; }
}

export function normSettings(s: Partial<ArenaSettings> & { classId?: string }): ArenaSettings {
  return {
    ...DEFAULT_ARENA_SETTINGS, ...s, classId: s.classId ?? '',
    itemIds: s.itemIds ?? [], hours: s.hours ?? [], modes: (s.modes ?? DEFAULT_ARENA_SETTINGS.modes) as ArenaSettings['modes'],
  };
}
function normCup(c: Cup): Cup {
  return { ...c, thirds: c.thirds ?? [], players: c.players ?? [], matches: c.matches ?? [], me: c.me ?? { host: false, eligible: false, joined: false } };
}

/* =============================================================================
 * Demo (trên trình duyệt)
 * ========================================================================== */
interface DemoAnswer { q: number; correct: boolean; points: number; ms: number }
type DemoMatch = CupMatch & { duel?: { id: string; itemIds: string[]; answers: Record<string, DemoAnswer[]> } };
type DemoCup = Omit<Cup, 'me' | 'matches' | 'itemIds' | 'itemCount'> & { itemIds: string[]; matches: DemoMatch[]; demoAuto?: boolean };
interface DemoStore { settings: Record<string, ArenaSettings>; cups: DemoCup[]; seasons: ArenaSeason[] }

const KEY = 'oe.arena.demo.v1';
const nowIso = () => new Date().toISOString();
const addMin = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

function readStore(): DemoStore {
  try {
    const s = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as DemoStore | null;
    if (s && typeof s === 'object') return { settings: s.settings ?? {}, cups: s.cups ?? [], seasons: s.seasons ?? [] };
  } catch { /* hỏng → làm lại */ }
  return { settings: {}, cups: [], seasons: [] };
}
function writeStore(s: DemoStore) { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); }

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j]!, x[i]!]; }
  return x;
}

function resultOf(m: DemoMatch, u?: string): CupMatchResult {
  const a = u ? m.duel?.answers[u] ?? [] : [];
  return { answered: a.length, correct: a.filter((x) => x.correct).length, points: a.reduce((s, x) => s + x.points, 0), ms: a.reduce((s, x) => s + x.ms, 0) };
}

/** Kết quả giả cho bạn không có thật trong bản demo. */
function simulate(questions: number): DemoAnswer[] {
  const acc = 0.45 + Math.random() * 0.45;
  return Array.from({ length: questions }, (_, q) => {
    const correct = Math.random() < acc;
    const ms = Math.round(4000 + Math.random() * 12000);
    return { q, correct, ms, points: duelPoints(correct, ms) };
  });
}

class DemoArena implements ArenaSource {
  constructor(private ds: DataSource) {}

  private async me(): Promise<Profile> {
    const u = await this.ds.getCurrentUser();
    if (!u) throw new Error('Em cần đăng nhập trước nhé.');
    return u;
  }
  private async teacher(): Promise<Profile> {
    const u = await this.me();
    if (u.role !== 'teacher' && u.role !== 'admin') throw new Error('Chỉ thầy cô mới làm được việc này.');
    return u;
  }
  private settingsOf(s: DemoStore, classId?: string): ArenaSettings {
    return normSettings(s.settings[classId ?? ''] ?? { classId: classId ?? '' });
  }

  async access(): Promise<ArenaAccess> {
    const u = await this.me();
    const st = this.settingsOf(readStore(), u.classId);
    const reason = !st.enabled ? 'off' as const : !arenaOpenAt(st.hours) ? 'hours' as const : undefined;
    return { open: !reason, ...(reason ? { reason } : {}), settings: st.source === 'picked' ? st : { ...st, itemIds: [] } };
  }
  async getSettings(classId: string) { await this.teacher(); return this.settingsOf(readStore(), classId); }
  async saveSettings(classId: string, patch: Partial<ArenaSettings>) {
    await this.teacher();
    for (const w of patch.hours ?? []) {
      if (!w.days.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.from) || !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(w.to) || w.from >= w.to) {
        throw new Error('Khung giờ không hợp lệ: chọn ngày trong tuần và giờ bắt đầu trước giờ kết thúc.');
      }
    }
    const s = readStore();
    const next = normSettings({ ...this.settingsOf(s, classId), ...patch, classId, updatedAt: nowIso() });
    s.settings[classId] = next;
    writeStore(s);
    return next;
  }
  async addToPool(classId: string, itemIds: string[]) {
    await this.teacher();
    const s = readStore();
    const cur = this.settingsOf(s, classId);
    s.settings[classId] = { ...cur, itemIds: [...new Set([...cur.itemIds, ...itemIds])], updatedAt: nowIso() };
    writeStore(s);
    return s.settings[classId]!.itemIds.length;
  }

  /* ---------- giải ---------- */
  private async pool(c: Pick<DemoCup, 'source' | 'itemIds' | 'grade' | 'subject'>): Promise<Item[]> {
    const all = c.source === 'picked' ? await this.ds.getItems(c.itemIds) : await this.ds.listItems({ grade: c.grade, subject: c.subject });
    return all.filter((i) => CUP_TYPES.includes(i.type) && i.key != null);
  }
  private async roster(c: DemoCup): Promise<Profile[]> {
    if (c.scope === 'class') return c.classId ? this.ds.listStudents(c.classId) : [];
    const classes = (await this.ds.listClasses()).filter((k) => k.grade === c.grade);
    const out: Profile[] = [];
    for (const k of classes) out.push(...(await this.ds.listStudents(k.id)));
    return [...new Map(out.map((p) => [p.id, p])).values()];
  }
  private player(p: Profile, classes: Map<string, string>): CupPlayer {
    return { userId: p.id, name: p.name, mascot: p.avatarMascot, color: p.avatarColor, ...(p.classId ? { classId: p.classId, className: classes.get(p.classId) } : {}) };
  }
  private async eligible(c: DemoCup, u: Profile): Promise<boolean> {
    if (u.role !== 'student') return false;
    return c.scope === 'class' ? u.classId === c.classId : u.grade === c.grade;
  }
  private async view(c: DemoCup, u: Profile): Promise<Cup> {
    const { matches, itemIds, demoAuto: _d, ...rest } = c;
    const host = u.role === 'teacher' || u.role === 'admin';
    return {
      ...rest, itemCount: itemIds.length, ...(host ? { itemIds } : {}),
      matches: matches.map(({ duel, ...m }) => ({
        ...m, ...(m.status === 'open' && duel ? { done: [m.p1, m.p2].filter((x): x is string => !!x && (duel.answers[x]?.length ?? 0) >= c.questions) } : {}),
      })),
      me: { host, eligible: await this.eligible(c, u), joined: c.players.some((p) => p.userId === u.id) },
    };
  }
  private async award(userId: string, stars: number, reason: string, cupId: string) {
    try { await this.ds.award({ userId, stars, coins: stars, xp: stars * 10, reason, sourceType: 'arena', sourceId: cupId }); } catch { /* bỏ qua */ }
  }
  private async cupBadge(c: DemoCup, userId: string, label: string) {
    try {
      const rs = await getRewardsSource(this.ds);
      await rs.grantTeacherBadge({ classId: c.classId ?? '', studentIds: [userId], title: `${label} · ${c.title}`.slice(0, 40), glyph: 'cup', note: `Giải đấu "${c.title}"` });
    } catch { /* bản demo: GV không phụ trách lớp → bỏ qua cúp */ }
  }

  /** Tiến trình giải (giống v2._cup_tick). viewer: HS đang xem (bản demo mô phỏng các bạn khác). */
  private async tick(c: DemoCup, viewer?: Profile): Promise<boolean> {
    let changed = false;
    const now = nowIso();
    if (c.status === 'signup' && Date.parse(now) >= Date.parse(c.startAt)) {
      const classes = new Map((await this.ds.listClasses()).map((k) => [k.id, k.name]));
      if (c.entry === 'all') {
        const known = new Set(c.players.map((p) => p.userId));
        for (const p of await this.roster(c)) if (!known.has(p.id)) c.players.push(this.player(p, classes));
      }
      c.players = c.players.slice(0, 256);
      if (c.players.length < 2) Object.assign(c, { status: 'cancelled', note: 'Giải cần ít nhất 2 học sinh tham gia.', finishedAt: now });
      else if ((await this.pool(c)).length < c.questions) Object.assign(c, { status: 'cancelled', note: `Chưa đủ câu hỏi: cần ít nhất ${c.questions} câu dạng trả lời nhanh có đáp án.`, finishedAt: now });
      else {
        shuffle(c.players).forEach((p, i) => { p.seed = i + 1; delete p.outRound; });
        c.players.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
        c.matches = buildFirstRound(c.players.map((p) => ({ userId: p.userId, seed: p.seed! })), this.window(c, 1), now);
        Object.assign(c, { status: 'running', round: 1, rounds: roundsFor(c.players.length), startedAt: now });
      }
      changed = true;
    }
    for (let guard = 0; c.status === 'running' && guard < 10; guard++) {
      for (const m of c.matches.filter((x) => x.round === c.round && x.status === 'open')) {
        if (this.simulateFor(c, m, viewer)) changed = true;
        if (this.decide(c, m, !!m.closesAt && Date.parse(now) >= Date.parse(m.closesAt))) changed = true;
      }
      if (c.matches.some((x) => x.round === c.round && x.status === 'open')) break;
      changed = true;
      if (c.round >= c.rounds) { await this.finish(c); break; }
      c.matches.push(...buildNextRound(c.matches.filter((x) => x.round === c.round), this.window(c, c.round + 1), now));
      c.round += 1;
    }
    return changed;
  }
  private window(c: DemoCup, round: number) {
    const open = c.pace === 'daily' ? new Date(Math.max(Date.now(), Date.parse(c.startAt) + (round - 1) * 86_400_000)).toISOString() : nowIso();
    return { opensAt: open, closesAt: addMin(open, c.roundMinutes) };
  }
  /** Bản demo cho HS: các trận không có em → mô phỏng ngay; trận của em → em đấu xong thì mô phỏng bạn kia. */
  private simulateFor(c: DemoCup, m: DemoMatch, viewer?: Profile): boolean {
    if (!c.demoAuto || !viewer || !m.p1 || !m.p2) return false;
    const mine = m.p1 === viewer.id || m.p2 === viewer.id;
    const opp = mine ? (m.p1 === viewer.id ? m.p2 : m.p1) : undefined;
    if (mine && resultOf(m, viewer.id).answered < c.questions) return false;
    m.duel = m.duel ?? { id: uid('cd'), itemIds: [], answers: {} };
    for (const u of mine ? [opp!] : [m.p1, m.p2]) if (!m.duel.answers[u]?.length) m.duel.answers[u] = simulate(c.questions);
    return true;
  }
  private decide(c: DemoCup, m: DemoMatch, force: boolean, teacherWinner?: string): boolean {
    // Bản demo GV: đóng vòng mà chưa ai đấu → mô phỏng kết quả cho giống thật.
    if (force && !teacherWinner && m.p1 && m.p2 && !resultOf(m, m.p1).answered && !resultOf(m, m.p2).answered) {
      m.duel = { id: m.duel?.id ?? uid('cd'), itemIds: m.duel?.itemIds ?? [], answers: { [m.p1]: simulate(c.questions), [m.p2]: simulate(c.questions) } };
    }
    const seed = (u?: string) => c.players.find((p) => p.userId === u)?.seed;
    const d = decideMatch(m, { p1: resultOf(m, m.p1), p2: resultOf(m, m.p2) }, { p1: seed(m.p1), p2: seed(m.p2) }, c.questions, force, teacherWinner);
    if (!d) return false;
    Object.assign(m, { winner: d.winner, decidedBy: d.decidedBy, result: d.result, status: 'done', decidedAt: nowIso() });
    const lose = d.winner === m.p1 ? m.p2 : m.p1;
    const lp = c.players.find((p) => p.userId === lose);
    if (lp) lp.outRound = m.round;
    if ((d.result[d.winner] ?? EMPTY_RESULT).answered > 0) void this.award(d.winner, 2, `Thắng vòng ${m.round} · ${c.title}`, c.id);
    if (lose && (d.result[lose] ?? EMPTY_RESULT).answered > 0) void this.award(lose, 1, `Thi đấu vòng ${m.round} · ${c.title}`, c.id);
    return true;
  }
  private async finish(c: DemoCup) {
    const p = placements(c.matches, c.rounds);
    Object.assign(c, { status: 'finished', finishedAt: nowIso(), ...p, thirds: p.thirds });
    if (p.champion) { await this.award(p.champion, 10, `Vô địch · ${c.title}`, c.id); await this.cupBadge(c, p.champion, 'Vô địch'); }
    if (p.runnerUp) { await this.award(p.runnerUp, 6, `Á quân · ${c.title}`, c.id); await this.cupBadge(c, p.runnerUp, 'Á quân'); }
    for (const t of p.thirds) { await this.award(t, 4, `Hạng ba · ${c.title}`, c.id); await this.cupBadge(c, t, 'Hạng ba'); }
  }

  /** Bản demo HS: chưa có giải nào của lớp → tạo sẵn một giải thử để em chơi. */
  private async ensureDemoCup(s: DemoStore, u: Profile): Promise<void> {
    if (u.role !== 'student' || !u.classId || !u.grade) return;
    if (s.cups.some((c) => c.classId === u.classId || (c.scope === 'grade' && c.grade === u.grade))) return;
    const items = (await this.ds.listItems({ grade: u.grade })).filter((i) => CUP_TYPES.includes(i.type) && i.key != null);
    const bySubject = new Map<string, number>();
    for (const i of items) bySubject.set(i.subject, (bySubject.get(i.subject) ?? 0) + 1);
    const subject = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!subject || (bySubject.get(subject) ?? 0) < 3) return;
    const cls = await this.ds.getClass(u.classId);
    const c: DemoCup = {
      id: uid('cup'), title: 'Giải thử sức (bản demo)', scope: 'class', classId: u.classId, ...(cls ? { className: cls.name } : {}),
      grade: u.grade as Grade, subject: subject as DemoCup['subject'], source: 'auto', itemIds: [], questions: Math.min(5, bySubject.get(subject) ?? 3),
      seeding: 'random', entry: 'all', startAt: nowIso(), roundMinutes: 1440, pace: 'continuous', status: 'signup', round: 0, rounds: 0,
      thirds: [], createdBy: 'demo', createdByName: 'Cô giáo (demo)', createdAt: nowIso(), players: [], matches: [], demoAuto: true,
    };
    s.cups.unshift(c);
  }

  private async load(id: string): Promise<{ s: DemoStore; c: DemoCup; u: Profile }> {
    const u = await this.me();
    const s = readStore();
    const c = s.cups.find((x) => x.id === id);
    if (!c) throw new Error('Không tìm thấy giải đấu.');
    return { s, c, u };
  }

  async listCups(classId?: string) {
    const u = await this.me();
    const s = readStore();
    await this.ensureDemoCup(s, u);
    const host = u.role === 'teacher' || u.role === 'admin';
    const list: DemoCup[] = [];
    for (const c of s.cups) {
      if (host ? !classId || c.classId === classId : c.status !== 'cancelled' && ((await this.eligible(c, u)) || c.players.some((p) => p.userId === u.id))) list.push(c);
    }
    for (const c of list) await this.tick(c, host ? undefined : u);
    writeStore(s);
    const out: Cup[] = [];
    for (const c of list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) out.push(await this.view(c, u));
    return out;
  }
  async getCup(id: string) {
    const { s, c, u } = await this.load(id);
    if (await this.tick(c, u.role === 'student' ? u : undefined)) writeStore(s);
    return this.view(c, u);
  }
  async createCup(input: CupInput) {
    const u = await this.teacher();
    const title = input.title.trim();
    if (!title) throw new Error('Thầy cô đặt tên cho giải đấu nhé.');
    const cls = await this.ds.getClass(input.classId);
    if (!cls) throw new Error('Thầy cô chọn lớp cho giải đấu nhé.');
    if (input.source === 'picked' && !input.itemIds.length) throw new Error('Thầy cô chọn câu hỏi cho giải (hoặc chọn "Tự động theo môn").');
    const c: DemoCup = {
      id: uid('cup'), title: title.slice(0, 80), scope: input.scope, classId: cls.id, className: cls.name, grade: cls.grade as Grade,
      subject: input.subject, source: input.source, itemIds: input.source === 'picked' ? [...new Set(input.itemIds)] : [],
      questions: Math.min(10, Math.max(3, Math.round(input.questions))), seeding: input.seeding, entry: input.entry,
      startAt: input.startAt ?? nowIso(), roundMinutes: Math.min(1440, Math.max(2, Math.round(input.roundMinutes))), pace: input.pace,
      status: 'signup', round: 0, rounds: 0, thirds: [], createdBy: u.id, createdByName: u.name, createdAt: nowIso(), players: [], matches: [],
    };
    const have = (await this.pool(c)).length;
    if (have < c.questions) throw new Error(`Chưa đủ câu hỏi: mỗi trận cần ${c.questions} câu dạng trả lời nhanh có đáp án, hiện có ${have} câu.`);
    const s = readStore();
    s.cups.unshift(c);
    await this.tick(c);
    writeStore(s);
    return this.view(c, u);
  }
  private async hostOp(id: string, fn: (c: DemoCup, s: DemoStore) => Promise<void> | void): Promise<Cup> {
    await this.teacher();
    const { s, c, u } = await this.load(id);
    await fn(c, s);
    await this.tick(c);
    writeStore(s);
    return this.view(c, u);
  }
  startCup(id: string) {
    return this.hostOp(id, (c) => { if (c.status !== 'signup') throw new Error('Giải đã bắt đầu rồi.'); c.startAt = nowIso(); });
  }
  closeRound(id: string) {
    return this.hostOp(id, (c) => {
      if (c.status !== 'running') throw new Error('Giải không còn diễn ra.');
      const t = nowIso();
      for (const m of c.matches) if (m.round === c.round && m.status === 'open') { m.closesAt = t; if (!m.opensAt || m.opensAt > t) m.opensAt = t; }
    });
  }
  setWinner(id: string, round: number, slot: number, userId: string) {
    return this.hostOp(id, (c) => {
      const m = c.matches.find((x) => x.round === round && x.slot === slot);
      if (!m || c.status !== 'running' || m.round !== c.round || m.status !== 'open') throw new Error('Chỉ chọn người thắng cho trận đang diễn ra ở vòng hiện tại.');
      if (userId !== m.p1 && userId !== m.p2) throw new Error('Người thắng phải là một trong hai bạn của trận.');
      this.decide(c, m, true, userId);
    });
  }
  cancelCup(id: string) {
    return this.hostOp(id, (c) => {
      if (c.status === 'finished' || c.status === 'cancelled') throw new Error('Giải đã kết thúc.');
      Object.assign(c, { status: 'cancelled', finishedAt: nowIso(), note: c.note ?? 'Thầy cô đã huỷ giải.' });
    });
  }
  async deleteCup(id: string) {
    await this.teacher();
    const s = readStore();
    const c = s.cups.find((x) => x.id === id);
    if (c?.status === 'running') throw new Error('Giải đang diễn ra — thầy cô huỷ giải trước khi xoá.');
    s.cups = s.cups.filter((x) => x.id !== id);
    writeStore(s);
  }
  setPlayer(id: string, userId: string, inCup: boolean) {
    return this.hostOp(id, async (c) => {
      if (c.status !== 'signup') throw new Error('Giải đã bắt đầu — không đổi danh sách được nữa.');
      if (!inCup) { c.players = c.players.filter((p) => p.userId !== userId); return; }
      const p = (await this.roster(c)).find((x) => x.id === userId);
      if (!p) throw new Error('Học sinh này không thuộc lớp / khối của giải.');
      if (!c.players.some((x) => x.userId === userId)) c.players.push(this.player(p, new Map((await this.ds.listClasses()).map((k) => [k.id, k.name]))));
    });
  }
  async joinCup(id: string, inCup: boolean) {
    const { s, c, u } = await this.load(id);
    if (c.status !== 'signup') throw new Error('Giải đã bắt đầu, không đăng kí được nữa.');
    if (!(await this.eligible(c, u))) throw new Error('Em không thuộc lớp / khối của giải này.');
    if (inCup && !c.players.some((p) => p.userId === u.id)) {
      const cls = u.classId ? await this.ds.getClass(u.classId) : null;
      c.players.push(this.player(u, new Map(cls ? [[cls.id, cls.name]] : [])));
    }
    if (!inCup) c.players = c.players.filter((p) => p.userId !== u.id);
    writeStore(s);
    return this.view(c, u);
  }

  async play(id: string): Promise<CupPlay> {
    const { s, c, u } = await this.load(id);
    await this.tick(c, u);
    if (c.status !== 'running') { writeStore(s); throw new Error('Giải đấu không còn diễn ra.'); }
    const m = c.matches.find((x) => x.round === c.round && (x.p1 === u.id || x.p2 === u.id));
    if (!m) { writeStore(s); throw new Error('Em không có trận ở vòng này.'); }
    if (m.status !== 'open') { writeStore(s); throw new Error('Trận của em ở vòng này đã có kết quả.'); }
    if (!m.duel?.itemIds.length) {
      const seen = new Set(c.matches.filter((x) => x !== m && [x.p1, x.p2].some((p) => p === m.p1 || p === m.p2)).flatMap((x) => x.duel?.itemIds ?? []));
      const pool = shuffle(await this.pool(c)).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
      m.duel = { id: m.duel?.id ?? uid('cd'), itemIds: shuffle(pool.slice(0, c.questions).map((i) => i.id)), answers: m.duel?.answers ?? {} };
    }
    writeStore(s);
    const oppId = m.p1 === u.id ? m.p2! : m.p1!;
    const opp = c.players.find((p) => p.userId === oppId) ?? { userId: oppId, name: 'Bạn', mascot: 'nghe', color: '#64748b' };
    const items = (await this.ds.getItems(m.duel.itemIds)).map((i) => ({ ...i, key: undefined }) as unknown as Item);
    const me = c.players.find((p) => p.userId === u.id);
    const duel: DuelInfo = {
      id: m.duel.id, code: '0000', mode: 'code', ...(c.classId ? { classId: c.classId } : {}), subject: c.subject, grade: c.grade,
      players: [me, opp].filter((x): x is CupPlayer => !!x).map((p) => ({ userId: p.userId, name: p.name, mascot: p.mascot, color: p.color })),
      itemIds: m.duel.itemIds, seed: 0, status: 'playing', createdAt: c.createdAt,
    };
    return { cupId: c.id, round: m.round, slot: m.slot, ...(m.closesAt ? { closesAt: m.closesAt } : {}), opponent: opp, duel, items, answered: [...(m.duel.answers[u.id] ?? [])] };
  }
  private async record(play: CupPlay, a: DemoAnswer): Promise<DemoAnswer> {
    const u = await this.me();
    const s = readStore();
    const c = s.cups.find((x) => x.id === play.cupId);
    const m = c?.matches.find((x) => x.round === play.round && x.slot === play.slot);
    if (!c || !m?.duel || m.status !== 'open') throw new Error('Trận đã kết thúc.');
    const list = (m.duel.answers[u.id] = m.duel.answers[u.id] ?? []);
    const old = list.find((x) => x.q === a.q);
    if (old) return old;
    list.push(a);
    writeStore(s);
    return a;
  }
  async answer(play: CupPlay, q: number, item: Item, response: AnyResponse, ms: number) {
    const score = await loadScorer();
    const full = (await this.ds.getItem(item.id)) ?? item;
    const r = score(full, response);
    const correct = !!r.graded && !!r.correct;
    const t = Math.min(CUP_QUESTION_SECONDS * 1000, Math.max(300, Math.round(ms)));
    const a = await this.record(play, { q, correct, ms: t, points: duelPoints(correct, t) });
    const u = await this.me();
    try {
      await this.ds.recordEvent({ userId: u.id, verb: 'answered', objectType: 'arena', objectId: full.id,
        result: { correct, score: r.score, durationMs: t, response: response as unknown, ...answerAnnotations(full, response, correct) } });
    } catch { /* bỏ qua */ }
    return { correct: a.correct, points: a.points, ms: a.ms };
  }
  async skip(play: CupPlay, q: number) { await this.record(play, { q, correct: false, ms: CUP_QUESTION_SECONDS * 1000, points: 0 }); }
  done(id: string) { return this.getCup(id); }

  /* ---------- bảng xếp hạng ---------- */
  private async rows(classId: string, since?: string): Promise<ArenaRankRow[]> {
    const students = await this.ds.listStudents(classId);
    const s = readStore();
    const after = (t?: string) => !since || (!!t && t > since);
    const pts = new Map<string, { points: number; wins: number; played: number }>();
    const add = (u: string | undefined, p: number, w = 0, n = 0) => {
      if (!u) return;
      const x = pts.get(u) ?? { points: 0, wins: 0, played: 0 };
      x.points += p; x.wins += w; x.played += n;
      pts.set(u, x);
    };
    for (const c of s.cups) {
      for (const m of c.matches) {
        if (m.status !== 'done' || !m.decidedBy || m.decidedBy === 'bye' || m.decidedBy === 'seed' || !after(m.decidedAt)) continue;
        add(m.winner, 3, 1, 1);
        add(m.winner === m.p1 ? m.p2 : m.p1, 0, 0, 1);
      }
      if (c.status === 'finished' && after(c.finishedAt)) {
        add(c.champion, 10); add(c.runnerUp, 6);
        for (const t of c.thirds) add(t, 4);
      }
    }
    const duel = getDuelService(this.ds);
    for (const st of students) {
      try {
        const d = await duel.getStats(st.id);
        if (!since) add(st.id, d.wins * 3 + d.draws, d.wins, d.played);
      } catch { /* bỏ qua */ }
    }
    const list = students.map((st) => ({ userId: st.id, name: st.name, mascot: st.avatarMascot, color: st.avatarColor, ...(pts.get(st.id) ?? { points: 0, wins: 0, played: 0 }) }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'vi'));
    let rank = 0;
    return list.map((r, i) => {
      if (i === 0 || r.points !== list[i - 1]!.points || r.wins !== list[i - 1]!.wins) rank = i + 1;
      return { ...r, rank };
    });
  }
  async board(classId?: string): Promise<ArenaBoard> {
    const u = await this.me();
    const cls = u.role === 'student' ? u.classId : classId;
    if (!cls) return { total: 0, rows: [] };
    const st = this.settingsOf(readStore(), cls);
    const rows = await this.rows(cls, st.seasonStart);
    const base = { classId: cls, ...(st.seasonTitle ? { seasonTitle: st.seasonTitle } : {}), ...(st.seasonStart ? { seasonStart: st.seasonStart } : {}), total: rows.length };
    if (u.role !== 'student') return { ...base, rows };
    const me = rows.find((r) => r.userId === u.id);
    return { ...base, rows: rows.filter((r) => r.points > 0).slice(0, 10), ...(me ? { me } : {}) };
  }
  async endSeason(classId: string, title?: string) {
    await this.teacher();
    const s = readStore();
    const st = this.settingsOf(s, classId);
    const rows = await this.rows(classId, st.seasonStart);
    const d = new Date();
    const name = (title?.trim() || st.seasonTitle || `Mùa ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`).slice(0, 80);
    const season: ArenaSeason = { id: uid('ss'), classId, title: name, ...(st.seasonStart ? { startedAt: st.seasonStart } : {}), endedAt: nowIso(), top: rows.filter((r) => r.points > 0).slice(0, 10) };
    for (const r of season.top.filter((x) => x.rank <= 3)) {
      const label = r.rank === 1 ? 'Hạng nhất' : r.rank === 2 ? 'Hạng nhì' : 'Hạng ba';
      await this.award(r.userId, r.rank === 1 ? 10 : r.rank === 2 ? 6 : 4, `${label} · ${name}`, season.id);
      try {
        const rs = await getRewardsSource(this.ds);
        await rs.grantTeacherBadge({ classId, studentIds: [r.userId], title: `${label} · ${name}`.slice(0, 40), glyph: 'cup', note: `Bảng xếp hạng Đấu trường "${name}"` });
      } catch { /* bỏ qua */ }
    }
    const s2 = readStore();
    s2.seasons.unshift(season);
    s2.settings[classId] = { ...this.settingsOf(s2, classId), seasonStart: nowIso(), seasonTitle: undefined };
    writeStore(s2);
    return season;
  }
  async seasons(classId: string) { await this.me(); return readStore().seasons.filter((x) => x.classId === classId); }
}

/** Chỉ kiểm thử: so điểm như SQL. */
export const __test = { better, resultOf, simulate };

const cache = new WeakMap<DataSource, ArenaSource>();
export function getArenaSource(ds: DataSource): ArenaSource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoArena(ds) : new SupabaseArena(ds);
    cache.set(ds, s);
  }
  return s;
}
