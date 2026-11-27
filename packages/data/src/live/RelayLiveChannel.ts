/**
 * Kênh trực tiếp qua tools/live-relay (WebSocket). Relay chỉ chuyển tin — mọi logic nằm ở máy GV
 * (applyLiveCommand) và máy HS (tự chấm bằng key có trong state.items ở chế độ demo).
 *
 * Giao thức (JSON, trường `t`):
 *   khách → relay: create{state} · join-room{sessionId, role, participant?} · state{state} · respond{response}
 *   relay → khách: state{state} · response{response} · presence{participants} · responses{list} · error{message, code?}
 * Tin `state` có thể bỏ `lesson`/`items` = không đổi (giảm tải Wi-Fi lớp học); bên nhận tự ghép.
 */
import type { Item, LiveCommand, LiveMessage, LiveParticipant, LiveResponse, LiveRole, LiveState } from '@openedu/contracts';
import { relayWsUrl } from '../env';
import { applyLiveCommand, mergeIncomingState } from './reducer';
import { loadScorer, type ChannelStatus, type ScoreFn, type StatusfulLiveChannel } from './types';

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
};
type WsCtor = new (url: string) => WsLike;

type ServerMsg =
  | { t: 'state'; state: LiveState }
  | { t: 'response'; response: LiveResponse }
  | { t: 'presence'; participants: LiveParticipant[] }
  | { t: 'responses'; list: LiveResponse[] }
  | { t: 'error'; message: string; code?: string };

export interface RelayChannelOptions {
  url?: string;
  /** GV: trạng thái đã lưu trên máy, dùng để tạo lại phòng khi relay khởi động lại. */
  initialState?: LiveState | null;
  /** HS: tự vào lại phòng sau khi rớt mạng. */
  participant?: LiveParticipant;
  /** Bổ sung thông tin cho HS trước khi gửi (vd teamId theo tổ của lớp). */
  prepareParticipant?: (p: LiveParticipant, state: LiveState | null) => LiveParticipant;
  /** GV: lưu trạng thái mỗi lần đổi. */
  onStateChange?: (s: LiveState) => void;
  /** HS: sau khi tự chấm một câu (để cộng sao vào ví trên máy). */
  onGraded?: (r: LiveResponse, item: Item) => void;
  /** Ghi đè khi kiểm thử. */
  WebSocketImpl?: WsCtor;
  score?: ScoreFn;
}

const OPEN = 1;
const MAX_BACKOFF = 10_000;

function slim(s: LiveState): LiveState {
  const { lesson: _l, items: _i, ...rest } = s;
  return rest as LiveState;
}

function respKey(r: LiveResponse): string {
  return `${r.userId}|${r.itemId}|${r.slideIndex}`;
}

export class RelayLiveChannel implements StatusfulLiveChannel {
  readonly sessionId: string;
  readonly role: LiveRole;
  private url: string;
  private opts: RelayChannelOptions;
  private ws: WsLike | null = null;
  private state: LiveState | null;
  private handlers = new Set<(m: LiveMessage) => void>();
  private statusHandlers = new Set<(s: ChannelStatus, e: string | null) => void>();
  private readyWaiters: ((ok: boolean) => void)[] = [];
  private _status: ChannelStatus = 'connecting';
  private _error: string | null = null;
  private list: LiveResponse[] = [];
  private presence: LiveParticipant[] = [];
  private outbox: string[] = [];
  private participant: LiveParticipant | undefined;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private awaitingSync = true;

  constructor(sessionId: string, role: LiveRole, opts: RelayChannelOptions = {}) {
    this.sessionId = sessionId;
    this.role = role;
    this.opts = opts;
    this.url = opts.url ?? relayWsUrl();
    this.state = opts.initialState ?? null;
    this.participant = opts.participant;
    this.connect();
  }

  /* ---------- trạng thái kết nối ---------- */
  get status(): ChannelStatus {
    return this._status;
  }
  get error(): string | null {
    return this._error;
  }
  onStatus(handler: (s: ChannelStatus, e: string | null) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }
  whenReady(timeoutMs = 3000): Promise<boolean> {
    if (this._status === 'open') return Promise.resolve(true);
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
  private setStatus(s: ChannelStatus, error: string | null = null): void {
    if (this._status === 'closed' && s !== 'closed') return;
    this._status = s;
    this._error = error;
    for (const h of [...this.statusHandlers]) {
      try {
        h(s, error);
      } catch {
        /* lỗi ở handler không làm hỏng kênh */
      }
    }
    if (s === 'open' || s === 'closed') {
      const ws = this.readyWaiters;
      this.readyWaiters = [];
      for (const w of ws) w(s === 'open');
    }
  }

  /* ---------- kết nối & tự nối lại ---------- */
  private connect(): void {
    if (this.closedByUser) return;
    const Ctor: WsCtor | undefined = this.opts.WebSocketImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (!Ctor) {
      this.setStatus('error', 'Trình duyệt này không hỗ trợ kết nối lớp học trực tiếp (WebSocket).');
      return;
    }
    this.setStatus('connecting', this._error);
    let ws: WsLike;
    try {
      ws = new Ctor(this.url);
    } catch {
      this.setStatus('error', `Địa chỉ máy chủ lớp học không hợp lệ: ${this.url}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.awaitingSync = true;
    ws.onopen = () => {
      this.attempts = 0;
      this.sendJoin();
      const queued = this.outbox;
      this.outbox = [];
      for (const m of queued) this.rawSend(m);
    };
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data);
      let msg: ServerMsg;
      try {
        msg = JSON.parse(text) as ServerMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onerror = () => {
      /* onclose sẽ được gọi ngay sau đó */
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.closedByUser) return;
      this.setStatus('connecting', 'Mất kết nối, đang nối lại…');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.reconnectTimer) return;
    const base = Math.min(MAX_BACKOFF, 500 * 2 ** this.attempts);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private rawSend(data: string): boolean {
    const ws = this.ws;
    if (ws && ws.readyState === OPEN) {
      try {
        ws.send(data);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private sendJoin(): void {
    const msg: Record<string, unknown> = { t: 'join-room', sessionId: this.sessionId, role: this.role };
    if (this.role === 'student' && this.participant) msg.participant = this.participant;
    this.rawSend(JSON.stringify(msg));
  }

  /* ---------- xử lý tin ---------- */
  private emit(m: LiveMessage): void {
    for (const h of [...this.handlers]) {
      try {
        h(m);
      } catch {
        /* bỏ qua */
      }
    }
  }

  private adoptState(next: LiveState): void {
    this.state = next;
    if (this.role === 'teacher') this.opts.onStateChange?.(next);
    this.emit({ kind: 'state', state: next });
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'state': {
        if (!msg.state || msg.state.sessionId !== this.sessionId) return;
        const incoming = mergeIncomingState(this.state, msg.state);
        if (this.role === 'teacher' && this.awaitingSync) {
          this.awaitingSync = false;
          const local = this.state;
          if (local && Date.parse(local.updatedAt) > Date.parse(incoming.updatedAt)) {
            // Máy GV có thay đổi lúc mất mạng: đẩy bản của mình, giữ HS đã vào trong lúc đó.
            const known = new Set(local.participants.map((p) => p.userId));
            const merged: LiveState = {
              ...local,
              participants: [...local.participants, ...incoming.participants.filter((p) => !known.has(p.userId))],
            };
            this.adoptState(merged);
            this.rawSend(JSON.stringify({ t: 'state', state: merged }));
            this.setStatus('open');
            return;
          }
        }
        if (this.role === 'teacher' && this.state && Date.parse(incoming.updatedAt) < Date.parse(this.state.updatedAt)) {
          // Tin cũ đến muộn (có máy GV thứ hai): chỉ nhận danh sách HS mới.
          const known = new Set(this.state.participants.map((p) => p.userId));
          const extra = incoming.participants.filter((p) => !known.has(p.userId));
          if (extra.length) this.adoptState({ ...this.state, participants: [...this.state.participants, ...extra] });
        } else {
          this.adoptState(incoming);
        }
        this.awaitingSync = false;
        if (this._status !== 'open') this.setStatus('open');
        return;
      }
      case 'responses': {
        const map = new Map<string, LiveResponse>();
        for (const r of [...this.list, ...(msg.list ?? [])]) map.set(respKey(r), r);
        this.list = [...map.values()];
        return;
      }
      case 'response': {
        if (!msg.response || msg.response.sessionId !== this.sessionId) return;
        this.list = this.list.filter((r) => respKey(r) !== respKey(msg.response));
        this.list.push(msg.response);
        this.emit({ kind: 'response', response: msg.response });
        return;
      }
      case 'presence': {
        this.presence = msg.participants ?? [];
        this.emit({ kind: 'presence', participants: this.presence });
        return;
      }
      case 'error': {
        if (msg.code === 'no-room') {
          if (this.role === 'teacher' && this.state) {
            // Relay vừa khởi động lại: tạo lại phòng từ trạng thái trên máy GV.
            this.awaitingSync = true;
            this.rawSend(JSON.stringify({ t: 'create', state: this.state }));
            return;
          }
          this.setStatus('error', 'Chưa tìm thấy lớp học trực tiếp này. Em chờ thầy/cô mở lớp hoặc kiểm tra lại mã nhé!');
          // Thử vào lại: GV có thể đang tạo lại phòng.
          if (!this.rejoinTimer && !this.closedByUser) {
            this.rejoinTimer = setTimeout(() => {
              this.rejoinTimer = null;
              this.sendJoin();
            }, 3000);
          }
          return;
        }
        this.setStatus(this._status === 'open' ? 'open' : 'error', msg.message || 'Có lỗi ở máy chủ lớp học.');
        return;
      }
    }
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
    if (!this.state) throw new Error('Lớp học chưa sẵn sàng, thầy/cô chờ một chút nhé.');
    const next = applyLiveCommand(this.state, cmd);
    if (next === this.state) return;
    this.adoptState(next);
    // Gửi bản rút gọn (không kèm bài giảng). Nếu đang mất mạng, lúc nối lại sẽ đồng bộ theo updatedAt.
    this.rawSend(JSON.stringify({ t: 'state', state: slim(next) }));
  }

  async join(p: LiveParticipant): Promise<void> {
    this.participant = this.opts.prepareParticipant ? this.opts.prepareParticipant(p, this.state) : p;
    if (this.role !== 'student') return;
    this.sendJoin();
  }

  async respond(r: Omit<LiveResponse, 'at' | 'correct' | 'score'>): Promise<{ correct?: boolean; score?: number }> {
    const item = this.state?.items?.[r.itemId];
    let correct: boolean | undefined;
    let score: number | undefined;
    if (item) {
      try {
        const fn = this.opts.score ?? (await loadScorer());
        const res = fn(item, r.response);
        if (res.graded) {
          correct = res.correct;
          score = res.score;
        }
      } catch {
        /* chấm lỗi: vẫn gửi câu trả lời để GV xem */
      }
    }
    const response: LiveResponse = { ...r, sessionId: this.sessionId, at: new Date().toISOString() };
    if (correct !== undefined) response.correct = correct;
    if (score !== undefined) response.score = score;
    this.list = this.list.filter((x) => respKey(x) !== respKey(response));
    this.list.push(response);
    const data = JSON.stringify({ t: 'respond', response });
    if (!this.rawSend(data)) this.outbox.push(data);
    if (item) {
      try {
        this.opts.onGraded?.(response, item);
      } catch {
        /* bỏ qua */
      }
    }
    return { correct, score };
  }

  responses(slideIndex: number): LiveResponse[] {
    return this.list.filter((r) => r.slideIndex === slideIndex).sort((a, b) => a.at.localeCompare(b.at));
  }

  online(): LiveParticipant[] {
    return this.presence;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.reconnectTimer = null;
    this.rejoinTimer = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, 'bye');
    } catch {
      /* bỏ qua */
    }
    this.setStatus('closed');
    this.handlers.clear();
  }
}

/* ---------- tiện ích cho DemoDataSource ---------- */

/** Mở WebSocket tạm, gửi `create`, chờ relay trả `state` rồi đóng. */
export function registerRoomOnRelay(state: LiveState, url = relayWsUrl(), timeoutMs = 4000, WebSocketImpl?: WsCtor): Promise<void> {
  const Ctor: WsCtor | undefined = WebSocketImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
  const fail = () =>
    new Error(
      `Chưa kết nối được máy chủ lớp học trực tiếp (${url}). Trên máy giáo viên, mở cửa sổ lệnh trong thư mục open-edu và chạy: pnpm relay — rồi thử lại.`,
    );
  if (!Ctor) return Promise.reject(fail());
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws: WsLike | null = null;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close(1000, 'registered');
      } catch {
        /* bỏ qua */
      }
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(fail()), timeoutMs);
    let sock: WsLike;
    try {
      sock = new Ctor(url);
      ws = sock;
    } catch {
      finish(fail());
      return;
    }
    sock.onopen = () => sock.send(JSON.stringify({ t: 'create', state }));
    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMsg;
        if (msg.t === 'state' && msg.state?.sessionId === state.sessionId) finish();
        else if (msg.t === 'error') finish(new Error(msg.message));
      } catch {
        /* bỏ qua */
      }
    };
    sock.onerror = () => finish(fail());
    sock.onclose = () => finish(fail());
  });
}
