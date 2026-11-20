/**
 * Hàng đợi ghi offline: giữ đúng thứ tự, khóa idempotency, gộp tiến độ, lùi dần khi lỗi.
 * Không phụ thuộc DataSource — `exec` do OfflineAwareDataSource cung cấp, nên kiểm thử được với kho bộ nhớ.
 */
import type { LessonProgress } from '@openedu/contracts';
import { mergeProgress } from '../progress';
import { backoffMs, classifyError, MAX_ATTEMPTS, newClientId } from './policy';
import type { AnyOutboxOp, OfflineStore, OutboxKind, OutboxOp, PayloadByKind } from './types';

/** Kết quả một lần gửi thành công (để cộng dồn báo cáo). */
export interface ExecResult { stars?: number; graded?: boolean; correct?: boolean; newlyUnlocked?: string[] }

export interface FlushResult {
  sent: AnyOutboxOp[];
  results: ExecResult[];
  failed: AnyOutboxOp[];
  stoppedOffline: boolean;
  remaining: number;
}

export interface OutboxOptions {
  now?: () => number;
  rand?: () => number;
  /** Giới hạn số thao tác chờ; vượt thì bỏ sự kiện 'event' cũ nhất trước. */
  maxOps?: number;
}

const MAX_OPS = 500;

export class Outbox {
  private seq = 0;
  private loaded: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private flushing: Promise<FlushResult> | null = null;
  private now: () => number;
  private rand: () => number;
  private maxOps: number;

  constructor(private store: OfflineStore, opts: OutboxOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.rand = opts.rand ?? Math.random;
    this.maxOps = opts.maxOps ?? MAX_OPS;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((f) => { try { f(); } catch { /* bỏ qua */ } });
  }

  private load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.store.getAll<AnyOutboxOp>('outbox').then((all) => {
        this.seq = all.reduce((m, o) => Math.max(m, o.seq), 0);
      });
    }
    return this.loaded;
  }

  /** Mọi thao tác, theo thứ tự ghi. */
  async list(): Promise<AnyOutboxOp[]> {
    await this.load();
    return (await this.store.getAll<AnyOutboxOp>('outbox')).sort((a, b) => a.seq - b.seq);
  }
  async pending(): Promise<AnyOutboxOp[]> {
    return (await this.list()).filter((o) => o.status === 'pending');
  }

  /**
   * Thêm thao tác. Trùng id → bỏ qua (idempotent). 'progress' chưa gửi lần nào của cùng bài → gộp bằng mergeProgress.
   * 'event' started/viewed trùng đối tượng đang chờ → bỏ qua.
   */
  async enqueue<K extends OutboxKind>(kind: K, userId: string, payload: PayloadByKind[K], id: string = newClientId()): Promise<OutboxOp<K>> {
    await this.load();
    const existing = await this.store.get<OutboxOp<K>>('outbox', id);
    if (existing) return existing;
    const all = await this.pending();
    if (kind === 'progress') {
      const p = payload as LessonProgress;
      const same = all.find((o): o is OutboxOp<'progress'> => o.kind === 'progress' && o.attempts === 0 && o.payload.lessonId === p.lessonId && o.userId === userId);
      if (same) {
        same.payload = mergeProgress(same.payload, p, p.updatedAt ?? new Date(this.now()).toISOString());
        await this.store.put('outbox', same.id, same);
        this.emit();
        return same as unknown as OutboxOp<K>;
      }
    }
    if (kind === 'event') {
      const e = (payload as PayloadByKind['event']).event;
      if (e.verb === 'started' || e.verb === 'viewed') {
        const dup = all.find((o) => o.kind === 'event' && o.payload.event.verb === e.verb && o.payload.event.objectId === e.objectId && o.payload.event.objectType === e.objectType && o.userId === userId);
        if (dup) return dup as unknown as OutboxOp<K>;
      }
    }
    const op: OutboxOp<K> = { id, seq: ++this.seq, kind, userId, payload, createdAt: new Date(this.now()).toISOString(), attempts: 0, nextAt: 0, status: 'pending' };
    await this.store.put('outbox', id, op);
    await this.trim();
    this.emit();
    return op;
  }

  private async trim(): Promise<void> {
    const all = await this.list();
    let extra = all.length - this.maxOps;
    for (const o of all) {
      if (extra <= 0) break;
      if (o.kind === 'event' || o.status === 'failed') { await this.store.delete('outbox', o.id); extra--; }
    }
  }

  async remove(id: string): Promise<void> {
    await this.store.delete('outbox', id);
    this.emit();
  }

  /** Đưa thao tác 'failed' về hàng chờ (nút "Thử lại"). */
  async retryFailed(): Promise<void> {
    for (const o of await this.list()) if (o.status === 'failed') await this.store.put('outbox', o.id, { ...o, status: 'pending', attempts: 0, nextAt: 0 });
    this.emit();
  }

  /**
   * Gửi lần lượt theo seq. Mất mạng → dừng (giữ thứ tự). Lỗi tạm → lùi dần và dừng (thao tác sau không vượt lên).
   * Lỗi vĩnh viễn → đánh dấu 'failed', đi tiếp. `force` bỏ qua thời gian chờ lùi dần (nút "Đồng bộ ngay").
   * Chỉ một lần flush chạy cùng lúc; gọi chồng trả về cùng promise.
   */
  flush(exec: (op: AnyOutboxOp) => Promise<ExecResult | void>, opts: { force?: boolean } = {}): Promise<FlushResult> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush(exec, !!opts.force).finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async doFlush(exec: (op: AnyOutboxOp) => Promise<ExecResult | void>, force: boolean): Promise<FlushResult> {
    const out: FlushResult = { sent: [], results: [], failed: [], stoppedOffline: false, remaining: 0 };
    const queue = await this.pending();
    for (const op of queue) {
      if (!force && op.nextAt > this.now()) break;
      try {
        const r = await exec(op);
        await this.store.delete('outbox', op.id);
        out.sent.push(op);
        out.results.push(r ?? {});
      } catch (e) {
        const cls = classifyError(e);
        const attempts = op.attempts + 1;
        const lastError = String((e as Error)?.message ?? e).slice(0, 300);
        if (cls === 'permanent' || (cls === 'transient' && attempts >= MAX_ATTEMPTS)) {
          const f = { ...op, attempts, lastError, status: 'failed' as const };
          await this.store.put('outbox', op.id, f);
          out.failed.push(f as AnyOutboxOp);
          continue;
        }
        await this.store.put('outbox', op.id, { ...op, attempts: cls === 'network' ? op.attempts : attempts, lastError, nextAt: this.now() + backoffMs(attempts, this.rand) });
        out.stoppedOffline = cls === 'network';
        break;
      }
    }
    out.remaining = (await this.pending()).length;
    this.emit();
    return out;
  }
}
