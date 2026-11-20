/**
 * Đấu 1–1 trên Supabase (gói Free): bảng v2.duels + RPC duel_* (migration 20261113000001_v2_duels.sql),
 * kênh Realtime broadcast riêng tư `duel:{id}` (chỉ hai bạn trong trận) và `duel-lobby:{classId}` (presence + lời mời).
 * Câu trả lời chấm ở Edge Function `grade` với context.duelId — server ghi điểm; duel_finish tính thắng thua và cộng sao.
 */
import type {
  AnyResponse,
  DuelAnswerReport,
  DuelInfo,
  DuelInvite,
  DuelLobby,
  DuelPlayer,
  DuelResult,
  DuelSeekOptions,
  DuelService,
  DuelStats,
  DuelTransport,
  DuelWire,
  Item,
  MascotId,
} from '@openedu/contracts';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { fromWallet } from '../supabase/mapping';
import { abortError } from './demo';
import { duelPoints } from './logic';
import { botChannel } from './match';

type Row = Record<string, unknown>;

function errMsg(e: unknown, fallback: string): Error {
  const m = (e as { message?: string } | null)?.message;
  return Object.assign(new Error(m && /[à-ỹ]/i.test(m) ? m : fallback), { friendly: true });
}

async function rpc<T>(sb: V2Client, fn: string, args: Row, fallback: string): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw errMsg(error, fallback);
  return data as T;
}

/** Kênh broadcast: hàng đợi tin gửi trước khi kênh mở. */
function realtimeTransport(sbP: Promise<V2Client>, topic: string, key: string): DuelTransport & { ready: Promise<void> } {
  const subs = new Set<(m: DuelWire) => void>();
  const queue: DuelWire[] = [];
  let ch: RealtimeChannel | null = null;
  let open = false;
  let closed = false;
  const ready = sbP.then(
    (sb) =>
      new Promise<void>((resolve) => {
        if (closed) return resolve();
        ch = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key } } });
        ch.on('broadcast', { event: 'm' }, ({ payload }) => { for (const h of [...subs]) h(payload as DuelWire); });
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            open = true;
            for (const m of queue.splice(0)) void ch?.send({ type: 'broadcast', event: 'm', payload: m });
            resolve();
          }
        });
      }),
  );
  return {
    ready,
    send(m) {
      if (closed) return;
      if (open && ch) void ch.send({ type: 'broadcast', event: 'm', payload: m });
      else if (queue.length < 20) queue.push(m);
    },
    subscribe(h) {
      subs.add(h);
      return () => subs.delete(h);
    },
    close() {
      closed = true;
      subs.clear();
      if (ch) void sbP.then((sb) => sb.removeChannel(ch as RealtimeChannel));
    },
  };
}

function toDuel(r: Row): DuelInfo {
  // RPC trả về JSON đúng dạng DuelInfo (camelCase) — xem v2.duel_json.
  return r as unknown as DuelInfo;
}

class SupabaseLobby implements DuelLobby {
  private sbP: Promise<V2Client>;
  private lobby: RealtimeChannel | null = null;
  private onlineMap = new Map<string, DuelPlayer>();
  private changeHs = new Set<() => void>();
  private inviteHs = new Set<(i: DuelInvite) => void>();
  private waits = new Set<() => void>();

  constructor(private opts: DuelSeekOptions) {
    this.sbP = getSupabaseClient();
    if (opts.classId) {
      void this.sbP.then((sb) => {
        const ch = sb.channel(`duel-lobby:${opts.classId}`, { config: { private: true, broadcast: { self: false }, presence: { key: opts.me.userId } } });
        ch.on('presence', { event: 'sync' }, () => {
          this.onlineMap.clear();
          for (const [k, metas] of Object.entries(ch.presenceState<{ player: DuelPlayer }>())) {
            const p = metas[0]?.player;
            if (p && k !== opts.me.userId) this.onlineMap.set(k, p);
          }
          for (const h of [...this.changeHs]) h();
        });
        ch.on('broadcast', { event: 'invite' }, ({ payload }) => {
          const p = payload as { to: string; invite: DuelInvite };
          if (p.to === opts.me.userId) for (const h of [...this.inviteHs]) h(p.invite);
        });
        ch.subscribe((s) => { if (s === 'SUBSCRIBED') void ch.track({ player: opts.me }); });
        this.lobby = ch;
      }).catch(() => undefined);
    }
  }

  /** Chờ bạn vào trận: nghe 'hello' trên kênh trận, kèm hỏi lại server mỗi 3 giây. */
  private waitForOpponent(duel: DuelInfo, signal?: AbortSignal): Promise<DuelInfo> {
    return new Promise<DuelInfo>((resolve, reject) => {
      const t = realtimeTransport(this.sbP, `duel:${duel.id}`, this.opts.me.userId);
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; clearInterval(poll); t.close(); this.waits.delete(stop); fn(); };
      const check = async () => {
        const sb = await this.sbP;
        const d = await rpc<Row | null>(sb, 'duel_get', { p_id: duel.id }, 'Chưa kết nối được.').catch(() => null);
        if (!d) return;
        const info = toDuel(d);
        if (info.status === 'cancelled') finish(() => reject(Object.assign(new Error('Bạn ấy chưa muốn đấu lúc này. Em thử mời bạn khác nhé!'), { friendly: true })));
        else if (info.players.length >= 2) finish(() => resolve(info));
      };
      t.subscribe((m) => { if (m.t === 'hello' && m.from !== this.opts.me.userId) void check(); });
      const poll = setInterval(() => void check(), 3000);
      const stop = () => finish(() => reject(abortError()));
      this.waits.add(stop);
      signal?.addEventListener('abort', () => {
        void this.sbP.then((sb) => sb.rpc('duel_cancel', { p_id: duel.id }));
        stop();
      });
    });
  }

  async seek(signal?: AbortSignal): Promise<DuelInfo> {
    const sb = await this.sbP;
    const d = toDuel(await rpc<Row>(sb, 'duel_seek', { p_subject: this.opts.subject }, 'Chưa tìm được bạn. Em thử lại nhé!'));
    return d.players.length >= 2 ? d : this.waitForOpponent(d, signal);
  }

  async host(invitee?: string, signal?: AbortSignal): Promise<{ duel: DuelInfo; ready: Promise<DuelInfo> }> {
    const sb = await this.sbP;
    const duel = toDuel(await rpc<Row>(sb, 'duel_create', { p_subject: this.opts.subject, p_invitee: invitee ?? null }, 'Chưa mở được phòng. Em thử lại nhé!'));
    if (invitee && this.lobby) {
      const invite: DuelInvite = { duelId: duel.id, code: duel.code, from: this.opts.me, subject: this.opts.subject };
      void this.lobby.send({ type: 'broadcast', event: 'invite', payload: { to: invitee, invite } });
    }
    const ready = this.waitForOpponent(duel, signal);
    ready.catch(() => undefined);
    return { duel, ready };
  }

  async join(code: string): Promise<DuelInfo> {
    const c = code.trim();
    if (!/^\d{4}$/.test(c)) throw Object.assign(new Error('Mã phòng có 4 chữ số. Em xem lại nhé!'), { friendly: true });
    const sb = await this.sbP;
    return toDuel(await rpc<Row>(sb, 'duel_join', { p_code: c }, 'Không tìm thấy phòng này. Em hỏi lại bạn mã 4 số nhé!'));
  }

  async bot(): Promise<DuelInfo> {
    const sb = await this.sbP;
    return toDuel(await rpc<Row>(sb, 'duel_create_bot', { p_subject: this.opts.subject }, 'Bạn Robo đang bận. Em thử lại nhé!'));
  }

  online(): DuelPlayer[] {
    return [...this.onlineMap.values()];
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
    void this.sbP.then((sb) => sb.rpc('duel_cancel', { p_id: inv.duelId }));
  }
  async cancel(duelId?: string): Promise<void> {
    for (const s of [...this.waits]) s();
    if (duelId) await (await this.sbP).rpc('duel_cancel', { p_id: duelId });
  }
  close(): void {
    for (const s of [...this.waits]) s();
    const ch = this.lobby;
    if (ch) void this.sbP.then((sb) => sb.removeChannel(ch));
    this.changeHs.clear();
    this.inviteHs.clear();
  }
}

export class SupabaseDuelService implements DuelService {
  readonly mode = 'supabase' as const;

  openLobby(opts: DuelSeekOptions): DuelLobby {
    return new SupabaseLobby(opts);
  }

  openChannel(duel: DuelInfo, meId: string): DuelTransport {
    if (duel.players.some((p) => p.isBot)) return botChannel(duel);
    return realtimeTransport(getSupabaseClient(), `duel:${duel.id}`, meId);
  }

  async grade(input: { userId: string; duel: DuelInfo; q: number; item: Item; response: AnyResponse; ms: number }): Promise<DuelAnswerReport> {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.functions.invoke('grade', {
      body: { itemId: input.item.id, response: input.response, context: { duelId: input.duel.id, duelQ: input.q, durationMs: Math.round(input.ms) } },
    });
    if (error) throw errMsg(error, 'Chưa gửi được câu trả lời. Em kiểm tra mạng nhé!');
    const r = (data ?? {}) as Row;
    const correct = r.correct === true;
    const ms = Number(r.ms ?? input.ms) || 0;
    return { q: input.q, correct, ms, points: typeof r.points === 'number' ? r.points : duelPoints(correct, ms) };
  }

  async skip(input: { userId: string; duel: DuelInfo; q: number }): Promise<void> {
    if (input.duel.status === 'finished') return;
    const sb = await getSupabaseClient();
    await sb.rpc('duel_skip', { p_id: input.duel.id, p_q: input.q });
  }

  async finish(duel: DuelInfo, meId: string, local: { answers: Record<string, DuelAnswerReport[]>; forfeitBy?: string }): Promise<DuelResult> {
    const sb = await getSupabaseClient();
    const opp = duel.players.find((p) => p.userId !== meId);
    const claim = !!opp && local.forfeitBy === opp.userId;
    let r: Row = { pending: true };
    // Câu cuối của bạn có thể còn đang chấm: hỏi lại vài lần.
    for (let i = 0; i < 10 && r.pending === true; i++) {
      if (i > 0) await new Promise((res) => setTimeout(res, 1500));
      r = await rpc<Row>(sb, 'duel_finish', { p_id: duel.id, p_claim_forfeit: claim }, 'Chưa lưu được kết quả trận. Em thử lại nhé!');
    }
    if (r.pending === true) throw Object.assign(new Error('Đang chờ kết quả của bạn. Em bấm thử lại sau ít giây nhé!'), { friendly: true });
    const wallet = r.wallet ? fromWallet(r.wallet as Row, meId) : undefined;
    const winner = (r.winner as string | null) ?? null;
    return {
      duelId: duel.id,
      scores: (r.scores as Record<string, number>) ?? {},
      correct: (r.correct as Record<string, number>) ?? {},
      winner,
      outcome: winner == null ? 'draw' : winner === meId ? 'win' : 'lose',
      ...(r.forfeitBy ? { forfeitBy: String(r.forfeitBy) } : {}),
      starsAwarded: Number(r.stars ?? 0) || 0,
      capped: r.capped === true,
      ...(wallet ? { award: { wallet, newlyUnlocked: (r.newlyUnlocked as MascotId[]) ?? [] } } : {}),
    };
  }

  async getStats(userId: string): Promise<DuelStats> {
    const sb = await getSupabaseClient();
    const r = await rpc<Row>(sb, 'duel_stats', { p_user: userId }, 'Chưa tải được thống kê Đấu 1–1.');
    const played = Number(r.played ?? 0) || 0;
    const wins = Number(r.wins ?? 0) || 0;
    const draws = Number(r.draws ?? 0) || 0;
    return { userId, played, wins, draws, losses: Math.max(0, played - wins - draws), winRate: played ? Math.round((wins / played) * 100) / 100 : 0 };
  }
}
