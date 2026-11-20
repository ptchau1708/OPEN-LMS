/**
 * Điều khiển một trận: nối máy trạng thái với kênh (DuelTransport) và đồng hồ.
 * Không biết gì về giao diện; app gọi answer() sau khi đã chấm câu qua DuelService.grade().
 */
import type { DuelAnswerReport, DuelInfo, DuelPlayer, DuelReaction, DuelTransport, DuelWire } from '@openedu/contracts';
import { createMatchState, duelReducer, type DuelEvent, type DuelMatchState } from './machine';
import { botReport } from './logic';

export interface DuelClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realClock: DuelClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export const PING_MS = 2000;
const TICK_MS = 200;

export class DuelMatch {
  readonly duel: DuelInfo;
  readonly me: DuelPlayer;
  readonly opp: DuelPlayer;
  private s: DuelMatchState;
  private handlers = new Set<(s: DuelMatchState) => void>();
  private msgHandlers = new Set<(m: DuelWire) => void>();
  private unsub: (() => void) | null = null;
  private timer: unknown = null;
  private lastPing = 0;
  private helloSent = 0;
  private stopped = false;

  constructor(duel: DuelInfo, meId: string, private transport: DuelTransport, private clock: DuelClock = realClock) {
    this.duel = duel;
    const me = duel.players.find((p) => p.userId === meId);
    const opp = duel.players.find((p) => p.userId !== meId);
    if (!me || !opp) throw new Error('Trận đấu chưa đủ hai bạn.');
    this.me = me;
    this.opp = opp;
    this.s = createMatchState({ me: me.userId, opp: opp.userId, isHost: duel.players[0].userId === meId, at: clock.now(), total: duel.itemIds.length });
  }

  get state(): DuelMatchState {
    return this.s;
  }

  subscribe(h: (s: DuelMatchState) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  /** Tin khác (rematch…) cho giao diện. */
  onMessage(h: (m: DuelWire) => void): () => void {
    this.msgHandlers.add(h);
    return () => this.msgHandlers.delete(h);
  }

  start(): void {
    if (this.unsub) return;
    this.unsub = this.transport.subscribe((m) => this.receive(m));
    this.sendHello();
    this.timer = this.clock.setInterval(() => this.tick(), TICK_MS);
  }

  private sendHello(): void {
    this.helloSent++;
    this.transport.send({ t: 'hello', from: this.me.userId, player: this.me });
  }

  private dispatch(e: DuelEvent): void {
    const prev = this.s;
    const next = duelReducer(prev, e);
    if (next === prev) return;
    this.s = next;
    // Hết giờ do chính máy này tự điền → báo cho bạn.
    const mine = next.answers[next.me]?.[prev.q];
    if (mine && !prev.answers[prev.me]?.[prev.q] && mine.timedOut) this.transport.send({ t: 'answered', from: this.me.userId, report: mine });
    if (next.isHost && next.phase === 'question' && (prev.phase !== 'question' || prev.q !== next.q)) {
      this.transport.send({ t: 'round', from: this.me.userId, q: next.q });
    }
    if (next.isHost && next.phase === 'finished' && prev.phase !== 'finished') this.transport.send({ t: 'end', from: this.me.userId });
    for (const h of [...this.handlers]) h(next);
  }

  private receive(m: DuelWire): void {
    if (this.stopped || m.from === this.me.userId || m.from !== this.opp.userId) return;
    const at = this.clock.now();
    const firstSight = !this.s.oppSeen;
    this.dispatch({ type: 'seen', at });
    switch (m.t) {
      case 'hello':
        // Bạn mới mở kênh (hoặc vào lại): chào lại để bạn biết mình đang ở đây.
        if (firstSight || this.helloSent < 3) this.sendHello();
        break;
      case 'ping':
        for (const r of m.answers) this.dispatch({ type: 'answer', userId: m.from, report: r, at });
        if (!this.s.isHost && m.q > this.s.q) this.dispatch({ type: 'round', q: m.q, at });
        break;
      case 'round':
        this.dispatch({ type: 'round', q: m.q, at });
        break;
      case 'answered':
        this.dispatch({ type: 'answer', userId: m.from, report: m.report, at });
        break;
      case 'react':
        this.dispatch({ type: 'react', from: m.from, emoji: m.emoji, at });
        break;
      case 'leave':
        this.dispatch({ type: 'leave', from: m.from, at });
        break;
      default:
        break;
    }
    for (const h of [...this.msgHandlers]) h(m);
  }

  private tick(): void {
    if (this.stopped) return;
    const at = this.clock.now();
    this.dispatch({ type: 'tick', at });
    if (at - this.lastPing >= PING_MS) {
      this.lastPing = at;
      const answers = (this.s.answers[this.me.userId] ?? []).filter((r): r is DuelAnswerReport => !!r);
      this.transport.send({ t: 'ping', from: this.me.userId, q: this.s.q, answers });
    }
  }

  setPending(q: number | null): void {
    this.dispatch({ type: 'pending', q });
  }

  answer(report: DuelAnswerReport): void {
    const before = this.s.answers[this.me.userId]?.[report.q];
    this.dispatch({ type: 'answer', userId: this.me.userId, report, at: this.clock.now() });
    if (!before || before.timedOut) this.transport.send({ t: 'answered', from: this.me.userId, report });
  }

  react(emoji: DuelReaction): void {
    this.transport.send({ t: 'react', from: this.me.userId, emoji });
    this.dispatch({ type: 'react', from: this.me.userId, emoji, at: this.clock.now() });
  }

  send(m: DuelWire): void {
    this.transport.send(m);
  }

  /** Rời trận giữa chừng (bạn kia thắng). */
  leave(): void {
    if (this.s.phase !== 'finished') this.transport.send({ t: 'leave', from: this.me.userId });
    this.stop();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer != null) this.clock.clearInterval(this.timer);
    this.unsub?.();
    this.transport.close();
  }
}

/* ---------------- kênh ---------------- */

/** Hai đầu kênh nối thẳng trong bộ nhớ (bạn Robo, kiểm thử). Tin gửi bất đồng bộ như mạng thật. */
export function loopbackPair(defer: (fn: () => void) => void = (fn) => queueMicrotask(fn)): [DuelTransport, DuelTransport] {
  const subs: [Set<(m: DuelWire) => void>, Set<(m: DuelWire) => void>] = [new Set(), new Set()];
  const closed = [false, false];
  const end = (i: 0 | 1): DuelTransport => ({
    send(m) {
      if (closed[i]) return;
      const copy = JSON.parse(JSON.stringify(m)) as DuelWire;
      defer(() => { if (!closed[1 - i]) for (const h of [...subs[1 - i]]) h(copy); });
    },
    subscribe(h) {
      subs[i].add(h);
      return () => subs[i].delete(h);
    },
    close() {
      closed[i] = true;
      subs[i].clear();
    },
  });
  return [end(0), end(1)];
}

/** Kênh BroadcastChannel giữa các tab cùng trình duyệt (demo). */
export function broadcastTransport(name: string): DuelTransport {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return { send: () => undefined, subscribe: () => () => undefined, close: () => undefined };
  const ch = new BC(name);
  const subs = new Set<(m: DuelWire) => void>();
  ch.onmessage = (ev: MessageEvent) => { for (const h of [...subs]) h(ev.data as DuelWire); };
  return {
    send: (m) => { try { ch.postMessage(m); } catch { /* kênh đã đóng */ } },
    subscribe: (h) => { subs.add(h); return () => subs.delete(h); },
    close: () => { subs.clear(); ch.close(); },
  };
}

/**
 * Bạn Robo: nghe nhịp câu hỏi trên kênh, trả lời theo kế hoạch (đúng/sai, thời gian), thỉnh thoảng cổ vũ.
 * Robo tự chạy máy trạng thái như một người chơi thật nên luôn cùng nhịp với em.
 */
export function attachBot(duel: DuelInfo, transport: DuelTransport, clock: DuelClock = realClock): { stop(): void } {
  const bot = duel.players.find((p) => p.isBot);
  const plan = duel.botPlan ?? [];
  if (!bot) throw new Error('Trận này không có bạn Robo.');
  const m = new DuelMatch(duel, bot.userId, transport, clock);
  let scheduledQ = -1;
  let timer: unknown = null;
  let cheered = false;
  m.subscribe((s) => {
    if (s.phase === 'question' && s.q !== scheduledQ) {
      scheduledQ = s.q;
      const q = s.q;
      if (timer != null) clock.clearTimeout(timer);
      timer = clock.setTimeout(() => {
        if (m.state.phase === 'question' && m.state.q === q) m.answer(botReport(plan, q));
      }, Math.max(0, botReport(plan, q).ms - (clock.now() - s.phaseAt)));
    }
    if (s.phase === 'finished' && !cheered) {
      cheered = true;
      clock.setTimeout(() => m.send({ t: 'react', from: bot.userId, emoji: '👏' }), 600);
    }
  });
  m.start();
  return { stop: () => { if (timer != null) clock.clearTimeout(timer); m.stop(); } };
}

/** Kênh tới bạn Robo chạy ngay trên máy (cả demo lẫn Supabase — kế hoạch của Robo đã có sẵn trong DuelInfo). */
export function botChannel(duel: DuelInfo, clock: DuelClock = realClock): DuelTransport {
  const [mine, bots] = loopbackPair((fn) => { clock.setTimeout(fn, 30); });
  const b = attachBot(duel, bots, clock);
  return { send: mine.send, subscribe: mine.subscribe, close: () => { mine.close(); b.stop(); } };
}
