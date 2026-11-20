/**
 * Đấu 1–1 ở chế độ demo: ghép cặp qua BroadcastChannel giữa các tab cùng trình duyệt (mở 2 tab, đăng nhập 2 bạn),
 * hoặc đấu với bạn Robo. Chấm trên máy, ghi learning_events 'arena' (có kĩ năng) và cộng sao qua sổ thưởng.
 */
import {
  DUEL_BOT_ID,
  SKILL_BY_CODE,
  type AnyResponse,
  DUEL_QUESTIONS,
  uid,
  type DataSource,
  type DuelAnswerReport,
  type DuelInfo,
  type DuelInvite,
  type DuelLobby,
  type DuelPlayer,
  type DuelResult,
  type DuelSeekOptions,
  type DuelService,
  type DuelStats,
  type DuelTransport,
  type Item,
} from '@openedu/contracts';
import { dayKey } from '../rewards';
import { loadScorer } from '../live/types';
import { answerAnnotations } from '../mastery';
import { DUEL_LIMIT_MS, botPlan, botProfileFor, decideWinner, duelPoints, duelStars, outcomeFor, pickDuelItems, randomCode, randomSeed, totalCorrect, totalPoints } from './logic';
import { botChannel, broadcastTransport } from './match';


export const LOBBY_CHANNEL = 'openedu-duel-lobby';
const HERE_MS = 2500;
const ONLINE_TTL_MS = 8000;

type LobbyMsg =
  | { t: 'here'; player: DuelPlayer; classId?: string; grade: number }
  | { t: 'gone'; userId: string }
  | { t: 'seek'; player: DuelPlayer; classId?: string; grade: number; subject: string }
  | { t: 'offer'; duel: DuelInfo }
  | { t: 'accept'; duelId: string; userId: string }
  | { t: 'reject'; duelId: string; userId: string }
  | { t: 'join'; code: string; player: DuelPlayer }
  | { t: 'match'; duel: DuelInfo }
  | { t: 'invite'; to: string; invite: DuelInvite }
  | { t: 'decline'; duelId: string; userId: string };

export function robo(): DuelPlayer {
  return { userId: DUEL_BOT_ID, name: 'Bạn Robo', mascot: 'panda', color: '#64748b', isBot: true };
}

const friendly = (m: string) => Object.assign(new Error(m), { friendly: true });

export function abortError(): Error {
  return Object.assign(new Error('Đã dừng tìm bạn.'), { name: 'AbortError' });
}

class DemoLobby implements DuelLobby {
  private ch: { post(m: LobbyMsg): void; close(): void };
  private seen = new Map<string, { player: DuelPlayer; at: number }>();
  private changeHs = new Set<() => void>();
  private inviteHs = new Set<(i: DuelInvite) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private seeking: { resolve(d: DuelInfo): void; reject(e: Error): void; offer?: DuelInfo } | null = null;
  private hosting: { duel: DuelInfo; resolve(d: DuelInfo): void; reject(e: Error): void; invitee?: string } | null = null;
  private joining: { code: string; resolve(d: DuelInfo): void } | null = null;

  constructor(private svc: DemoDuelService, private opts: DuelSeekOptions) {
    const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
    if (BC) {
      const bc = new BC(LOBBY_CHANNEL);
      bc.onmessage = (ev: MessageEvent) => this.onMsg(ev.data as LobbyMsg);
      this.ch = { post: (m) => { try { bc.postMessage(m); } catch { /* đã đóng */ } }, close: () => bc.close() };
    } else this.ch = { post: () => undefined, close: () => undefined };
    const here = () => {
      this.ch.post({ t: 'here', player: opts.me, classId: opts.classId, grade: opts.grade });
      this.prune();
    };
    here();
    this.timers.push(setInterval(here, HERE_MS));
  }

  private get meId() { return this.opts.me.userId; }
  private sameRoom(classId: string | undefined, grade: number): boolean {
    return this.opts.classId ? classId === this.opts.classId : grade === this.opts.grade;
  }
  private emitChange() { for (const h of [...this.changeHs]) h(); }
  private prune() {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.seen) if (now - v.at > ONLINE_TTL_MS) { this.seen.delete(k); changed = true; }
    if (changed) this.emitChange();
  }

  private onMsg(m: LobbyMsg): void {
    switch (m.t) {
      case 'here':
        if (m.player.userId !== this.meId && this.sameRoom(m.classId, m.grade)) {
          const had = this.seen.has(m.player.userId);
          this.seen.set(m.player.userId, { player: m.player, at: Date.now() });
          if (!had) this.emitChange();
        }
        break;
      case 'gone':
        if (this.seen.delete(m.userId)) this.emitChange();
        break;
      case 'seek': {
        if (!this.seeking || this.seeking.offer || m.player.userId === this.meId) break;
        if (!this.sameRoom(m.classId, m.grade) || m.subject !== this.opts.subject) break;
        // Bạn có id nhỏ hơn làm chủ phòng → không bị ghép trùng hai phía.
        if (this.meId > m.player.userId) break;
        const seek = this.seeking;
        void this.svc.createDuel(this.opts, 'queue', m.player).then((duel) => {
          if (this.seeking !== seek || seek.offer) return;
          seek.offer = duel;
          this.ch.post({ t: 'offer', duel });
          setTimeout(() => { if (seek.offer === duel) seek.offer = undefined; }, 2500);
        });
        break;
      }
      case 'offer': {
        const d = m.duel;
        if (d.players[1]?.userId !== this.meId) break;
        if (this.seeking && !this.seeking.offer && d.subject === this.opts.subject) {
          const s = this.seeking;
          this.seeking = null;
          this.ch.post({ t: 'accept', duelId: d.id, userId: this.meId });
          s.resolve(d);
        } else this.ch.post({ t: 'reject', duelId: d.id, userId: this.meId });
        break;
      }
      case 'accept':
        if (this.seeking?.offer?.id === m.duelId) {
          const s = this.seeking;
          this.seeking = null;
          s.resolve({ ...(s.offer as DuelInfo), status: 'playing' });
        }
        break;
      case 'reject':
        if (this.seeking?.offer?.id === m.duelId) this.seeking.offer = undefined;
        break;
      case 'join': {
        const h = this.hosting;
        if (!h || h.duel.code !== m.code || m.player.userId === this.meId) break;
        if (h.invitee && h.invitee !== m.player.userId) break;
        const duel: DuelInfo = { ...h.duel, players: [h.duel.players[0], m.player], status: 'playing' };
        this.hosting = null;
        this.ch.post({ t: 'match', duel });
        h.resolve(duel);
        break;
      }
      case 'match':
        if (this.joining && m.duel.code === this.joining.code && m.duel.players[1]?.userId === this.meId) {
          const j = this.joining;
          this.joining = null;
          j.resolve(m.duel);
        }
        break;
      case 'invite':
        if (m.to === this.meId) for (const h of [...this.inviteHs]) h(m.invite);
        break;
      case 'decline':
        if (this.hosting?.duel.id === m.duelId && m.userId === this.hosting.invitee) {
          const h = this.hosting;
          this.hosting = null;
          h.reject(friendly('Bạn ấy chưa muốn đấu lúc này. Em thử mời bạn khác nhé!'));
        }
        break;
    }
  }

  seek(signal?: AbortSignal): Promise<DuelInfo> {
    return new Promise<DuelInfo>((resolve, reject) => {
      const send = () => this.ch.post({ t: 'seek', player: this.opts.me, classId: this.opts.classId, grade: this.opts.grade, subject: this.opts.subject });
      const t = setInterval(() => { if (this.seeking) send(); }, 1200);
      const done = () => { clearInterval(t); signal?.removeEventListener('abort', onAbort); };
      const onAbort = () => { if (this.seeking) { this.seeking = null; done(); reject(abortError()); } };
      this.seeking = { resolve: (d) => { done(); resolve(d); }, reject: (e) => { done(); reject(e); } };
      signal?.addEventListener('abort', onAbort);
      send();
    });
  }

  async host(invitee?: string, signal?: AbortSignal): Promise<{ duel: DuelInfo; ready: Promise<DuelInfo> }> {
    const duel = await this.svc.createDuel(this.opts, invitee ? 'challenge' : 'code');
    const ready = new Promise<DuelInfo>((resolve, reject) => {
      let t: ReturnType<typeof setInterval> | null = null;
      const stop = () => { if (t) clearInterval(t); };
      this.hosting = { duel, invitee, resolve: (d) => { stop(); resolve(d); }, reject: (e) => { stop(); reject(e); } };
      if (invitee) {
        const inv: DuelInvite = { duelId: duel.id, code: duel.code, from: this.opts.me, subject: this.opts.subject };
        const send = () => this.ch.post({ t: 'invite', to: invitee, invite: inv });
        send();
        t = setInterval(send, 3000);
      }
      signal?.addEventListener('abort', () => {
        if (this.hosting?.duel.id === duel.id) { this.hosting = null; stop(); reject(abortError()); }
      });
    });
    ready.catch(() => undefined);
    return { duel, ready };
  }

  join(code: string): Promise<DuelInfo> {
    const c = code.trim();
    return new Promise<DuelInfo>((resolve, reject) => {
      if (!/^\d{4}$/.test(c)) { reject(friendly('Mã phòng có 4 chữ số. Em xem lại nhé!')); return; }
      let tries = 0;
      const send = () => this.ch.post({ t: 'join', code: c, player: this.opts.me });
      const t = setInterval(() => {
        if (!this.joining) { clearInterval(t); return; }
        if (++tries >= 4) { clearInterval(t); this.joining = null; reject(friendly('Không tìm thấy phòng này. Em hỏi lại bạn mã 4 số nhé!')); return; }
        send();
      }, 800);
      this.joining = { code: c, resolve: (d) => { clearInterval(t); resolve(d); } };
      send();
    });
  }

  bot(): Promise<DuelInfo> {
    return this.svc.createDuel(this.opts, 'bot', robo());
  }

  online(): DuelPlayer[] {
    return [...this.seen.values()].map((v) => v.player);
  }
  onChange(h: () => void): () => void {
    this.changeHs.add(h);
    return () => this.changeHs.delete(h);
  }
  onInvite(h: (i: DuelInvite) => void): () => void {
    this.inviteHs.add(h);
    return () => this.inviteHs.delete(h);
  }
  declineInvite(inv: DuelInvite): void {
    this.ch.post({ t: 'decline', duelId: inv.duelId, userId: this.meId });
  }
  async cancel(duelId?: string): Promise<void> {
    if (this.seeking) { const s = this.seeking; this.seeking = null; s.reject(abortError()); }
    if (this.hosting && (!duelId || this.hosting.duel.id === duelId)) { const h = this.hosting; this.hosting = null; h.reject(abortError()); }
    this.joining = null;
  }
  close(): void {
    void this.cancel();
    for (const t of this.timers) clearInterval(t);
    this.ch.post({ t: 'gone', userId: this.meId });
    this.ch.close();
    this.changeHs.clear();
    this.inviteHs.clear();
  }
}

export class DemoDuelService implements DuelService {
  readonly mode = 'demo' as const;
  constructor(private ds: DataSource) {}

  openLobby(opts: DuelSeekOptions): DuelLobby {
    return new DemoLobby(this, opts);
  }

  /** Chủ phòng chọn câu (theo kĩ năng chủ phòng đang học) và hạt giống; bạn kia nhận nguyên DuelInfo. */
  async createDuel(opts: DuelSeekOptions, mode: DuelInfo['mode'], opponent?: DuelPlayer): Promise<DuelInfo> {
    const seed = randomSeed();
    const [pool, mastery] = await Promise.all([
      this.ds.listItems({ grade: opts.grade, subject: opts.subject }),
      this.ds.getSkillMastery(opts.me.userId).catch(() => []),
    ]);
    const items = pickDuelItems(pool, { seed, mastery });
    if (items.length < 3) throw friendly('Môn này chưa đủ câu hỏi để đấu. Em chọn môn khác nhé!');
    const duel: DuelInfo = {
      id: uid('duel'),
      code: randomCode(),
      mode,
      ...(opts.classId ? { classId: opts.classId } : {}),
      subject: opts.subject,
      grade: opts.grade,
      players: opponent ? [opts.me, opponent] : [opts.me],
      itemIds: items.map((i) => i.id),
      seed,
      status: opponent ? 'playing' : 'waiting',
      createdAt: new Date().toISOString(),
    };
    if (mode === 'bot') duel.botPlan = botPlan(botProfileFor(mastery, (code) => SKILL_BY_CODE[code]?.subject === opts.subject), seed, items.length);
    return duel;
  }

  openChannel(duel: DuelInfo, meId: string): DuelTransport {
    if (duel.players.some((p) => p.isBot)) return botChannel(duel);
    void meId;
    return broadcastTransport(`openedu-duel:${duel.id}`);
  }

  async grade(input: { userId: string; duel: DuelInfo; q: number; item: Item; response: AnyResponse; ms: number }): Promise<DuelAnswerReport> {
    const score = await loadScorer();
    const item = (await this.ds.getItem(input.item.id)) ?? input.item;
    const r = score(item, input.response);
    const correct = !!r.graded && !!r.correct;
    const ms = Math.min(DUEL_LIMIT_MS, Math.max(0, Math.round(input.ms)));
    await this.ds.recordEvent({
      userId: input.userId,
      verb: 'answered',
      objectType: 'arena',
      objectId: item.id,
      result: { correct, score: r.score, durationMs: ms, response: input.response as unknown, ...answerAnnotations(item, input.response, correct) },
    });
    return { q: input.q, correct, ms, points: duelPoints(correct, ms) };
  }

  async skip(): Promise<void> {
    /* demo: hết giờ chỉ tính trên máy */
  }

  async finish(duel: DuelInfo, meId: string, local: { answers: Record<string, DuelAnswerReport[]>; forfeitBy?: string }): Promise<DuelResult> {
    const [a, b] = [duel.players[0].userId, duel.players[1]?.userId ?? DUEL_BOT_ID];
    const winner = decideWinner(a, b, local.answers, local.forfeitBy);
    const outcome = outcomeFor(meId, winner);
    const scores = { [a]: totalPoints(local.answers[a]), [b]: totalPoints(local.answers[b]) };
    const correct = { [a]: totalCorrect(local.answers[a]), [b]: totalCorrect(local.answers[b]) };
    const sourceId = `duel:${duel.id}`;
    const today = dayKey(new Date());
    const rewards = (await this.ds.listRewards(meId, 300)).filter((r) => r.sourceType === 'arena' && (r.sourceId ?? '').startsWith('duel:'));
    const already = rewards.some((r) => r.sourceId === sourceId);
    const { stars, capped } = already ? { stars: 0, capped: false } : duelStars(outcome, rewards.filter((r) => dayKey(r.at) === today).length, local.forfeitBy === meId);
    let award: DuelResult['award'];
    if (stars > 0) {
      award = await this.ds.award({
        userId: meId,
        stars,
        coins: stars,
        xp: stars * 10,
        reason: outcome === 'win' ? 'Thắng trận Đấu 1–1' : 'Tham gia Đấu 1–1',
        sourceType: 'arena',
        sourceId,
      });
    }
    if (!already) {
      const opp = duel.players.find((p) => p.userId !== meId);
      await this.ds.recordEvent({
        userId: meId,
        verb: 'completed',
        objectType: 'arena',
        objectId: sourceId,
        result: { correct: outcome === 'win', score: scores[meId] ?? 0, correctCount: correct[meId] ?? 0, total: duel.itemIds.length || DUEL_QUESTIONS, response: { outcome, opponent: opp?.name ?? '', bot: !!opp?.isBot, subject: duel.subject } },
      });
    }
    return { duelId: duel.id, scores, correct, winner, outcome, ...(local.forfeitBy ? { forfeitBy: local.forfeitBy } : {}), starsAwarded: stars, capped, ...(award ? { award } : {}) };
  }

  async getStats(userId: string): Promise<DuelStats> {
    const events = await this.ds.listEvents({ userId, limit: 6000 });
    return statsFromEvents(userId, events);
  }
}

export function statsFromEvents(userId: string, events: { verb: string; objectType: string; objectId: string; result?: { response?: unknown } }[]): DuelStats {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const e of events) {
    if (e.verb !== 'completed' || e.objectType !== 'arena' || !e.objectId.startsWith('duel:')) continue;
    const o = (e.result?.response as { outcome?: string } | undefined)?.outcome;
    if (o === 'win') wins++;
    else if (o === 'draw') draws++;
    else losses++;
  }
  const played = wins + draws + losses;
  return { userId, played, wins, draws, losses, winRate: played ? Math.round((wins / played) * 100) / 100 : 0 };
}
