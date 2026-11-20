import { describe, expect, it } from 'vitest';
import type { AnyResponse, Item, ScoreResult } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage, PrefixedWebStorage, STORAGE_PREFIX, type KVStorage } from '../storage';
import { ARENA_TARGET_ID } from '../tasks';

const NOW = new Date('2026-11-06T10:00:00');
/** Bộ chấm giả cho kiểm thử demo (không phụ thuộc tiến độ activity-engine). */
const fakeScore = (item: Item, r: AnyResponse | undefined): ScoreResult => {
  if (item.type === 'DRAW' || item.type === 'RECORD_READ' || item.type === 'POLL') return { graded: false, correct: false, score: 0 };
  const ok = JSON.stringify(r) === JSON.stringify({ value: (item.key as { value?: number })?.value }) || JSON.stringify(r) === JSON.stringify({ choice: (item.key as { correct?: string })?.correct });
  return { graded: true, correct: ok, score: ok ? 1 : 0 };
};
function demo(storage: KVStorage = new MemoryStorage()) {
  return new DemoDataSource({ storage, now: () => NOW, relayUrl: 'ws://127.0.0.1:1', score: fakeScore });
}

describe('DemoDataSource — đăng nhập', () => {
  it('đăng nhập bằng tên ngắn hoặc email, sai mật khẩu báo lỗi tiếng Việt, phiên được lưu', async () => {
    const storage = new MemoryStorage();
    const ds = demo(storage);
    expect(await ds.getCurrentUser()).toBeNull();
    await expect(ds.signIn('an2a1', '000000')).rejects.toThrow(/Mật khẩu/);
    await expect(ds.signIn('khongco', '123456')).rejects.toThrow(/Không tìm thấy/);
    const p = await ds.signIn('AN2A1@openedu.vn', '123456');
    expect(p.name).toBe('Minh An');
    expect((await demo(storage).getCurrentUser())?.id).toBe('u-an2a1');
    await ds.signOut();
    expect(await ds.getCurrentUser()).toBeNull();
    const t = await ds.signIn('colan', '123456');
    expect(t.role).toBe('teacher');
  });

  it('có đủ tài khoản mẫu, phụ huynh liên kết với Minh An', async () => {
    const ds = demo();
    const users = await ds.listDemoUsers();
    for (const u of ['colan', 'admin', 'an2a1', 'binh2a2', 'chi2a3', 'dung2a4', 'em1b1', 'phuong3c1', 'phuhuynh']) {
      expect(users.some((x) => x.username === u)).toBe(true);
    }
    expect((await ds.listChildren('u-phuhuynh')).map((c) => c.username)).toEqual(['an2a1']);
    expect((await ds.listStudents('c-2a')).map((s) => s.username)).toEqual(['an2a1', 'binh2a2', 'chi2a3', 'dung2a4']);
    expect((await ds.listClasses('u-colan')).map((c) => c.name)).toEqual(['2A']);
  });

  it('localStorage có tiền tố openedu:v1:, lỗi ghi vẫn chạy bằng bộ nhớ', async () => {
    const data = new Map<string, string>();
    let full = false;
    const ls = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceeded');
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    };
    const ds = demo(new PrefixedWebStorage(ls));
    await ds.listLessons();
    expect([...data.keys()].every((k) => k.startsWith(STORAGE_PREFIX))).toBe(true);
    full = true;
    await ds.signIn('binh2a2', '123456');
    expect((await ds.getCurrentUser())?.username).toBe('binh2a2');
  });

  it('resetDemo nạp lại mẫu', async () => {
    const ds = demo();
    await ds.deleteLesson('l-toan2-cong-co-nho');
    expect(await ds.getLesson('l-toan2-cong-co-nho')).toBeNull();
    await ds.resetDemo();
    expect((await ds.getLesson('l-toan2-cong-co-nho'))?.title).toBe('Phép cộng có nhớ trong phạm vi 100');
  });

  it('tìm bài không dấu, gói mẫu dùng VITE_CONTENT_ORIGIN mặc định', async () => {
    const ds = demo();
    expect((await ds.listLessons({ search: 'cong co nho' })).map((l) => l.id)).toEqual(['l-toan2-cong-co-nho']);
    const pkg = await ds.getPackage('pkg-dem-tao');
    expect(pkg?.baseUrl).toBe('http://localhost:5180/');
    expect(pkg?.entry).toBe('samples/dem-tao/index.html');
  });
});

describe('DemoDataSource — nhiệm vụ hôm nay', () => {
  it('Minh An: 3 bài lớp 2A + Leo tháp; tiến độ và isNew đúng', async () => {
    const ds = demo();
    const tasks = await ds.getTodayTasks('u-an2a1');
    expect(tasks.map((t) => t.targetId)).toEqual(['l-toan2-cong-co-nho', 'l-tv1-van-ang-anh', 'l-tnxh1-con-vat', ARENA_TARGET_ID]);
    const toan = tasks[0];
    expect(toan.kind).toBe('lesson');
    expect(toan.progress).toBeCloseTo(3 / 9);
    expect(toan.isNew).toBe(false);
    expect(toan.dueAt).toBeTruthy();
    expect(tasks[1].isNew).toBe(true);
    expect(tasks[1].progress).toBe(0);
    const arena = tasks[3];
    expect(arena.kind).toBe('arena');
    expect(arena.title).toBe('Leo tháp');
    expect(arena.subtitle).toMatch(/còn 4 lượt/);
  });

  it('Thu Phương lớp 3: bài Tiếng Anh; giao riêng cho một HS lớp khác cũng hiện', async () => {
    const ds = demo();
    expect((await ds.getTodayTasks('u-phuong3c1')).filter((t) => t.kind === 'lesson').map((t) => t.targetId)).toEqual(['l-ta3-hello-world']);
    await ds.createAssignment({ targetType: 'lesson', targetId: 'l-toan2-cong-co-nho', title: 'Thử thách', classId: 'c-2a', studentIds: ['u-phuong3c1'], openAt: NOW.toISOString(), createdBy: 'u-colan' });
    const t = await ds.getTodayTasks('u-phuong3c1');
    expect(t.some((x) => x.targetId === 'l-toan2-cong-co-nho')).toBe(true);
    expect((await ds.getTodayTasks('u-binh2a2')).filter((x) => x.title === 'Thử thách')).toHaveLength(0);
  });

  it('mở bài → hết isNew; hoàn thành → progress 1 và xuống cuối', async () => {
    const ds = demo();
    await ds.recordEvent({ userId: 'u-an2a1', verb: 'started', objectType: 'lesson', objectId: 'l-tv1-van-ang-anh', lessonId: 'l-tv1-van-ang-anh' });
    let tasks = await ds.getTodayTasks('u-an2a1');
    expect(tasks.find((t) => t.targetId === 'l-tv1-van-ang-anh')?.isNew).toBe(false);
    await ds.completeLesson('u-an2a1', 'l-toan2-cong-co-nho');
    tasks = await ds.getTodayTasks('u-an2a1');
    const lessons = tasks.filter((t) => t.kind === 'lesson');
    expect(lessons[lessons.length - 1].targetId).toBe('l-toan2-cong-co-nho');
    expect(lessons[lessons.length - 1].progress).toBe(1);
  });
});

describe('DemoDataSource — nộp bài và hoàn thành', () => {
  it('submitAnswer: chỉ cộng sao lần đúng đầu tiên trong cùng bài; ghi answers vào tiến độ', async () => {
    const ds = demo();
    const item = (await ds.getItem('it-toan2-cam-36-8')) as Item;
    const ctx = { lessonId: 'l-toan2-cong-co-nho', slideId: 'l-toan2-cong-co-nho-s4', source: 'lesson' as const };
    const wrong = await ds.submitAnswer({ userId: 'u-an2a1', item, response: { choice: 'b' }, context: ctx });
    expect(wrong.result.correct).toBe(false);
    expect(wrong.starsAwarded).toBe(0);
    const right = await ds.submitAnswer({ userId: 'u-an2a1', item, response: { choice: 'a' }, context: ctx });
    expect(right.result.correct).toBe(true);
    expect(right.starsAwarded).toBe(1);
    expect(right.award?.wallet.stars).toBe(37);
    const again = await ds.submitAnswer({ userId: 'u-an2a1', item, response: { choice: 'a' }, context: ctx });
    expect(again.starsAwarded).toBe(0);
    // Cùng câu ở bối cảnh khác (luyện tập) được thưởng lần nữa.
    const practice = await ds.submitAnswer({ userId: 'u-an2a1', item, response: { choice: 'a' }, context: { source: 'practice' } });
    expect(practice.starsAwarded).toBe(1);
    const p = await ds.getProgress('u-an2a1', 'l-toan2-cong-co-nho');
    expect(p?.answers['l-toan2-cong-co-nho-s4']).toEqual({ correct: true, score: 1 });
    expect(p?.answers['l-toan2-cong-co-nho-s3']).toEqual({ correct: true, score: 1 });
    const events = await ds.listEvents({ userId: 'u-an2a1', limit: 10 });
    expect(events.filter((e) => e.verb === 'answered' && e.objectId === item.id)).toHaveLength(4);
  });

  it('submitAnswer: dạng không chấm (DRAW) cho 1 sao một lần', async () => {
    const ds = demo();
    const draw = (await ds.getItem('it-tnxh1-ve-con-vat')) as Item;
    const ctx = { lessonId: 'l-tnxh1-con-vat', slideId: 'l-tnxh1-con-vat-s6' };
    const a = await ds.submitAnswer({ userId: 'u-binh2a2', item: draw, response: { dataUrl: 'data:image/png;base64,AA' }, context: ctx });
    expect(a.result.graded).toBe(false);
    expect(a.starsAwarded).toBe(1);
    const b = await ds.submitAnswer({ userId: 'u-binh2a2', item: draw, response: { dataUrl: 'data:image/png;base64,BB' }, context: ctx });
    expect(b.starsAwarded).toBe(0);
  });

  it('completeLesson: sao = min(10, câu đúng có chấm), chỉ một lần', async () => {
    const ds = demo();
    const r1 = await ds.completeLesson('u-an2a1', 'l-toan2-cong-co-nho');
    expect(r1.starsAwarded).toBe(1); // s3 đúng trong dữ liệu mẫu
    expect(r1.wallet.stars).toBe(37);
    const r2 = await ds.completeLesson('u-an2a1', 'l-toan2-cong-co-nho');
    expect(r2.starsAwarded).toBe(0);
    expect(r2.wallet.stars).toBe(37);
    const p = await ds.getProgress('u-an2a1', 'l-toan2-cong-co-nho');
    expect(p?.completedAt).toBeTruthy();
    expect(p?.completedSlides).toHaveLength(9);
  });

  it('saveProgress ghép, không làm mất câu trả lời cũ', async () => {
    const ds = demo();
    await ds.saveProgress({ userId: 'u-an2a1', lessonId: 'l-toan2-cong-co-nho', slideIndex: 4, completedSlides: ['l-toan2-cong-co-nho-s4'], answers: {}, starsEarned: 0, updatedAt: NOW.toISOString() });
    const p = await ds.getProgress('u-an2a1', 'l-toan2-cong-co-nho');
    expect(p?.slideIndex).toBe(4);
    expect(p?.completedSlides).toHaveLength(4);
    expect(p?.answers['l-toan2-cong-co-nho-s3']?.correct).toBe(true);
    expect(p?.starsEarned).toBe(1);
  });
});
