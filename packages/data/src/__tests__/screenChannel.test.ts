import { describe, expect, it } from 'vitest';
import type { LiveState } from '@openedu/contracts';
import { SupabaseScreenChannel } from '../supabase/SupabaseScreenChannel';
import type { V2Client } from '../supabase/client';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 800): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('hết thời gian chờ');
    await wait(5);
  }
}

function state(phase: LiveState['phase'], at: string): LiveState {
  return { sessionId: 's1', pin: '123456', lessonId: 'l1', slideIndex: 0, phase, locked: false, teams: [], participants: [{ userId: 'u1', name: 'An', mascot: 'nghe', color: '#000' }], studentStars: {}, updatedAt: at };
}
const LESSON = { id: 'l1', title: 'Đố vui', subject: 'khac', grade: 5, ownerId: '', status: 'draft', slides: [{ id: 's1', layout: 'activity', itemId: 'i1' }] };
const ITEM = { id: 'i1', type: 'MCQ', grade: 5, subject: 'khac', prompt: { text: 'Kinh đô?' }, payload: { options: [{ id: 'a', text: 'Huế' }, { id: 'b', text: 'Thăng Long' }] } };

function fakeSb(replies: ({ data: unknown; error?: { code?: string; message: string } } )[]) {
  const calls: Record<string, unknown>[] = [];
  const sb = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, ...args });
      const r = replies.length > 1 ? replies.shift()! : replies[0]!;
      return { data: r.data, error: r.error ?? null };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track: async () => undefined }),
    removeChannel: async () => undefined,
  } as unknown as V2Client;
  return { sb, calls };
}

describe('SupabaseScreenChannel — TV không đăng nhập (SQL 21)', () => {
  it('lần đầu tải bài giảng + câu hỏi (không đáp án); hiện đáp án thì ghép đáp án vào câu', async () => {
    const t1 = '2026-11-26T01:00:00.000Z';
    const t2 = '2026-11-26T01:00:05.000Z';
    const { sb, calls } = fakeSb([
      { data: { sessionId: 's1', state: state('activity-open', t1), lesson: LESSON, items: [ITEM], keys: {}, responses: [{ sessionId: 's1', userId: 'u1', itemId: 'i1', slideIndex: 0, response: { choice: 'b' }, at: t1 }], now: t1 } },
      { data: { sessionId: 's1', state: state('reveal', t2), keys: { i1: { correct: 'b' } }, responses: [{ sessionId: 's1', userId: 'u1', itemId: 'i1', slideIndex: 0, response: { choice: 'b' }, at: t1, correct: true, score: 1 }], now: t2 } },
    ]);
    const ch = new SupabaseScreenChannel(sb, 's1', '123 456', { intervalMs: 10, realtime: false });
    expect(await ch.whenReady(500)).toBe(true);
    const s = ch.getState()!;
    expect(s.lesson?.title).toBe('Đố vui');
    expect(s.items?.i1?.prompt.text).toBe('Kinh đô?');
    expect(s.items?.i1?.key).toBeUndefined();
    expect(ch.responses(0)).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'live_screen', p_session: 's1', p_pin: '123456', p_full: true, p_since: null });
    await until(() => ch.getState()?.phase === 'reveal');
    expect((ch.getState()!.items!.i1!.key as { correct: string }).correct).toBe('b');
    expect(ch.responses(0)[0].correct).toBe(true);
    expect(calls[1]).toMatchObject({ p_full: false });
    expect(typeof calls[1].p_since).toBe('string');
    await expect(ch.send({ type: 'close' })).rejects.toThrow();
    ch.close();
    expect(ch.status).toBe('closed');
  });

  it('mã sai / lớp đã kết thúc → báo lỗi dễ hiểu', async () => {
    const { sb } = fakeSb([{ data: null }]);
    const ch = new SupabaseScreenChannel(sb, 's1', '000000', { intervalMs: 1000, realtime: false });
    expect(await ch.whenReady(300)).toBe(false);
    expect(ch.status).toBe('error');
    expect(ch.error).toContain('đã kết thúc');
    ch.close();
  });

  it('máy chủ chưa chạy SQL 21 → nhắc chạy SQL 21', async () => {
    const { sb } = fakeSb([{ data: null, error: { code: 'PGRST202', message: 'Could not find the function v2.live_screen' } }]);
    const ch = new SupabaseScreenChannel(sb, 's1', '123456', { intervalMs: 1000, realtime: false });
    await ch.whenReady(300);
    expect(ch.error).toContain('SQL 21');
    ch.close();
  });
});
