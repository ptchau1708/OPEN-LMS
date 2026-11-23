/**
 * Phase 6 — RewardsSource bản demo: dùng chung kho localStorage với DemoDataSource (qua schoolKv),
 * thêm một khóa `rewards6`. Tự làm mới khi bộ dữ liệu mẫu được nạp lại (so `meta.seededAt`).
 */
import {
  SHOP_ITEM_BY_ID,
  TEACHER_BADGE_GLYPHS,
  TEACHER_BADGE_ID,
  uid,
  type BadgeShelf,
  type ClassGarden,
  type GrantTeacherBadgeInput,
  type Outfit,
  type OutfitSlot,
  type PlantKind,
  type RewardsSource,
  type SetGardenGoalInput,
  type ShopState,
  type SubjectId,
  type UserBadge,
} from '@openedu/contracts';
import type { DemoDataSource } from '../demo/DemoDataSource';
import { vnWeekStart } from '../engagement';
import { readJson, writeJson, type KVStorage } from '../storage';
import {
  anonymizeGarden,
  assembleGarden,
  badgeProgress,
  badgeStatsFrom,
  checkPurchase,
  defaultGoalTarget,
  defaultPlant,
  newlyEarnedBadges,
  purchaseEntry,
  starsSince,
  type GardenRaw,
} from './rules';

const KEY = 'rewards6';
const DAY = 86_400_000;

interface GoalRow { targetStars: number; plant: PlantKind; reachedAt?: string }
interface Store {
  stamp: string;
  badges: UserBadge[];
  /** HS đã được xét lần đầu (lần đầu: huy hiệu cũ coi như đã xem, không dồn màn chúc mừng). */
  evaluated: string[];
  owned: Record<string, string[]>;
  outfits: Record<string, Outfit>;
  goals: Record<string, Record<string, GoalRow>>;
}

const fail = (m: string) => new Error(m);

export class DemoRewardsSource implements RewardsSource {
  constructor(private ds: DemoDataSource) {}

  private async kv(): Promise<{ s: KVStorage; now: Date; store: Store; save: (st: Store) => void }> {
    const { storage, now } = await this.ds.schoolKv();
    const stamp = readJson<{ seededAt?: string } | null>(storage, 'meta', null)?.seededAt ?? '';
    let store = readJson<Store | null>(storage, KEY, null);
    if (!store || store.stamp !== stamp) {
      store = this.seed(stamp, now());
      writeJson(storage, KEY, store);
    }
    return { s: storage, now: now(), store, save: (st) => writeJson(storage, KEY, st) };
  }

  private seed(stamp: string, now: Date): Store {
    const wk = (n: number) => new Date(Date.parse(vnWeekStart(now)) - n * 7 * DAY).toISOString();
    return {
      stamp,
      evaluated: [],
      badges: [
        { id: 'ub-seed-1', userId: 'u-an2a1', badgeId: TEACHER_BADGE_ID, earnedAt: new Date(now.getTime() - 3600_000).toISOString(), title: 'Bạn nhỏ đọc to, rõ ràng', glyph: 'sun', note: 'Hôm nay em đọc bài rất hay!', grantedBy: 'u-colan', grantedByName: 'Cô Lan', seen: false },
        { id: 'ub-seed-2', userId: 'u-hai4a1', badgeId: TEACHER_BADGE_ID, earnedAt: new Date(now.getTime() - 2 * DAY).toISOString(), title: 'Thầy giáo nhí', glyph: 'heart', note: 'Em giảng bài cho bạn rất dễ hiểu.', grantedBy: 'u-cothu', grantedByName: 'Cô Thu', seen: true },
      ],
      owned: { 'u-an2a1': ['hat-party', 'neck-bow', 'bg-sky'] },
      outfits: { 'u-an2a1': { hat: 'hat-party', neck: 'neck-bow', bg: 'bg-sky' } },
      goals: {
        'c-2a': { [wk(1)]: { targetStars: 100, plant: 'sen', reachedAt: wk(0) }, [wk(2)]: { targetStars: 80, plant: 'huong-duong', reachedAt: wk(1) } },
        'c-4a': { [wk(1)]: { targetStars: 200, plant: 'hoa-dao', reachedAt: wk(0) } },
      },
    };
  }

  private async viewer() {
    return this.ds.getCurrentUser();
  }

  /* ---------- huy hiệu ---------- */
  private async stats(userId: string) {
    const [events, rewards, logs, lessons] = await Promise.all([
      this.ds.listEvents({ userId, limit: 6000 }),
      this.ds.listRewards(userId, 6000),
      this.ds.listBehaviorLogs({ studentId: userId, limit: 2000 }),
      this.ds.listLessons(),
    ]);
    const classIds = [...new Set(logs.map((l) => l.classId))];
    const behaviors = (await Promise.all(classIds.map((c) => this.ds.listBehaviors(c)))).flat();
    const lessonSubject: Record<string, SubjectId> = Object.fromEntries(lessons.map((l) => [l.id, l.subject]));
    return badgeStatsFrom({ userId, events, rewards, behaviorLogs: logs, behaviors, lessonSubject });
  }

  async getBadgeShelf(userId: string): Promise<BadgeShelf> {
    const { store } = await this.kv();
    const st = await this.stats(userId);
    return { earned: store.badges.filter((b) => b.userId === userId).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)), progress: badgeProgress(st) };
  }

  async evaluateBadges(userId: string): Promise<UserBadge[]> {
    const st = await this.stats(userId);
    const { store, now, save } = await this.kv();
    const mine = store.badges.filter((b) => b.userId === userId);
    const first = !store.evaluated.includes(userId);
    const fresh = newlyEarnedBadges(st, mine.map((b) => b.badgeId));
    if (fresh.length || first) {
      for (const id of fresh) store.badges.push({ id: uid('ub'), userId, badgeId: id, earnedAt: now.toISOString(), seen: first });
      if (first) store.evaluated.push(userId);
      save(store);
    }
    return store.badges.filter((b) => b.userId === userId && !b.seen).sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
  }

  async markBadgesSeen(userId: string, ids: string[]): Promise<void> {
    const { store, save } = await this.kv();
    for (const b of store.badges) if (b.userId === userId && ids.includes(b.id)) b.seen = true;
    save(store);
  }

  async grantTeacherBadge(input: GrantTeacherBadgeInput): Promise<UserBadge[]> {
    const me = await this.viewer();
    if (!me || (me.role !== 'teacher' && me.role !== 'admin')) throw fail('Chỉ thầy cô mới tặng huy hiệu được.');
    const cls = await this.ds.getClass(input.classId);
    if (!cls || (me.role !== 'admin' && cls.teacherId !== me.id)) throw fail('Thầy cô chỉ tặng huy hiệu cho học sinh lớp mình.');
    const title = input.title.trim().slice(0, 40);
    if (!title) throw fail('Thầy cô đặt tên cho huy hiệu nhé.');
    if (!TEACHER_BADGE_GLYPHS.includes(input.glyph)) throw fail('Biểu tượng này chưa có trong bộ huy hiệu.');
    const { store, now, save } = await this.kv();
    const out: UserBadge[] = [];
    for (const sid of input.studentIds) {
      if (!cls.studentIds.includes(sid)) continue;
      const b: UserBadge = { id: uid('ub'), userId: sid, badgeId: TEACHER_BADGE_ID, earnedAt: now.toISOString(), title, glyph: input.glyph, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 120) } : {}), grantedBy: me.id, grantedByName: me.name, seen: false };
      store.badges.push(b);
      out.push(b);
    }
    save(store);
    return out;
  }

  async listTeacherBadges(classId: string): Promise<UserBadge[]> {
    const cls = await this.ds.getClass(classId);
    const { store } = await this.kv();
    return store.badges.filter((b) => b.badgeId === TEACHER_BADGE_ID && !!cls?.studentIds.includes(b.userId)).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  }

  /* ---------- cửa hàng ---------- */
  private async shopOf(userId: string, store: Store): Promise<ShopState> {
    const [w, pp] = await Promise.all([this.ds.getWallet(userId), this.ds.getPassport(userId)]);
    return { userId, coins: w.coins, owned: [...(store.owned[userId] ?? [])], outfit: { ...(store.outfits[userId] ?? {}) }, companion: pp.companion };
  }

  async getShop(userId: string): Promise<ShopState> {
    const { store } = await this.kv();
    return this.shopOf(userId, store);
  }

  async buyItem(userId: string, itemId: string): Promise<ShopState> {
    const { store, save } = await this.kv();
    const item = SHOP_ITEM_BY_ID[itemId];
    const w = await this.ds.getWallet(userId);
    const c = checkPurchase(w.coins, item, store.owned[userId] ?? []);
    if (!c.ok) throw fail(c.reason === 'poor' ? `Em cần thêm ${c.need} xu nữa nhé. Học thêm để nhận sao và xu!` : c.reason === 'owned' ? 'Em đã có món này rồi.' : 'Không tìm thấy món đồ này.');
    await this.ds.award(purchaseEntry(userId, item));
    store.owned[userId] = [...(store.owned[userId] ?? []), itemId];
    save(store);
    return this.shopOf(userId, store);
  }

  async equipItem(userId: string, slot: OutfitSlot, itemId: string | null): Promise<ShopState> {
    const { store, save } = await this.kv();
    const o = { ...(store.outfits[userId] ?? {}) };
    if (itemId) {
      const item = SHOP_ITEM_BY_ID[itemId];
      if (!item || item.slot !== slot) throw fail('Món này không mặc ở chỗ đó được.');
      if (!(store.owned[userId] ?? []).includes(itemId)) throw fail('Em cần đổi xu lấy món này trước nhé.');
      o[slot] = itemId;
    } else delete o[slot];
    store.outfits[userId] = o;
    save(store);
    return this.shopOf(userId, store);
  }

  /* ---------- Vườn lớp ---------- */
  /** Demo: khóa TV chỉ để link giống bản thật — màn hình lớp (origin khác) không có dữ liệu khóa nên không kiểm tra. */
  async gardenTvKey(classId: string): Promise<string> {
    return `demo${classId.replace(/[^a-z0-9]/gi, '')}`.padEnd(40, '0');
  }

  async getClassGarden(classId: string, opts: { display?: 'tv'; tvKey?: string } = {}): Promise<ClassGarden> {
    const tv = opts.display === 'tv' || !!opts.tvKey;
    const me = await this.viewer();
    const cls = await this.ds.getClass(classId);
    if (!cls) throw fail('Không tìm thấy lớp.');
    // Demo: màn hình lớp (app present) không đăng nhập vẫn xem được — dữ liệu đã ẩn tên.
    const staff = tv || (!!me && (me.role === 'teacher' || me.role === 'admin'));
    if (!staff && (!me || !cls.studentIds.includes(me.id))) throw fail('Em chỉ xem được vườn của lớp mình.');
    const { store, now, save } = await this.kv();
    const weekStart = vnWeekStart(now);
    const students = await this.ds.listStudents(classId);
    const rewards = (await Promise.all(cls.studentIds.map((id) => this.ds.listRewards(id, 2000)))).flat();
    const stars = starsSince(rewards, weekStart);
    const row = store.goals[classId]?.[weekStart];
    const goal = row ? { targetStars: row.targetStars, plant: row.plant, custom: true } : { targetStars: defaultGoalTarget(cls.studentIds.length), plant: defaultPlant(weekStart), custom: false };
    const classStars = cls.studentIds.reduce((s, id) => s + (stars[id] ?? 0), 0);
    // Lớp đạt mục tiêu → ghi vào bộ sưu tập (một lần mỗi tuần).
    if (classStars >= goal.targetStars && !row?.reachedAt) {
      store.goals[classId] = { ...(store.goals[classId] ?? {}), [weekStart]: { targetStars: goal.targetStars, plant: goal.plant, reachedAt: now.toISOString() } };
      save(store);
    }
    const collection = Object.entries(store.goals[classId] ?? {}).filter(([, g]) => g.reachedAt).map(([w, g]) => ({ weekStart: w, plant: g.plant })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const teamOf = (id: string) => cls.teams.find((t) => t.studentIds.includes(id))?.id;
    const raw: GardenRaw = {
      classId, className: cls.name, grade: cls.grade, weekStart, goal, classStars, studentCount: cls.studentIds.length,
      students: staff ? students.map((p) => ({ id: p.id, name: p.name, mascot: p.avatarMascot, stars: stars[p.id] ?? 0, ...(teamOf(p.id) ? { teamId: teamOf(p.id) } : {}) })) : [],
      teams: cls.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.studentIds.length, stars: t.studentIds.reduce((s, id) => s + (stars[id] ?? 0), 0) })),
      collection,
      ...(!staff && me ? { me: { id: me.id, stars: stars[me.id] ?? 0, ...(teamOf(me.id) ? { teamId: teamOf(me.id) } : {}) } } : {}),
    };
    return tv ? anonymizeGarden(assembleGarden(raw)) : assembleGarden(raw);
  }

  async setGardenGoal(input: SetGardenGoalInput): Promise<ClassGarden> {
    const me = await this.viewer();
    const cls = await this.ds.getClass(input.classId);
    if (!me || !cls || (me.role !== 'admin' && !(me.role === 'teacher' && cls.teacherId === me.id))) throw fail('Chỉ thầy cô của lớp mới đặt mục tiêu được.');
    const target = Math.round(input.targetStars);
    if (!(target >= 10 && target <= 5000)) throw fail('Mục tiêu nên từ 10 đến 5000 sao.');
    const { store, now, save } = await this.kv();
    const wk = vnWeekStart(now);
    // Đổi mục tiêu: xét lại "đã đạt" theo mục tiêu mới.
    store.goals[input.classId] = { ...(store.goals[input.classId] ?? {}), [wk]: { targetStars: target, plant: input.plant } };
    save(store);
    return this.getClassGarden(input.classId);
  }
}

