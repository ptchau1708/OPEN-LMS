/**
 * Kênh cho MÀN HÌNH LỚP (TV) không đăng nhập — SQL 21 (v2.live_screen).
 *
 * App TV chạy ở địa chỉ riêng nên không có phiên đăng nhập của giáo viên: không đọc được live_sessions,
 * bài giảng, câu hỏi, câu trả lời. Kênh này:
 *  - hỏi RPC live_screen(phiên, mã lớp) mỗi ~2 giây: trạng thái + câu trả lời mới (lần đầu kèm bài giảng, câu hỏi);
 *  - nghe thêm broadcast `state` trên kênh `live:{id}` (nếu Realtime cho khách vào) để đổi câu tức thì;
 *  - đáp án chỉ có khi GV bấm "Hiện đáp án" (server chỉ gửi lúc đó) → ghép vào câu hỏi để TV tô đáp án đúng.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Item, Lesson, LiveCommand, LiveMessage, LiveParticipant, LiveResponse, LiveRole, LiveState } from '@openedu/contracts';
import type { ChannelStatus, StatusfulLiveChannel } from '../live/types';
import type { V2Client } from './client';
import { fromItem, fromLesson, fromLiveResponse, fromLiveStateColumn, type Row } from './mapping';

const respKey = (r: LiveResponse): string => `${r.userId}|${r.itemId}|${r.slideIndex}`;
const newer = (a: LiveState, b: LiveState | null): boolean => !b || Date.parse(a.updatedAt) >= Date.parse(b.updatedAt);

export interface ScreenPollOptions {
  /** Khoảng hỏi lại (ms). Mặc định 2000. */
  intervalMs?: number;
  /** Tắt nghe Realtime (kiểm thử). */
  realtime?: boolean;
}

export class SupabaseScreenChannel implements StatusfulLiveChannel {
  readonly sessionId: string;
  readonly role: LiveRole = 'screen';
  private sb: V2Client;
  private pin: string;
  private ch: RealtimeChannel | null = null;
  private base: LiveState | null = null;
  private lesson: Lesson | null = null;
  private items: Record<string, Item> = {};
  private keys: Record<string, unknown> = {};
  private merged: Record<string, Item> | null = null;
  private list: LiveResponse[] = [];
  private since: string | null = null;
  private handlers = new Set<(m: LiveMessage) => void>();
  private statusHandlers = new Set<(s: ChannelStatus, e: string | null) => void>();
  private readyWaiters: ((ok: boolean) => void)[] = [];
  private _status: ChannelStatus = 'connecting';
  private _error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private again = false;
  private closed = false;
  private interval: number;

  constructor(sb: V2Client, sessionId: string, pin: string, opts: ScreenPollOptions = {}) {
    this.sb = sb;
    this.sessionId = sessionId;
    this.pin = pin.replace(/\D/g, '');
    this.interval = opts.intervalMs ?? 2000;
    if (opts.realtime !== false) this.listen();
    void this.poll();
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
    if (this.base) return Promise.resolve(true);
    if (this.closed) return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(t);
        resolve(ok);
      };
      const t = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== done);
        resolve(false);
      }, timeoutMs);
      this.readyWaiters.push(done);
    });
  }
  private setStatus(s: ChannelStatus, e: string | null = null): void {
    if (this.closed && s !== 'closed') return;
    if (s === this._status && e === this._error) return;
    this._status = s;
    this._error = e;
    for (const h of [...this.statusHandlers]) h(s, e);
  }
  private flushReady(): void {
    if (!this.base && !this.closed) return;
    const ws = this.readyWaiters;
    this.readyWaiters = [];
    for (const w of ws) w(!!this.base);
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

  /* ---------- realtime (tăng tốc; thiếu cũng không sao) ---------- */
  private listen(): void {
    try {
      const ch = this.sb.channel(`live:${this.sessionId}`, {
        config: { broadcast: { self: false, ack: false }, presence: { key: `tv-${Math.random().toString(36).slice(2)}` } },
      });
      ch.on('broadcast', { event: 'state' }, ({ payload }) => {
        const s = (payload as { state?: LiveState } | undefined)?.state;
        if (!s || s.sessionId !== this.sessionId || !newer(s, this.base)) return;
        const phaseChanged = s.phase !== this.base?.phase || s.slideIndex !== this.base?.slideIndex;
        this.adopt(s);
        // Vừa hiện đáp án / đổi câu → hỏi ngay để lấy đáp án và câu trả lời.
        if (phaseChanged) this.kick();
      });
      ch.subscribe((status) => {
        // Báo có máy mới → máy GV phát lại trạng thái.
        if (status === 'SUBSCRIBED') void ch.track({ kind: 'screen', userId: '' }).catch(() => undefined);
      });
      this.ch = ch;
    } catch {
      this.ch = null;
    }
  }

  /* ---------- hỏi server ---------- */
  private kick(): void {
    if (this.closed) return;
    if (this.polling) {
      this.again = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.poll();
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    const ended = this.base?.phase === 'ended';
    this.timer = setTimeout(() => void this.poll(), ended ? this.interval * 4 : this.interval);
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    this.polling = true;
    const full = !this.lesson;
    try {
      const { data, error } = await this.sb.rpc('live_screen', { p_session: this.sessionId, p_pin: this.pin, p_since: this.since, p_full: full });
      if (this.closed) return;
      if (error) {
        const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
        this.setStatus('error', missing
          ? 'Máy chủ chưa cập nhật cho màn hình lớp. Quản trị trường chạy SQL 21 (21_man-hinh-lop-tv.sql) rồi thử lại.'
          : `Chưa tải được lớp học (${error.message}). Đang thử lại…`);
        this.flushReady();
        return;
      }
      const d = (data ?? null) as Row | null;
      if (!d) {
        this.setStatus('error', 'Không tìm thấy lớp học trực tiếp này — lớp đã kết thúc hoặc mã lớp không đúng.');
        this.flushReady();
        return;
      }
      this.absorb(d);
      this.setStatus('open');
    } catch (e) {
      if (!this.closed) this.setStatus('error', `Mất kết nối máy chủ (${(e as Error)?.message ?? e}). Đang thử lại…`);
    } finally {
      this.polling = false;
      if (this.again) {
        this.again = false;
        void this.poll();
      } else this.schedule();
    }
  }

  private absorb(d: Row): void {
    let changed = false;
    if (d.lesson && typeof d.lesson === 'object') {
      this.lesson = fromLesson(d.lesson as Row);
      changed = true;
    }
    if (Array.isArray(d.items)) {
      for (const r of d.items as Row[]) {
        const it = fromItem(r);
        this.items[it.id] = it;
      }
      this.merged = null;
      changed = true;
    }
    const keys = (d.keys && typeof d.keys === 'object' ? d.keys : {}) as Record<string, unknown>;
    for (const [id, k] of Object.entries(keys)) {
      if (JSON.stringify(this.keys[id]) !== JSON.stringify(k)) {
        this.keys[id] = k;
        this.merged = null;
        changed = true;
      }
    }
    const fresh = Array.isArray(d.responses) ? (d.responses as Row[]).map(fromLiveResponse) : [];
    if (fresh.length) {
      const map = new Map(this.list.map((r) => [respKey(r), r]));
      for (const r of fresh) map.set(respKey(r), { ...map.get(respKey(r)), ...r });
      this.list = [...map.values()];
    }
    // Lùi mốc 5 giây: câu trả lời ghi gần lúc hỏi vẫn được lấy lại (trùng thì gộp theo khoá).
    if (typeof d.now === 'string') this.since = new Date(Date.parse(d.now) - 5000).toISOString();
    const s = fromLiveStateColumn(d.state);
    if (s && newer(s, this.base) && (changed || JSON.stringify(s) !== JSON.stringify(this.base))) this.adopt(s);
    else if (changed && this.base) this.adopt(this.base);
    for (const r of fresh) this.emit({ kind: 'response', response: r });
  }

  private adopt(s: LiveState): void {
    this.base = s;
    this.emit({ kind: 'state', state: this.getState()! });
    this.flushReady();
  }

  private allItems(): Record<string, Item> {
    if (this.merged) return this.merged;
    const out: Record<string, Item> = {};
    for (const [id, it] of Object.entries(this.items)) out[id] = id in this.keys ? ({ ...it, key: this.keys[id] } as Item) : it;
    // Câu nhúng trong slide: ghép đáp án vào bản trong bài giảng khi bảng items không có.
    for (const sl of this.lesson?.slides ?? []) {
      const it = sl.item;
      if (it && !out[it.id]) out[it.id] = it.id in this.keys ? ({ ...it, key: this.keys[it.id] } as Item) : it;
    }
    this.merged = out;
    return out;
  }

  /* ---------- LiveChannel ---------- */
  getState(): LiveState | null {
    if (!this.base) return null;
    return { ...this.base, ...(this.lesson ? { lesson: this.lesson } : {}), items: this.allItems() };
  }
  subscribe(handler: (msg: LiveMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  async send(_cmd: LiveCommand): Promise<void> {
    throw new Error('Màn hình lớp chỉ để xem — thầy/cô điều khiển trên máy giáo viên.');
  }
  async join(_p: LiveParticipant): Promise<void> {
    /* TV không tham gia */
  }
  async respond(): Promise<{ correct?: boolean; score?: number }> {
    throw new Error('Màn hình lớp chỉ để xem — muốn cả lớp làm trên bảng, thầy/cô đăng nhập ở máy này.');
  }
  responses(slideIndex: number): LiveResponse[] {
    return this.list.filter((r) => r.slideIndex === slideIndex).sort((a, b) => a.at.localeCompare(b.at));
  }
  online(): LiveParticipant[] {
    return this.base?.participants ?? [];
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ch) void this.sb.removeChannel(this.ch);
    this.setStatus('closed');
    this.flushReady();
    this.handlers.clear();
  }
}
