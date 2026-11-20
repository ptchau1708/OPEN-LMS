/**
 * Kiểm thử tích hợp: tools/live-relay/server.mjs chạy trong tiến trình + RelayLiveChannel thật (WebSocket của Node 22).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LiveMessage } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { RelayLiveChannel } from '../live/RelayLiveChannel';
import { MemoryStorage } from '../storage';

const hasWs = typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';
type Relay = { port: number; close: () => Promise<void> };
let relay: Relay | null = null;

async function startRelay(port = 0): Promise<Relay> {
  const url = new URL('../../../../tools/live-relay/server.mjs', import.meta.url).href;
  const mod = await import(/* @vite-ignore */ url);
  return mod.startRelay({ port, host: '127.0.0.1', quiet: true });
}

function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error('hết thời gian chờ'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe.skipIf(!hasWs)('live-relay + RelayLiveChannel', () => {
  beforeAll(async () => {
    relay = await startRelay();
  });
  afterAll(async () => {
    await relay?.close();
  });

  it('tạo phòng → tìm theo mã → GV/HS/TV đồng bộ → trả lời có chấm', async () => {
    const wsUrl = `ws://127.0.0.1:${relay!.port}`;
    const teacherDs = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: wsUrl });
    const studentDs = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: wsUrl, score: (item, r) => ({ graded: true, correct: JSON.stringify(r) === JSON.stringify({ value: (item.key as { value: number }).value }), score: 1 }) });

    await teacherDs.signIn('colan', '123456');
    const info = await teacherDs.createLiveSession('l-toan2-cong-co-nho', 'c-2a');
    expect(info.pin).toMatch(/^\d{6}$/);
    expect(info.lessonTitle).toBe('Phép cộng có nhớ trong phạm vi 100');
    expect(await studentDs.findLiveSession(info.pin)).toEqual(info);
    expect(await studentDs.findLiveSession('000000')).toBeNull();

    const teacher = (await teacherDs.openLiveChannel(info.sessionId, 'teacher')) as RelayLiveChannel;
    const screen = (await teacherDs.openLiveChannel(info.sessionId, 'screen')) as RelayLiveChannel;
    const student = (await studentDs.openLiveChannel(info.sessionId, 'student')) as RelayLiveChannel;
    expect(teacher.status).toBe('open');
    expect(student.getState()?.lesson?.id).toBe('l-toan2-cong-co-nho');
    expect(student.getState()?.items?.['it-toan2-que-26-7']?.key).toEqual({ value: 33 });
    expect(teacher.getState()?.teams.map((t) => t.id)).toEqual(['t-2a-mat-troi', 't-2a-cau-vong']);

    const seen: LiveMessage[] = [];
    screen.subscribe((m) => seen.push(m));

    await student.join({ userId: 'u-an2a1', name: 'Minh An', mascot: 'shiba', color: '#e8964a' });
    await waitFor(() => teacher.getState()?.participants.some((p) => p.userId === 'u-an2a1') ?? false);
    expect(teacher.getState()?.participants[0].teamId).toBe('t-2a-mat-troi');
    await waitFor(() => teacher.online().length === 1);

    await teacher.send({ type: 'go', slideIndex: 2 });
    await teacher.send({ type: 'open', itemId: 'it-toan2-que-26-7', seconds: 30 });
    await waitFor(() => student.getState()?.phase === 'activity-open');
    expect(student.getState()?.slideIndex).toBe(2);
    expect(student.getState()?.timerEndsAt).toBeTruthy();
    // Tin rút gọn: bài giảng vẫn còn trên máy HS.
    expect(student.getState()?.lesson?.slides.length).toBe(9);

    const res = await student.respond({ sessionId: info.sessionId, userId: 'u-an2a1', itemId: 'it-toan2-que-26-7', slideIndex: 2, response: { value: 33 } });
    expect(res).toEqual({ correct: true, score: 1 });
    await waitFor(() => teacher.responses(2).length === 1 && screen.responses(2).length === 1);
    expect(teacher.responses(2)[0]).toMatchObject({ userId: 'u-an2a1', correct: true, score: 1 });
    expect(seen.some((m) => m.kind === 'response')).toBe(true);
    // Máy HS tự cộng sao vào ví (lần đúng đầu tiên trong phiên).
    await waitFor(() => false, 150).catch(() => undefined);
    expect((await studentDs.getWallet('u-an2a1')).stars).toBe(37);

    await teacher.send({ type: 'award', target: { kind: 'team', id: 't-2a-mat-troi' }, stars: 2 });
    await waitFor(() => screen.getState()?.teams.find((t) => t.id === 't-2a-mat-troi')?.stars === 2);

    // TV vào muộn nhận danh sách câu trả lời cũ.
    const lateScreen = (await teacherDs.openLiveChannel(info.sessionId, 'screen')) as RelayLiveChannel;
    await waitFor(() => lateScreen.responses(2).length === 1);

    student.close();
    await waitFor(() => teacher.online().length === 0);
    await teacher.send({ type: 'end' });
    await waitFor(() => screen.getState()?.phase === 'ended');
    expect(await studentDs.findLiveSession(info.pin)).toBeNull();
    for (const c of [teacher, screen, lateScreen]) c.close();
    expect(teacher.status).toBe('closed');
  });

  it('relay khởi động lại: GV tự tạo lại phòng từ trạng thái trên máy, HS vào lại được', async () => {
    const port = relay!.port;
    const wsUrl = `ws://127.0.0.1:${port}`;
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: wsUrl });
    const info = await ds.createLiveSession('l-tv1-van-ang-anh');
    const teacher = (await ds.openLiveChannel(info.sessionId, 'teacher')) as RelayLiveChannel;
    await teacher.send({ type: 'go', slideIndex: 3 });

    await relay!.close();
    await waitFor(() => teacher.status === 'connecting');
    await teacher.send({ type: 'lock', locked: true }); // thay đổi lúc mất mạng
    relay = await startRelay(port);
    await waitFor(() => teacher.status === 'open', 8000);

    const student = new RelayLiveChannel(info.sessionId, 'student', { url: wsUrl });
    await student.whenReady(3000);
    expect(student.getState()?.slideIndex).toBe(3);
    expect(student.getState()?.locked).toBe(true);
    student.close();
    teacher.close();
  }, 15000);
});
