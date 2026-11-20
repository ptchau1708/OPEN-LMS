import { describe, expect, it } from 'vitest';
import type { AnyResponse, Item, LessonProgress, ScoreResult } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { MemoryOfflineStore } from '../offline/memoryStore';
import { Outbox } from '../offline/outbox';
import { backoffMs, BACKOFF_MAX_MS, checkAnsweredAt, clampAnsweredAt, classifyError, MAX_ATTEMPTS, OfflineError } from '../offline/policy';
import { createOfflineAware } from '../offline/OfflineAwareDataSource';
import { createSimulatedRemote } from '../offline/simulatedRemote';
import { collectMediaUrls, DownloadManager } from '../offline/downloads';
import { checkAnsweredAt as serverCheck } from '../../../../supabase/functions/_shared/offline';
import type { AnyOutboxOp } from '../offline/types';

const NOW = Date.parse('2026-11-15T10:00:00Z');
const netErr = () => new TypeError('Failed to fetch');

function prog(lessonId: string, slides: string[], extra: Partial<LessonProgress> = {}): LessonProgress {
  return { userId: 'u1', lessonId, slideIndex: slides.length, completedSlides: slides, answers: {}, starsEarned: 0, updatedAt: new Date(NOW).toISOString(), ...extra };
}

describe('policy', () => {
  it('lùi dần tăng theo lũy thừa 2, có trần, có nhiễu', () => {
    expect(backoffMs(1, () => 0)).toBe(1000);
    expect(backoffMs(1, () => 0.999)).toBeLessThan(2000);
    expect(backoffMs(3, () => 0)).toBe(4000);
    expect(backoffMs(40, () => 0.999)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });
  it('kiểm tra thời điểm trả lời (client = server)', () => {
    for (const f of [checkAnsweredAt, serverCheck]) {
      expect(f(undefined, NOW)).toBe('ok');
      expect(f(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe('ok');
      expect(f(new Date(NOW + 60_000).toISOString(), NOW)).toBe('ok');
      expect(f(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('future');
      expect(f(new Date(NOW - 15 * 86_400_000).toISOString(), NOW)).toBe('stale');
      expect(f('hôm qua', NOW)).toBe('invalid');
    }
    expect(clampAnsweredAt(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe(new Date(NOW).toISOString());
  });
  it('phân loại lỗi', () => {
    expect(classifyError(netErr())).toBe('network');
    expect(classifyError(new OfflineError())).toBe('network');
    expect(classifyError(Object.assign(new Error('x'), { status: 503 }))).toBe('transient');
    expect(classifyError(Object.assign(new Error('x'), { status: 422 }))).toBe('permanent');
    expect(classifyError(new Error('Chưa nộp được (TypeError: Failed to fetch)'))).toBe('network');
    expect(classifyError(Object.assign(new Error('bọc'), { cause: { name: 'FunctionsFetchError', message: 'x' } }))).toBe('network');
    expect(classifyError(new Error('lạ'))).toBe('transient');
  });
});

describe('Outbox', () => {
  it('gửi đúng thứ tự, dừng khi mất mạng và giữ thứ tự cho lần sau', async () => {
    let t = NOW;
    const ob = new Outbox(new MemoryOfflineStore(), { now: () => t, rand: () => 0 });
    for (const n of ['a', 'b', 'c']) await ob.enqueue('event', 'u1', { event: { userId: 'u1', verb: 'completed', objectType: 'lesson', objectId: n }, at: '' }, `id-${n}-000000`);
    const sent: string[] = [];
    let down = false;
    const exec = async (op: AnyOutboxOp) => {
      if (op.kind === 'event' && op.payload.event.objectId === 'b' && down) throw netErr();
      sent.push(op.kind === 'event' ? op.payload.event.objectId : '?');
    };
    down = true;
    const r1 = await ob.flush(exec);
    expect(sent).toEqual(['a']);
    expect(r1.stoppedOffline).toBe(true);
    expect(r1.remaining).toBe(2);
    // Đang lùi dần: lần flush thường chưa gửi lại.
    down = false;
    expect((await ob.flush(exec)).sent).toHaveLength(0);
    t += 10_000;
    await ob.flush(exec);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(await ob.pending()).toHaveLength(0);
  });

  it('idempotent: cùng id chỉ một thao tác; started trùng đối tượng bị bỏ', async () => {
    const ob = new Outbox(new MemoryOfflineStore(), { now: () => NOW });
    const e = { event: { userId: 'u1', verb: 'started' as const, objectType: 'lesson' as const, objectId: 'L1' }, at: '' };
    await ob.enqueue('event', 'u1', e, 'same-id-0001');
    await ob.enqueue('event', 'u1', e, 'same-id-0001');
    await ob.enqueue('event', 'u1', e, 'other-id-0002');
    expect(await ob.list()).toHaveLength(1);
  });

  it('gộp tiến độ cùng bài bằng mergeProgress (giữ vị trí cũ trong hàng)', async () => {
    const ob = new Outbox(new MemoryOfflineStore(), { now: () => NOW });
    await ob.enqueue('progress', 'u1', prog('L1', ['s1']));
    await ob.enqueue('complete', 'u1', { lessonId: 'L2', completedAt: '' });
    await ob.enqueue('progress', 'u1', prog('L1', ['s2'], { answers: { s2: { correct: true, score: 1 } } }));
    const list = await ob.list();
    expect(list.map((o) => o.kind)).toEqual(['progress', 'complete']);
    const p = list[0].payload as LessonProgress;
    expect(p.completedSlides.sort()).toEqual(['s1', 's2']);
    expect(p.answers.s2.correct).toBe(true);
  });

  it('lỗi vĩnh viễn → failed, không chặn thao tác sau; lỗi tạm quá MAX_ATTEMPTS → failed', async () => {
    let t = NOW;
    const ob = new Outbox(new MemoryOfflineStore(), { now: () => t, rand: () => 0 });
    await ob.enqueue('complete', 'u1', { lessonId: 'BAD', completedAt: '' });
    await ob.enqueue('complete', 'u1', { lessonId: 'FLAKY', completedAt: '' });
    await ob.enqueue('complete', 'u1', { lessonId: 'OK', completedAt: '' });
    const ok: string[] = [];
    const exec = async (op: AnyOutboxOp) => {
      const l = op.kind === 'complete' ? op.payload.lessonId : '';
      if (l === 'BAD') throw Object.assign(new Error('không có quyền'), { status: 403 });
      if (l === 'FLAKY') throw Object.assign(new Error('lỗi máy chủ'), { status: 500 });
      ok.push(l);
    };
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) { await ob.flush(exec); t += BACKOFF_MAX_MS; }
    expect(ok).toEqual(['OK']);
    const all = await ob.list();
    expect(all.map((o) => o.status)).toEqual(['failed', 'failed']);
    await ob.retryFailed();
    expect(await ob.pending()).toHaveLength(2);
  });

  it('flush chồng nhau dùng chung một lần chạy', async () => {
    const ob = new Outbox(new MemoryOfflineStore(), { now: () => NOW });
    await ob.enqueue('complete', 'u1', { lessonId: 'L', completedAt: '' });
    let calls = 0;
    const exec = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); };
    await Promise.all([ob.flush(exec), ob.flush(exec), ob.flush(exec)]);
    expect(calls).toBe(1);
  });
});

/* ---------- wrapper với "server" giả (DemoDataSource sau mạng giả) ---------- */
const fakeScore = (item: Item, r: AnyResponse | undefined): ScoreResult => {
  if (item.type === 'DRAW' || item.type === 'RECORD_READ' || item.type === 'POLL') return { graded: false, correct: false, score: 0 };
  if (item.key == null) return { graded: false, correct: false, score: 0 };
  const ok = JSON.stringify(r) === JSON.stringify({ choice: (item.key as { correct?: string })?.correct }) || JSON.stringify(r) === JSON.stringify({ value: (item.key as { value?: number })?.value });
  return { graded: true, correct: ok, score: ok ? 1 : 0 };
};

async function setup() {
  let up = true;
  const seen: Record<string, unknown> = {};
  const demo = new DemoDataSource({ storage: new MemoryStorage(), now: () => new Date(NOW), relayUrl: 'ws://127.0.0.1:1', score: fakeScore });
  const user = await demo.signIn('an2a1', '123456');
  const remote = createSimulatedRemote(demo, { isOnline: () => up, now: () => NOW, seen: { get: () => ({ ...seen }), set: (v) => Object.assign(seen, v) } });
  const store = new MemoryOfflineStore();
  const { ds, controller, outbox } = createOfflineAware(remote, { store, isOnline: () => up, now: () => NOW, score: fakeScore, readTimeoutMs: 50 });
  const lesson = (await ds.listLessons({ status: 'published' })).find((l) => l.slides.some((s) => s.itemId)) ?? null;
  if (!lesson) throw new Error('seed thiếu bài có câu hỏi');
  const slide = lesson.slides.find((s) => s.itemId)!;
  const full = (await demo.getItem(slide.itemId!))!;
  return { demo, ds, controller, outbox, store, user, lesson, slide, full, seen, setUp: (v: boolean) => { up = v; } };
}

function rightAnswer(item: Item): AnyResponse {
  const k = item.key as { correct?: string; value?: number } | undefined;
  return (k?.correct !== undefined ? { choice: k.correct } : { value: k?.value }) as AnyResponse;
}

describe('OfflineAwareDataSource', () => {
  it('đọc: mất mạng dùng bản lưu; item lưu KHÔNG có đáp án; chưa có bản lưu → OfflineError', async () => {
    const s = await setup();
    await s.ds.getLesson(s.lesson.id);
    await s.ds.getItems([s.slide.itemId!]);
    await s.ds.getWallet(s.user.id);
    await s.ds.getCurrentUser();
    s.setUp(false);
    expect((await s.ds.getLesson(s.lesson.id))?.id).toBe(s.lesson.id);
    const items = await s.ds.getItems([s.slide.itemId!]);
    expect(items[0].id).toBe(s.slide.itemId);
    expect('key' in items[0]).toBe(false);
    expect((await s.ds.getCurrentUser())?.id).toBe(s.user.id);
    expect((await s.ds.getWallet(s.user.id)).userId).toBe(s.user.id);
    await expect(s.ds.getLesson('khong-co')).rejects.toBeInstanceOf(OfflineError);
    expect(s.ds.mode).toBe('demo');
  });

  it('ghi offline → hàng đợi; có mạng → đồng bộ đúng thứ tự, sao về sau, không trùng', async () => {
    const s = await setup();
    const before = (await s.demo.getWallet(s.user.id)).stars;
    await s.ds.getItems([s.slide.itemId!]);
    s.setUp(false);
    const item = (await s.ds.getItems([s.slide.itemId!]))[0];
    expect('key' in item).toBe(false);
    const r = await s.ds.submitAnswer({ userId: s.user.id, item, response: rightAnswer(s.full), context: { lessonId: s.lesson.id, slideId: s.slide.id, source: 'lesson' }, attempt: 1 });
    expect(r.pending).toBe(true);
    expect(r.starsAwarded).toBe(0);
    await s.ds.saveProgress(prog(s.lesson.id, [s.slide.id], { userId: s.user.id }));
    await s.ds.saveProgress(prog(s.lesson.id, [s.lesson.slides[0].id], { userId: s.user.id }));
    const c = await s.ds.completeLesson(s.user.id, s.lesson.id);
    expect(c.pending).toBe(true);
    await s.ds.recordEvent({ userId: s.user.id, verb: 'started', objectType: 'lesson', objectId: s.lesson.id, lessonId: s.lesson.id });
    expect(s.controller.pendingCount()).toBe(4); // answer, progress (gộp), complete, event
    // Tiến độ trên máy vẫn đọc được khi mất mạng.
    const lp = await s.ds.getProgress(s.user.id, s.lesson.id);
    expect(lp?.completedSlides).toContain(s.slide.id);
    expect(lp?.completedAt).toBeTruthy();
    // Còn mất mạng: đồng bộ không gửi gì.
    expect((await s.controller.syncNow()).sent).toBe(0);

    s.setUp(true);
    let reported = 0;
    s.controller.onSynced((rep) => { reported = rep.stars; });
    const rep = await s.controller.syncNow({ force: true });
    expect(rep.sent).toBe(4);
    expect(rep.graded).toBe(1);
    expect(rep.correct).toBe(1);
    expect(rep.stars).toBeGreaterThan(0);
    expect(reported).toBe(rep.stars);
    expect(s.controller.pendingCount()).toBe(0);
    const after = (await s.demo.getWallet(s.user.id)).stars;
    expect(after - before).toBe(rep.stars);
    // Server nhận câu trả lời trước khi hoàn thành bài (complete tính sao từ answers).
    const events = await s.demo.listEvents({ userId: s.user.id, lessonId: s.lesson.id });
    const answeredAt = events.find((e) => e.verb === 'answered')!.at;
    const completedAt = events.find((e) => e.verb === 'completed' && e.objectType === 'lesson')?.at ?? answeredAt;
    expect(answeredAt <= completedAt).toBe(true);
    // Gửi lại cùng clientEventId (mất phản hồi lần trước) → server bỏ qua.
    const ids = Object.keys(s.seen);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const again = await s.ds.submitAnswer({ userId: s.user.id, item: s.full, response: rightAnswer(s.full), context: { lessonId: s.lesson.id, slideId: s.slide.id }, clientEventId: ids[0] });
    expect(again.starsAwarded).toBeGreaterThanOrEqual(0);
    expect((await s.demo.getWallet(s.user.id)).stars).toBe(after);
  });

  it('ghi khi hàng đợi còn việc → xếp hàng sau (không vượt lên)', async () => {
    const s = await setup();
    s.setUp(false);
    await s.ds.completeLesson(s.user.id, s.lesson.id);
    s.setUp(true);
    // Có mạng nhưng hàng đợi chưa trống: câu trả lời này vẫn xếp hàng.
    const order: string[] = [];
    s.outbox.subscribe(() => undefined);
    const r = await s.ds.submitAnswer({ userId: s.user.id, item: s.full, response: rightAnswer(s.full), context: { lessonId: s.lesson.id, slideId: s.slide.id } });
    expect(r.pending).toBe(true);
    for (const op of await s.outbox.list()) order.push(op.kind);
    expect(order[0]).toBe('complete');
    await s.controller.syncNow({ force: true });
    expect(s.controller.pendingCount()).toBe(0);
  });

  it('câu quá 14 ngày → failed (không gửi), thao tác khác vẫn đi', async () => {
    const s = await setup();
    s.setUp(false);
    await s.ds.submitAnswer({ userId: s.user.id, item: s.full, response: rightAnswer(s.full), context: { lessonId: s.lesson.id, slideId: s.slide.id }, answeredAt: new Date(NOW - 20 * 86_400_000).toISOString() });
    await s.ds.recordEvent({ userId: s.user.id, verb: 'viewed', objectType: 'slide', objectId: 'x' });
    s.setUp(true);
    const rep = await s.controller.syncNow({ force: true });
    expect(rep.failed).toBe(1);
    expect(rep.sent).toBe(1);
    expect(s.controller.failedCount()).toBe(1);
    await s.controller.discardFailed();
    expect(s.controller.failedCount()).toBe(0);
  });

  it('bài làm có ảnh offline: ảnh cất vào blobs, đồng bộ rồi xóa', async () => {
    const s = await setup();
    const task = (await s.demo.listWorkTasks({ studentId: s.user.id }))[0];
    if (!task) return; // seed không có bài viết
    s.setUp(false);
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const sub = await s.ds.submitWork({ taskId: task.id, studentId: s.user.id, text: 'Bài của em', images: [blob] });
    expect(sub.id.startsWith('offline:')).toBe(true);
    expect(await s.store.keys('blobs')).toHaveLength(1);
    s.setUp(true);
    const rep = await s.controller.syncNow({ force: true });
    if (rep.sent + rep.failed !== 1) console.log((await s.controller.listOps()).map((o) => o.lastError));
    expect(rep.sent + rep.failed).toBe(1);
    if (rep.sent) {
      expect(await s.store.keys('blobs')).toHaveLength(0);
      expect((await s.demo.listSubmissions({ studentId: s.user.id })).some((x) => x.taskId === task.id)).toBe(true);
    }
  });
});

describe('Tải bài về', () => {
  it('gom URL ảnh/âm thanh, bỏ emoji/data/YouTube', () => {
    const urls = collectMediaUrls({ image: 'emoji:🍎', a: { image: '/img/a.png', audio: 'https://x.vn/a.mp3' }, b: ['data:image/png;base64,xx', 'https://youtu.be/abc', '/b.svg'], text: 'không phải.png' });
    expect([...urls].sort()).toEqual(['/b.svg', '/img/a.png', 'https://x.vn/a.mp3']);
  });
  it('lưu bài + item không đáp án, xóa được; gói HTML5 đánh dấu cần mạng', async () => {
    const s = await setup();
    const dm = new DownloadManager({ ds: s.ds, store: s.store, caches: undefined });
    const e = await dm.download(s.lesson.id);
    expect(e.itemIds.length).toBeGreaterThan(0);
    expect(await dm.has(s.lesson.id)).toBe(true);
    s.setUp(false);
    const items = await s.ds.getItems(e.itemIds);
    expect(items.every((it) => !('key' in it))).toBe(true);
    await dm.remove(s.lesson.id);
    expect(await dm.list()).toHaveLength(0);
    const pkgLesson = (await s.demo.listLessons({})).find((l) => l.slides.some((x) => x.layout === 'package'));
    if (pkgLesson) {
      s.setUp(true);
      const p = await dm.download(pkgLesson.id);
      expect(p.needsNetwork.join(' ')).toMatch(/Gói tương tác/);
    }
  });

  it('ôn tập khi mất mạng: xếp hàng, không đoán kết quả; đồng bộ xong gửi kết quả THẬT của từng câu', async () => {
    const s = await setup();
    await s.ds.getItems([s.slide.itemId!]);
    const sent: { setId: string; results: { itemId: string; correct: boolean }[] }[] = [];
    (s.demo as unknown as { submitRemediationResult: unknown }).submitRemediationResult = async (_u: string, setId: string, results: { itemId: string; correct: boolean }[]) => {
      sent.push({ setId, results });
      return { setId, skillCode: 'x', passed: true, correct: 1, total: 1, mastery: {}, message: '' };
    };
    s.setUp(false);
    const item = (await s.ds.getItems([s.slide.itemId!]))[0];
    const a = await s.ds.submitAnswer({ userId: s.user.id, item, response: rightAnswer(s.full), context: { source: 'practice' } });
    expect(a.pending).toBe(true);
    // Trang ôn tập coi câu chưa chấm là "đúng" tạm; lớp offline không được tin con số đó.
    const out = await s.ds.submitRemediationResult(s.user.id, 'set-1', [{ itemId: item.id, correct: true }, { itemId: 'da-cham-truoc', correct: false }]);
    expect(out.pending).toBe(true);
    expect(out.passed).toBe(false);
    expect(out.total).toBe(2);
    expect(sent).toHaveLength(0);
    expect((await s.outbox.list()).map((o) => o.kind)).toEqual(['answer', 'remediation']);
    s.setUp(true);
    const rep = await s.controller.syncNow();
    expect(rep.remaining).toBe(0);
    expect(sent).toEqual([{ setId: 'set-1', results: [{ itemId: item.id, correct: true }, { itemId: 'da-cham-truoc', correct: false }] }]);
  });

  it('ôn tập: câu bị từ chối khi đồng bộ tính là chưa đúng', async () => {
    const s = await setup();
    const sent: { itemId: string; correct: boolean }[][] = [];
    (s.demo as unknown as { submitRemediationResult: unknown }).submitRemediationResult = async (_u: string, setId: string, results: { itemId: string; correct: boolean }[]) => { sent.push(results); return { setId, skillCode: 'x', passed: false, correct: 0, total: 1, mastery: {}, message: '' }; };
    s.setUp(false);
    await s.outbox.enqueue('remediation', s.user.id, { setId: 'set-2', results: [{ itemId: 'chua-dong-bo', correct: true }], pendingItemIds: ['chua-dong-bo'] });
    s.setUp(true);
    await s.controller.syncNow();
    expect(sent).toEqual([[{ itemId: 'chua-dong-bo', correct: false }]]);
  });
});
