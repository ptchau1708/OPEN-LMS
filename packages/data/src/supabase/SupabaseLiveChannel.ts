/**
 * Kênh trực tiếp qua Supabase Realtime (docs/SUPABASE_API.md):
 * - kênh `live:{sessionId}`: broadcast `state` (GV gửi sau mỗi lệnh + lưu bằng RPC update_live_state), presence.
 * - live_responses: postgres_changes INSERT lọc session_id (GV và TV).
 * - HS trả lời qua Edge Function `grade` (server chấm, ghi live_responses).
 *
 * ⚠ CHƯA KIỂM THỬ với Supabase thật. Các GIẢ ĐỊNH:
 * - HS/TV đọc được live_sessions.state theo id (RLS cho thành viên lớp); nếu không, chờ GV phát lại state —
 *   máy GV phát lại mỗi khi có người mới vào kênh (presence join).
 * - start_live có thể để state rỗng: máy GV tự khởi tạo state ban đầu (teams theo class_teams).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LiveCommand, LiveMessage, LiveParticipant, LiveResponse, LiveRole, LiveState, Profile } from '@openedu/contracts';
import { applyLiveCommand, createInitialLiveState } from '../live/reducer';
import type { ChannelStatus, StatusfulLiveChannel } from '../live/types';
import type { V2Client } from './client';
import { fromClass, fromLiveResponse, fromLiveStateColumn, pick, type Row } from './mapping';

type PresenceMeta = { kind: 'student' | 'teacher' | 'screen'; userId: string } & Partial<LiveParticipant>;

function respKey(r: LiveResponse): string {
  return `${r.userId}|${r.itemId}|${r.slideIndex}`;
}

/** Bỏ lesson/items khi phát (Supabase không gửi kèm bài; máy HS tải item không có key). */
function slim(s: LiveState): LiveState {
  const { lesson: _l, items: _i, ...rest } = s;
  return rest as LiveState;
}

export class SupabaseLiveChannel implements StatusfulLiveChannel {
  readonly sessionId: string;
  readonly role: LiveRole;
  private sb: V2Client;
  private me: Profile | null;
  private ch: RealtimeChannel;
  private state: LiveState | null = null;
  private handlers = new Set<(m: LiveMessage) => void>();
  private statusHandlers = new Set<(s: ChannelStatus, e: string | null) => void>();
  private readyWaiters: ((ok: boolean) => void)[] = [];
  private _status: ChannelStatus = 'connecting';
  private _error: string | null = null;
  private list: LiveResponse[] = [];
  private presence: LiveParticipant[] = [];
  private participant: LiveParticipant | null = null;
  private closed = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sb: V2Client, sessionId: string, role: LiveRole, me: Profile | null) {
    this.sb = sb;
    this.sessionId = sessionId;
    this.role = role;
    this.me = me;
    this.ch = sb.channel(`live:${sessionId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me?.id ?? `anon-${Math.random().toString(36).slice(2)}` } },
    });
    this.wire();
    void this.bootstrap();
  }

  /* ---------- trạng thái kết nối ---------- */
  get status(): ChannelStatus {
    return this._status;
  }
  get error(): string | null {
    return this._error;
  }
  onStatus(h: (s: ChannelStatus, e: string | null) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }
  whenReady(timeoutMs = 4000): Promise<boolean> {
    if (this._status === 'open' && this.state) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== done);
        resolve(false);
      }, timeoutMs);
      const done = (ok: boolean) => {
        clearTimeout(t);
        resolve(ok);
      };
      this.readyWaiters.push(done);
    });
  }
  private setStatus(s: ChannelStatus, e: string | null = null): void {
    if (this.closed && s !== 'closed') return;
    this._status = s;
    this._error = e;
    for (const h of [...this.statusHandlers]) h(s, e);
    this.flushReady();
  }
  private flushReady(): void {
    const ok = this._status === 'open' && !!this.state;
    if (!ok && this._status !== 'closed') return;
    const ws = this.readyWaiters;
    this.readyWaiters = [];
    for (const w of ws) w(ok);
  }
  private emit(m: LiveMessage): void {
    for (const h of [...this.handlers]) {
      try {
        h(m);
      } catch {
        /* bỏ qua */
      }
    }
  }
  private adopt(s: LiveState): void {
    this.state = s;
    this.emit({ kind: 'state', state: s });
    this.flushReady();
  }

  /* ---------- realtime ---------- */
  private wire(): void {
    this.ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const s = (payload as { state?: LiveState } | undefined)?.state;
      if (!s || s.sessionId !== this.sessionId) return;
      if (this.state && Date.parse(s.updatedAt) < Date.parse(this.state.updatedAt)) return;
      this.adopt(this.role === 'teacher' && this.state ? { ...s, lesson: this.state.lesson, items: this.state.items } : s);
    });

    this.ch.on('presence', { event: 'sync' }, () => {
      const st = this.ch.presenceState<PresenceMeta>();
      const students: LiveParticipant[] = [];
      for (const metas of Object.values(st)) {
        const m = metas[metas.length - 1];
        if (m && m.kind === 'student' && m.userId) {
          students.push({ userId: m.userId, name: m.name ?? '', mascot: m.mascot ?? 'nghe', color: m.color ?? '#20a974', ...(m.teamId ? { teamId: m.teamId } : {}) });
        }
      }
      this.presence = students;
      this.emit({ kind: 'presence', participants: students });
      if (this.role === 'teacher') this.absorbParticipants(students);
    });

    this.ch.on('presence', { event: 'join' }, () => {
      // Có người mới vào: GV phát lại trạng thái để máy đó đồng bộ ngay.
      if (this.role === 'teacher' && this.state) void this.broadcast(this.state);
    });

    if (this.role !== 'student') {
      this.ch.on('postgres_changes', { event: 'INSERT', schema: 'v2', table: 'live_responses', filter: `session_id=eq.${this.sessionId}` }, (payload) => {
        const r = fromLiveResponse(payload.new as Row);
        this.list = this.list.filter((x) => respKey(x) !== respKey(r));
        this.list.push(r);
        this.emit({ kind: 'response', response: r });
      });
    }

    this.ch.subscribe((status, err) => {
      if (this.closed) return;
      if (status === 'SUBSCRIBED') {
        void this.trackSelf();
        this.setStatus('open');
      } else if (status === 'CHANNEL_ERROR') {
        this.setStatus('error', `Mất kết nối lớp học trực tiếp${err?.message ? ` (${err.message})` : ''}. Đang thử lại…`);
      } else if (status === 'TIMED_OUT') {
        this.setStatus('connecting', 'Kết nối chậm, đang thử lại…');
      } else if (status === 'CLOSED') {
        this.setStatus('connecting', 'Mất kết nối, đang nối lại…');
      }
    });
  }

  private async trackSelf(): Promise<void> {
    if (!this.me) return;
    const meta: PresenceMeta =
      this.role === 'student' && this.participant
        ? { kind: 'student', ...this.participant, userId: this.participant.userId }
        : { kind: this.role === 'student' ? 'student' : this.role, userId: this.me.id, name: this.me.name };
    if (this.role === 'student' && !this.participant) return; // HS chỉ hiện trong danh sách sau khi join()
    try {
      await this.ch.track(meta);
    } catch {
      /* thử lại khi kết nối lại */
    }
  }

  /** Tải trạng thái và câu trả lời đã có (vào lại giữa giờ). */
  private async bootstrap(): Promise<void> {
    try {
      const { data, error } = await this.sb.from('live_sessions').select('id, pin, lesson_id, class_id, state').eq('id', this.sessionId).maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as Row | null;
      let s = fromLiveStateColumn(row?.state);
      if (!s && row && this.role === 'teacher') {
        // start_live chưa khởi tạo state: GV tạo state ban đầu, tổ lấy theo lớp.
        let teams: LiveState['teams'] = [];
        const classId = pick<string>(row, 'classId');
        if (classId) {
          const { data: c } = await this.sb.from('classes').select('*, class_members(user_id, role, team_id), class_teams(id, name, color)').eq('id', classId).maybeSingle();
          if (c) teams = fromClass(c as Row).teams.map((t) => ({ id: t.id, name: t.name, color: t.color, stars: 0 }));
        }
        s = createInitialLiveState({ sessionId: this.sessionId, pin: String(row.pin ?? ''), lessonId: String(row.lesson_id ?? ''), teams });
        await this.persist(s);
      }
      if (s && (!this.state || Date.parse(s.updatedAt) >= Date.parse(this.state.updatedAt))) this.adopt(s);
      if (this.role !== 'student') {
        const { data: rs } = await this.sb.from('live_responses').select('*').eq('session_id', this.sessionId).order('at');
        const map = new Map<string, LiveResponse>();
        for (const r of ((rs ?? []) as Row[]).map(fromLiveResponse)) map.set(respKey(r), r);
        for (const r of this.list) map.set(respKey(r), r);
        this.list = [...map.values()];
      }
    } catch (e) {
      // HS có thể không có quyền đọc live_sessions: chờ GV phát state qua broadcast.
      if (this.role === 'teacher') this.setStatus('error', `Không tải được phiên học: ${(e as Error).message ?? e}`);
    }
  }

  private async broadcast(s: LiveState): Promise<void> {
    try {
      await this.ch.send({ type: 'broadcast', event: 'state', payload: { state: slim(s) } });
    } catch {
      /* lần lệnh sau / presence join sẽ phát lại */
    }
  }

  private async persist(s: LiveState): Promise<void> {
    const { error } = await this.sb.rpc('update_live_state', { p_session_id: this.sessionId, p_state: slim(s) });
    if (error) this.setStatus(this._status, `Chưa lưu được trạng thái lớp: ${error.message}`);
  }

  /** GV: thêm HS mới vào state.participants (giống relay). */
  private absorbParticipants(online: LiveParticipant[]): void {
    if (!this.state) return;
    const known = new Set(this.state.participants.map((p) => p.userId));
    const extra = online.filter((p) => !known.has(p.userId));
    if (!extra.length) return;
    const next: LiveState = { ...this.state, participants: [...this.state.participants, ...extra], updatedAt: new Date(Math.max(Date.now(), Date.parse(this.state.updatedAt) + 1)).toISOString() };
    this.adopt(next);
    void this.broadcast(next);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(next), 800);
  }

  /* ---------- LiveChannel ---------- */
  getState(): LiveState | null {
    return this.state;
  }

  subscribe(handler: (msg: LiveMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async send(cmd: LiveCommand): Promise<void> {
    if (this.role !== 'teacher') throw new Error('Chỉ giáo viên mới điều khiển được lớp học.');
    if (!this.state) throw new Error('Lớp học chưa sẵn sàng, thầy cô chờ một chút nhé.');
    const next = applyLiveCommand(this.state, cmd);
    if (next === this.state) return;
    this.adopt(next);
    await Promise.all([this.broadcast(next), this.persist(next)]);
  }

  async join(p: LiveParticipant): Promise<void> {
    this.participant = p;
    if (this._status === 'open') await this.trackSelf();
  }

  async respond(r: Omit<LiveResponse, 'at' | 'correct' | 'score'>): Promise<{ correct?: boolean; score?: number }> {
    const { data, error } = await this.sb.functions.invoke('grade', {
      body: { itemId: r.itemId, response: r.response, context: { liveSessionId: this.sessionId, slideIndex: r.slideIndex, lessonId: this.state?.lessonId } },
    });
    if (error) throw new Error('Chưa gửi được câu trả lời, em thử lại nhé!');
    const d = (data ?? {}) as Row;
    const graded = d.graded !== false;
    const out: { correct?: boolean; score?: number } = graded ? { correct: !!d.correct, score: Number(d.score ?? 0) || 0 } : {};
    const mine: LiveResponse = { ...r, sessionId: this.sessionId, at: new Date().toISOString(), ...out };
    this.list = this.list.filter((x) => respKey(x) !== respKey(mine));
    this.list.push(mine);
    return out;
  }

  responses(slideIndex: number): LiveResponse[] {
    return this.list.filter((r) => r.slideIndex === slideIndex).sort((a, b) => a.at.localeCompare(b.at));
  }

  online(): LiveParticipant[] {
    return this.presence;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    void this.sb.removeChannel(this.ch);
    this.setStatus('closed');
    this.handlers.clear();
  }

}
