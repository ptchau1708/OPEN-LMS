/**
 * CHỈ DEMO/KIỂM THỬ (VITE_OFFLINE_SIM=1): giả lập "server ở xa" quanh DemoDataSource.
 *  - Mất mạng (navigator.onLine = false hoặc setSimOffline(true)) → mọi lời gọi ném TypeError('Failed to fetch').
 *  - Item trả về KHÔNG có đáp án (như Supabase); chấm bằng item đầy đủ ở "server" (nguồn bên trong).
 *  - clientEventId đã thấy → trả kết quả cũ, không chấm/cộng lại (như unique index ở server).
 *  - answeredAt ngoài 14 ngày → lỗi 422 (như Edge Function grade).
 */
import type { AwardResult, CompleteLessonOptions, DataSource, Item, LearningEvent, SubmitAnswerInput, SubmitAnswerResult, SubmitWorkInput } from '@openedu/contracts';
import { stripKey } from './cacheKeys';
import { checkAnsweredAt } from './policy';

let simOffline = false;
export function setSimOffline(v: boolean): void { simOffline = v; }

export interface SimOptions {
  isOnline?: () => boolean;
  /** Nơi nhớ clientEventId đã nhận (mặc định localStorage). */
  seen?: { get(): Record<string, unknown>; set(v: Record<string, unknown>): void };
  now?: () => number;
  latencyMs?: number;
}

const SEEN_KEY = 'openedu.sim.seenEvents';
function lsSeen() {
  return {
    get: (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, unknown>; } catch { return {}; } },
    set: (v: Record<string, unknown>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch { /* */ } },
  };
}

type AnyFn = (...a: unknown[]) => Promise<unknown>;

export function createSimulatedRemote(inner: DataSource, o: SimOptions = {}): DataSource {
  const isOnline = o.isOnline ?? (() => !simOffline && (typeof navigator === 'undefined' || navigator.onLine !== false));
  const seen = o.seen ?? lsSeen();
  const now = o.now ?? Date.now;
  const net = async () => {
    if (o.latencyMs) await new Promise((r) => setTimeout(r, o.latencyMs));
    if (!isOnline()) throw new TypeError('Failed to fetch');
  };
  const once = async <T,>(id: string | undefined, run: () => Promise<T>): Promise<T> => {
    if (!id) return run();
    const all = seen.get();
    if (id in all) return all[id] as T;
    const r = await run();
    seen.set({ ...seen.get(), [id]: r ?? null });
    return r;
  };
  const w: Record<string, AnyFn> = {
    getItems: async (ids) => { await net(); return ((await inner.getItems(ids as string[])) as Item[]).map(stripKey); },
    getItem: async (id) => { await net(); const it = await inner.getItem(id as string); return it ? stripKey(it) : null; },
    submitAnswer: async (raw) => {
      await net();
      const input = raw as SubmitAnswerInput;
      if (checkAnsweredAt(input.answeredAt, now()) === 'stale') throw Object.assign(new Error('stale_answer'), { status: 422 });
      return once<SubmitAnswerResult>(input.clientEventId, async () => {
        const full = (await inner.getItem(input.item.id)) ?? input.item;
        const r = await inner.submitAnswer({ ...input, item: full });
        return { ...r, result: { ...r.result, parts: undefined } };
      });
    },
    completeLesson: async (u, l, opts) => {
      await net();
      return once<AwardResult & { starsAwarded: number }>((opts as CompleteLessonOptions | undefined)?.clientEventId, () => inner.completeLesson(u as string, l as string));
    },
    recordEvent: async (e) => { await net(); await once((e as LearningEvent).clientEventId, () => inner.recordEvent(e as Omit<LearningEvent, 'id' | 'at'>)); },
    submitWork: async (i) => { await net(); return once((i as SubmitWorkInput).clientEventId, () => inner.submitWork(i as SubmitWorkInput)); },
  };
  return new Proxy(inner, {
    get(target, prop) {
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(w, prop)) return w[prop];
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      // Phiên đăng nhập + danh sách tài khoản mẫu chạy được không cần mạng (như phiên Supabase lưu trên máy).
      if (prop === 'listDemoUsers' || prop === 'resetDemo' || prop === 'signOut') return (v as AnyFn).bind(target);
      return async (...a: unknown[]) => { await net(); return (v as AnyFn).apply(target, a); };
    },
  }) as DataSource;
}
