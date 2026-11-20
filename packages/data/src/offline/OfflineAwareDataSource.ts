/**
 * OfflineAwareDataSource — lớp bọc (decorator) quanh DataSource thật (docs/PHASE6_OFFLINE.md).
 *  - Đọc: mạng trước; lỗi mạng / mất mạng / quá chậm → bản lưu trong IndexedDB. Item lưu KHÔNG có đáp án.
 *  - Ghi (submitAnswer, saveProgress, completeLesson, recordEvent, submitWork, submitRemediationResult): mất mạng hoặc hàng đợi còn việc →
 *    vào outbox với khóa idempotency (clientEventId), gửi lại đúng thứ tự khi có mạng.
 *  - Các hàm khác đi thẳng xuống nguồn thật.
 */
import type {
  AnyResponse, AwardResult, CompleteLessonOptions, DataSource, Item, ItemType, LearningEvent, LessonProgress, RemediationAnswer, RemediationOutcome,
  RemediationSet, ScoreResult, SkillMastery,
  SubmissionDetail, SubmitAnswerInput, SubmitAnswerResult, SubmitWorkInput, Task, Wallet,
} from '@openedu/contracts';
import { mergeProgress } from '../progress';
import type { HintInput, HintResult } from '@openedu/contracts';
import { ck, getCache, itemIdsOfLesson, putCache, stripKey, stripLessonKeys } from './cacheKeys';
import { Outbox, type ExecResult } from './outbox';
import { checkAnsweredAt, classifyError, newClientId, OfflineError } from './policy';
import { setOfflineController, type OfflineController } from './registry';
import type { AnyOutboxOp, OfflineStore, SyncReport } from './types';

const UNGRADED: ItemType[] = ['DRAW', 'RECORD_READ', 'POLL'];
const DEGRADED_MS = 30_000;

export interface OfflineAwareOptions {
  store: OfflineStore;
  /** Mặc định navigator.onLine. */
  isOnline?: () => boolean;
  now?: () => number;
  rand?: () => number;
  /** Đọc mạng quá lâu mà đã có bản lưu → dùng bản lưu (ms). */
  readTimeoutMs?: number;
  /** Chấm tại máy (chỉ khi item có key — demo/GV). Mặc định nạp động activity-engine. */
  score?: (item: Item, r: AnyResponse) => ScoreResult | Promise<ScoreResult>;
  /** Nén ảnh bài làm trước khi cất (mặc định compressWorkImage). */
  compress?: (img: Blob | string) => Promise<Blob>;
  /** Cửa sổ để nghe online/visibility (mặc định globalThis.window nếu có). */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'> & { document?: Document };
  syncIntervalMs?: number;
}

/** Phương thức đọc có bản lưu: khóa theo tên + tham số. */
const CACHED_READS = [
  'listLessons', 'listCourses', 'listPackages', 'getPackage', 'getTodayTasks', 'getWallet', 'getPassport', 'listAssignments',
  'getClass', 'listWorkTasks', 'getWorkTask', 'getRemediationSets', 'getStudentWork', 'listSubmissions', 'getSkillMastery', 'listRewards',
] as const;
type CachedRead = (typeof CACHED_READS)[number];

type AnyFn = (...a: unknown[]) => Promise<unknown>;

export interface OfflineAware {
  ds: DataSource;
  controller: OfflineController;
  outbox: Outbox;
}

export function createOfflineAware(inner: DataSource, o: OfflineAwareOptions): OfflineAware {
  const store = o.store;
  const now = o.now ?? Date.now;
  const outbox = new Outbox(store, { now, rand: o.rand });
  const navOnline = o.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const readTimeout = o.readTimeoutMs ?? 8_000;
  let degradedUntil = 0;
  let pending = 0;
  let failed = 0;
  let isSyncing = false;
  const listeners = new Set<() => void>();
  const syncedListeners = new Set<(r: SyncReport) => void>();
  const emit = () => listeners.forEach((f) => { try { f(); } catch { /* */ } });

  const online = () => navOnline() && now() >= degradedUntil;
  const markNetFail = () => { const was = online(); degradedUntil = now() + DEGRADED_MS; if (was) emit(); };
  const markNetOk = () => { if (degradedUntil) { degradedUntil = 0; emit(); } };

  const recount = async () => {
    const all = await outbox.list();
    const p = all.filter((x) => x.status === 'pending').length;
    const f = all.length - p;
    if (p !== pending || f !== failed) { pending = p; failed = f; emit(); }
  };
  outbox.subscribe(() => void recount());
  const ready = recount().catch(() => undefined);

  const isNet = (e: unknown) => classifyError(e) === 'network';
  const put = <T,>(k: string, v: T) => putCache(store, k, v, now()).catch(() => undefined);

  /** Gọi nguồn thật; lỗi mạng → đánh dấu "mạng yếu". */
  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      markNetOk();
      return r;
    } catch (e) {
      if (isNet(e)) markNetFail();
      throw e;
    }
  }

  /** Mạng trước, bản lưu sau. Có bản lưu + mạng chậm quá readTimeout → trả bản lưu (mạng vẫn chạy để làm mới). */
  async function cachedRead<T>(key: string, fn: () => Promise<T>, save: (v: T) => Promise<unknown> | void = (v) => put(key, v)): Promise<T> {
    const cached = await getCache<T>(store, key).catch(() => undefined);
    if (!online() && cached !== undefined) return cached;
    const net = call(fn).then(async (v) => { await save(v); return v; });
    try {
      if (cached === undefined) return await net;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<T>((res) => { timer = setTimeout(() => res(cached), readTimeout); });
      net.catch(() => undefined);
      const r = await Promise.race([net, slow]);
      if (timer) clearTimeout(timer);
      return r;
    } catch (e) {
      if (cached !== undefined && isNet(e)) return cached;
      if (isNet(e)) throw new OfflineError();
      throw e;
    }
  }

  async function localProgress(userId: string, lessonId: string): Promise<LessonProgress | undefined> {
    return getCache<LessonProgress>(store, ck.progress(userId, lessonId));
  }
  async function pendingProgressFor(userId: string, lessonId: string): Promise<LessonProgress | undefined> {
    let acc: LessonProgress | undefined;
    for (const op of await outbox.pending()) {
      if (op.kind === 'progress' && op.userId === userId && op.payload.lessonId === lessonId) acc = mergeProgress(acc, op.payload, op.payload.updatedAt);
      if (op.kind === 'complete' && op.userId === userId && op.payload.lessonId === lessonId && acc) acc = { ...acc, completedAt: acc.completedAt ?? op.payload.completedAt };
    }
    return acc;
  }

  /** Ghi: thử mạng nếu có mạng và hàng đợi trống, ngược lại xếp hàng. */
  async function writeOrQueue<T>(direct: () => Promise<T>, queue: () => Promise<T>): Promise<T> {
    await ready;
    if (online() && pending === 0) {
      try {
        return await call(direct);
      } catch (e) {
        if (!isNet(e)) throw e;
      }
    }
    const r = await queue();
    await recount();
    if (online()) void syncNow();
    return r;
  }

  async function offlineScore(item: Item, response: AnyResponse): Promise<ScoreResult> {
    if (UNGRADED.includes(item.type) || item.key == null) return { graded: false, correct: false, score: 0 };
    try {
      if (o.score) return await o.score(item, response);
      const { scoreItem } = await import('@openedu/activity-engine');
      return scoreItem(item, response);
    } catch {
      return { graded: false, correct: false, score: 0 };
    }
  }

  const ANS_KEY = (userId: string, itemId: string) => `anssync:${userId}:${itemId}`;

  async function cachedWallet(userId: string): Promise<Wallet> {
    return (await getCache<Wallet>(store, ck.q('getWallet', [userId]))) ?? { userId, stars: 0, coins: 0, xp: 0, level: 1, streakDays: 0 };
  }

  /* ---------------- thực thi một thao tác trong hàng đợi ---------------- */
  async function exec(op: AnyOutboxOp): Promise<ExecResult | void> {
    switch (op.kind) {
      case 'answer': {
        const p = op.payload;
        if (checkAnsweredAt(p.answeredAt, now()) === 'stale') throw Object.assign(new Error('stale_answer: câu trả lời quá 14 ngày'), { status: 422 });
        const r = await call(() => inner.submitAnswer({ userId: op.userId, item: p.item, response: p.response, context: p.context, attempt: p.attempt, clientEventId: op.id, answeredAt: p.answeredAt }));
        // Bộ ôn tập làm lúc mất mạng cần kết quả thật của câu này (xem case 'remediation').
        await put(ANS_KEY(op.userId, p.item.id), { correct: r.result.correct || !r.result.graded });
        return { stars: r.starsAwarded, graded: r.result.graded, correct: r.result.correct, newlyUnlocked: r.award?.newlyUnlocked };
      }
      case 'remediation': {
        const p = op.payload;
        const results: RemediationAnswer[] = [];
        for (const a of p.results) {
          if (p.pendingItemIds.indexOf(a.itemId) < 0) { results.push(a); continue; }
          const synced = await getCache<{ correct: boolean }>(store, ANS_KEY(op.userId, a.itemId)).catch(() => undefined);
          // Câu chưa có kết quả thật (bị từ chối khi đồng bộ) tính là chưa đúng — không cho qua nhờ đoán.
          results.push({ itemId: a.itemId, correct: synced?.correct ?? false });
        }
        await call(() => inner.submitRemediationResult(op.userId, p.setId, results));
        return;
      }
      case 'progress':
        await call(() => inner.saveProgress(op.payload));
        return;
      case 'complete': {
        const r = await call(() => inner.completeLesson(op.userId, op.payload.lessonId, { clientEventId: op.id, completedAt: op.payload.completedAt }));
        return { stars: r.starsAwarded, newlyUnlocked: r.newlyUnlocked };
      }
      case 'event':
        await call(() => inner.recordEvent({ ...op.payload.event, clientEventId: op.id, offline: true, clientAt: op.payload.at } as Omit<LearningEvent, 'id' | 'at'>));
        return;
      case 'work': {
        const blobs: Blob[] = [];
        for (const id of op.payload.blobIds) {
          const b = await store.get<Blob>('blobs', id);
          if (b) blobs.push(b);
        }
        await call(() => inner.submitWork({ ...op.payload.input, images: blobs, clientEventId: op.id }));
        for (const id of op.payload.blobIds) await store.delete('blobs', id).catch(() => undefined);
        return;
      }
    }
  }

  async function syncNow(opts: { force?: boolean } = {}): Promise<SyncReport> {
    const empty: SyncReport = { sent: 0, failed: 0, remaining: pending, stars: 0, correct: 0, graded: 0, newlyUnlocked: [], stoppedOffline: false };
    if (!navOnline()) return { ...empty, stoppedOffline: true };
    if (opts.force) degradedUntil = 0;
    isSyncing = true;
    emit();
    try {
      const f = await outbox.flush(exec, opts);
      const rep: SyncReport = { ...empty, sent: f.sent.length, failed: f.failed.length, remaining: f.remaining, stoppedOffline: f.stoppedOffline };
      for (const r of f.results) {
        rep.stars += r.stars ?? 0;
        if (r.graded) { rep.graded++; if (r.correct) rep.correct++; }
        for (const m of r.newlyUnlocked ?? []) if (rep.newlyUnlocked.indexOf(m) < 0) rep.newlyUnlocked.push(m);
      }
      if (rep.sent > 0) {
        const users = new Set(f.sent.map((x) => x.userId));
        for (const u of users) await call(() => inner.getWallet(u)).then((w) => put(ck.q('getWallet', [u]), w)).catch(() => undefined);
        syncedListeners.forEach((fn) => { try { fn(rep); } catch { /* */ } });
      }
      return rep;
    } finally {
      isSyncing = false;
      await recount();
      emit();
    }
  }

  /* ---------------- các phương thức được bọc ---------------- */
  const wrapped: Partial<Record<keyof DataSource, AnyFn>> = {};
  const innerAny = inner as unknown as Record<string, AnyFn>;
  for (const m of CACHED_READS) {
    if (typeof innerAny[m] !== 'function') continue;
    wrapped[m as CachedRead] = (...args: unknown[]) => cachedRead(ck.q(m, args), () => innerAny[m].apply(inner, args));
  }

  wrapped.getCurrentUser = () =>
    cachedRead(ck.me, () => inner.getCurrentUser(), (v) => (v ? put(ck.me, v) : store.delete('cache', ck.me).catch(() => undefined)));
  wrapped.signOut = async () => {
    await inner.signOut();
    await store.delete('cache', ck.me).catch(() => undefined);
  };
  wrapped.getLesson = ((id: string) => cachedRead(ck.lesson(id), () => inner.getLesson(id), (v) => (v ? put(ck.lesson(id), stripLessonKeys(v)) : undefined))) as AnyFn;

  const getItemsCached = async (ids: string[]): Promise<Item[]> => {
    const uniq = [...new Set(ids)];
    const fromCache = async () => {
      const out: Item[] = [];
      for (const id of uniq) { const it = await getCache<Item>(store, ck.item(id)); if (it) out.push(it); }
      return out;
    };
    if (!online()) {
      const c = await fromCache();
      if (c.length || !uniq.length) return c;
    }
    try {
      const list = await call(() => inner.getItems(uniq));
      for (const it of list) await put(ck.item(it.id), stripKey(it));
      return list;
    } catch (e) {
      if (!isNet(e)) throw e;
      const c = await fromCache();
      if (c.length || !uniq.length) return c;
      throw new OfflineError();
    }
  };
  wrapped.getItems = getItemsCached as AnyFn;
  wrapped.getItem = (async (id: string) => (await getItemsCached([id]))[0] ?? null) as AnyFn;

  wrapped.getProgress = (async (userId: string, lessonId: string) => {
    const local = await localProgress(userId, lessonId);
    const mergeLocal = async (server: LessonProgress | null) => {
      const pend = await pendingProgressFor(userId, lessonId);
      let m: LessonProgress | undefined = server ?? undefined;
      if (pend) m = mergeProgress(m, pend, pend.updatedAt);
      if (m) await put(ck.progress(userId, lessonId), m);
      return m ?? null;
    };
    if (!online()) return local ?? null;
    try {
      return await mergeLocal(await call(() => inner.getProgress(userId, lessonId)));
    } catch (e) {
      if (isNet(e)) return local ?? null;
      throw e;
    }
  }) as AnyFn;

  wrapped.getTodayTasks = (async (userId: string) => {
    const tasks = await cachedRead<Task[]>(ck.q('getTodayTasks', [userId]), () => inner.getTodayTasks(userId));
    if (online()) return tasks;
    // Mất mạng: cập nhật thanh tiến độ bằng tiến độ học trên máy.
    const out: Task[] = [];
    for (const t of tasks) {
      if (t.kind !== 'lesson') { out.push(t); continue; }
      const p = await localProgress(userId, t.targetId);
      const l = await getCache<{ slides: unknown[] }>(store, ck.lesson(t.targetId));
      const ratio = p?.completedAt ? 1 : p && l?.slides.length ? Math.min(0.95, p.completedSlides.length / l.slides.length) : 0;
      out.push(ratio > t.progress ? { ...t, progress: ratio, isNew: false } : t);
    }
    return out;
  }) as AnyFn;

  wrapped.saveProgress = (async (p: LessonProgress) => {
    const prev = await localProgress(p.userId, p.lessonId);
    await put(ck.progress(p.userId, p.lessonId), mergeProgress(prev, p, p.updatedAt ?? new Date(now()).toISOString()));
    return writeOrQueue(() => inner.saveProgress(p), async () => { await outbox.enqueue('progress', p.userId, p); });
  }) as AnyFn;

  wrapped.submitAnswer = (async (input: SubmitAnswerInput): Promise<SubmitAnswerResult> => {
    const id = input.clientEventId ?? newClientId();
    const answeredAt = input.answeredAt ?? new Date(now()).toISOString();
    return writeOrQueue(
      () => inner.submitAnswer({ ...input, clientEventId: id, answeredAt }),
      async () => {
        await outbox.enqueue('answer', input.userId, { item: stripKey(input.item), response: input.response, context: input.context, attempt: input.attempt, answeredAt }, id);
        return { result: await offlineScore(input.item, input.response), starsAwarded: 0, pending: true };
      },
    );
  }) as AnyFn;

  // Gợi ý khi làm sai: mất mạng → gợi ý chung tại máy (item lưu offline không có đáp án).
  wrapped.getHint = (async (input: HintInput): Promise<HintResult> => {
    if (!online()) return (await import('../hint')).localHint(input.item, input.response, input.attempt);
    return inner.getHint(input);
  }) as AnyFn;

  wrapped.completeLesson = (async (userId: string, lessonId: string, opts?: CompleteLessonOptions) => {
    const id = opts?.clientEventId ?? newClientId();
    const completedAt = opts?.completedAt ?? new Date(now()).toISOString();
    const prev = await localProgress(userId, lessonId);
    if (prev) await put(ck.progress(userId, lessonId), { ...prev, completedAt: prev.completedAt ?? completedAt });
    return writeOrQueue<AwardResult & { starsAwarded: number; pending?: boolean }>(
      () => inner.completeLesson(userId, lessonId, { clientEventId: id, completedAt }),
      async () => {
        await outbox.enqueue('complete', userId, { lessonId, completedAt }, id);
        return { wallet: await cachedWallet(userId), newlyUnlocked: [], starsAwarded: 0, pending: true };
      },
    );
  }) as AnyFn;

  // Bộ ôn tập: khi có mạng, nạp sẵn câu hỏi của 3 bộ đầu (không kèm đáp án) để em ôn được cả lúc mất mạng.
  wrapped.getRemediationSets = (async (userId: string) => {
    const key = ck.q('getRemediationSets', [userId]);
    const sets = await cachedRead<RemediationSet[]>(key, () => inner.getRemediationSets(userId));
    if (online()) void getItemsCached(sets.slice(0, 3).flatMap((x) => x.itemIds)).catch(() => undefined);
    return sets;
  }) as AnyFn;

  wrapped.submitRemediationResult = (async (userId: string, setId: string, results: RemediationAnswer[]): Promise<RemediationOutcome> => {
    // Câu nào của bộ này còn nằm trong hàng đợi thì chưa có kết quả thật.
    const queued = (await outbox.list()).filter((x) => x.kind === 'answer' && x.userId === userId).map((x) => (x.payload as { item: Item }).item.id);
    const pendingItemIds = results.map((r) => r.itemId).filter((id) => queued.indexOf(id) >= 0);
    const queue = async (): Promise<RemediationOutcome> => {
      await outbox.enqueue('remediation', userId, { setId, results, pendingItemIds }, newClientId());
      const sets = (await getCache<RemediationSet[]>(store, ck.q('getRemediationSets', [userId])).catch(() => undefined)) ?? [];
      const set = sets.find((x) => x.id === setId);
      const skillCode = set?.skillCode ?? '';
      const all = (await getCache<SkillMastery[]>(store, ck.q('getSkillMastery', [userId])).catch(() => undefined)) ?? [];
      const mastery = all.find((m) => m.skillCode === skillCode) ?? ({ userId, skillCode, level: 'dang-hoc', p: 0, attempts: 0, correctStreak: 0, distinctDays: 0, misconceptions: {} } as SkillMastery);
      const known = results.filter((r) => pendingItemIds.indexOf(r.itemId) < 0);
      // Bộ đã làm xong: bỏ khỏi danh sách lưu để em không làm lại lúc chưa có mạng.
      if (set) await put(ck.q('getRemediationSets', [userId]), sets.filter((x) => x.id !== setId));
      return { setId, skillCode, passed: false, correct: known.filter((r) => r.correct).length, total: results.length, mastery, pending: true,
        message: 'Mình đã lưu bài ôn của em rồi. Khi có mạng, mình sẽ chấm và ghi vào hồ sơ nhé!' };
    };
    if (pendingItemIds.length) return queue();
    return writeOrQueue(() => inner.submitRemediationResult(userId, setId, results), queue);
  }) as AnyFn;

  wrapped.recordEvent = (async (e: Omit<LearningEvent, 'id' | 'at'>) => {
    const id = e.clientEventId ?? newClientId();
    const at = new Date(now()).toISOString();
    return writeOrQueue(() => inner.recordEvent({ ...e, clientEventId: id }), async () => { await outbox.enqueue('event', e.userId, { event: e, at }, id); });
  }) as AnyFn;

  wrapped.submitWork = (async (input: SubmitWorkInput): Promise<SubmissionDetail> => {
    const id = input.clientEventId ?? newClientId();
    return writeOrQueue(
      () => inner.submitWork({ ...input, clientEventId: id }),
      async () => {
        const compress = o.compress ?? (async (img: Blob | string) => {
          const { compressWorkImage } = await import('../workImage');
          const im = await compressWorkImage(img);
          return im.blob ?? (await (await fetch(im.url)).blob());
        });
        const blobIds: string[] = [];
        for (const [i, img] of (input.images ?? []).entries()) {
          const bid = `${id}:${i}`;
          await store.put('blobs', bid, await compress(img));
          blobIds.push(bid);
        }
        const { images: _images, ...rest } = input;
        await outbox.enqueue('work', input.studentId, { input: rest, blobIds }, id);
        const text = input.text?.trim();
        return {
          id: `offline:${id}`, taskId: input.taskId, studentId: input.studentId,
          kind: blobIds.length && text ? 'mixed' : blobIds.length ? 'photo' : 'text',
          ...(text ? { text } : {}), images: [], submittedBy: input.submittedBy ?? 'student', status: 'submitted',
          createdAt: new Date(now()).toISOString(),
        } as SubmissionDetail;
      },
    );
  }) as AnyFn;

  const ds = new Proxy(inner, {
    get(target, prop) {
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(wrapped, prop)) return wrapped[prop as keyof DataSource];
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? (v as AnyFn).bind(target) : v;
    },
  }) as DataSource;

  const controller: OfflineController = {
    store,
    ds,
    inner,
    isOnline: online,
    pendingCount: () => pending,
    failedCount: () => failed,
    syncing: () => isSyncing,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    onSynced: (fn) => { syncedListeners.add(fn); return () => { syncedListeners.delete(fn); }; },
    syncNow,
    listOps: () => outbox.list(),
    retryFailed: async () => { await outbox.retryFailed(); await recount(); },
    discardFailed: async () => { for (const op of await outbox.list()) if (op.status === 'failed') await outbox.remove(op.id); await recount(); },
    startAutoSync() {
      const w = o.win ?? (typeof window !== 'undefined' ? window : undefined);
      if (!w) return () => undefined;
      const kick = () => { if (pending > 0 && navOnline()) void syncNow(); };
      const onOnline = () => { degradedUntil = 0; emit(); kick(); };
      const onOffline = () => emit();
      const onVis = () => { if (w.document?.visibilityState !== 'hidden') kick(); };
      const onMsg = (ev: MessageEvent) => { if ((ev.data as { type?: string } | null)?.type === 'oe-sync') kick(); };
      w.addEventListener('online', onOnline);
      w.addEventListener('offline', onOffline);
      w.document?.addEventListener('visibilitychange', onVis);
      const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
      sw?.addEventListener('message', onMsg);
      const t = w.setInterval(() => {
        if (degradedUntil && now() >= degradedUntil) { degradedUntil = 0; emit(); }
        kick();
      }, o.syncIntervalMs ?? 30_000);
      kick();
      return () => {
        w.removeEventListener('online', onOnline);
        w.removeEventListener('offline', onOffline);
        w.document?.removeEventListener('visibilitychange', onVis);
        sw?.removeEventListener('message', onMsg);
        w.clearInterval(t);
      };
    },
  };
  return { ds, controller, outbox };
}

/** Cho initDataSource: tạo kho IndexedDB, bọc, đăng ký controller. */
export async function installOfflineAware(inner: DataSource): Promise<DataSource> {
  const { createOfflineStore } = await import('./idbStore');
  const { ds, controller } = createOfflineAware(inner, { store: await createOfflineStore() });
  setOfflineController(controller);
  return ds;
}

export { itemIdsOfLesson };
