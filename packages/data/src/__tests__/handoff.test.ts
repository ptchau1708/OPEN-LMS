import { describe, expect, it } from 'vitest';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { handoffUrl, readHandoffHash, packSession, unpackSession, HANDOFF_KEY } from '../handoff';

const demo = (storage = new MemoryStorage()) => new DemoDataSource({ storage, relayUrl: 'ws://127.0.0.1:1' });

describe('đăng nhập chung — đóng gói phiên', () => {
  it('đóng gói rồi mở ra được, kể cả kí tự Unicode', () => {
    const p = packSession({ a: 'eyJ.a+b/c', r: 'rt-Đ' });
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(unpackSession(p)).toEqual({ v: 1, a: 'eyJ.a+b/c', r: 'rt-Đ', d: undefined });
  });

  it('từ chối chuỗi rác, thiếu token, sai phiên bản', () => {
    expect(unpackSession('')).toBeNull();
    expect(unpackSession('!!!')).toBeNull();
    expect(unpackSession(packSession({ a: 'chỉ access' }))).toBeNull();
    expect(unpackSession(btoa(JSON.stringify({ v: 2, d: 'u' })).replace(/=+$/, ''))).toBeNull();
    expect(unpackSession('x'.repeat(20_000))).toBeNull();
  });

  it('địa chỉ đích đặt phiên ở phần # và chỉ nhận http(s)', () => {
    const p = packSession({ d: 'u-colan' });
    const url = handoffUrl('https://gv.truong.edu.vn/', '/', p)!;
    expect(url).toBe(`https://gv.truong.edu.vn/#${HANDOFF_KEY}=${p}`);
    expect(readHandoffHash(new URL(url).hash)).toBe(p);
    expect(handoffUrl('javascript:alert(1)', '/', p)).toBeNull();
    expect(handoffUrl('https://hoc.truong.edu.vn', '/', null)).toBe('https://hoc.truong.edu.vn/');
    expect(readHandoffHash('#khac=1')).toBeNull();
    expect(readHandoffHash(`#${HANDOFF_KEY}=rac`)).toBeNull();
  });
});

describe('đăng nhập chung — bản demo', () => {
  it('app chuyển đi bỏ phiên, app nhận đăng nhập đúng người', async () => {
    const hoc = demo();
    const gv = demo();
    await hoc.signIn('colan', '123456');
    const packed = await hoc.exportSession();
    expect(packed).toBeTruthy();
    expect(await hoc.getCurrentUser()).toBeNull();
    const me = await gv.importSession(packed!);
    expect(me?.username).toBe('colan');
    expect((await gv.getCurrentUser())?.role).toBe('teacher');
  });

  it('chưa đăng nhập thì không có gì để chuyển; phiên lạ bị từ chối', async () => {
    const ds = demo();
    expect(await ds.exportSession()).toBeNull();
    expect(await ds.importSession(packSession({ d: 'khong-co' }))).toBeNull();
    expect(await ds.importSession('rac')).toBeNull();
    expect(await ds.getCurrentUser()).toBeNull();
  });
});

describe('đăng nhập chung — Supabase (client giả)', () => {
  it('chuyển đi: đóng gói access + refresh, dừng tự làm mới, xóa phiên trong localStorage, KHÔNG gọi signOut', async () => {
    const { SupabaseDataSource } = await import('../supabase/SupabaseDataSource');
    const mem = new Map<string, string>([['sb-abc-auth-token', '{}'], ['khac', '1']]);
    const ls = { get length() { return mem.size; }, key: (i: number) => [...mem.keys()][i] ?? null, removeItem: (k: string) => void mem.delete(k), getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    const calls: string[] = [];
    const fake = {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'AT', refresh_token: 'RT', user: { id: 'u1' } } } }),
        stopAutoRefresh: async () => void calls.push('stop'),
        signOut: async () => void calls.push('signOut'),
        setSession: async (t: { access_token: string; refresh_token: string }) => { calls.push(`set:${t.access_token}:${t.refresh_token}`); return { error: null }; },
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ds = new SupabaseDataSource(fake as any);
    const packed = await ds.exportSession();
    expect(unpackSession(packed!)).toMatchObject({ a: 'AT', r: 'RT' });
    expect(calls).toEqual(['stop']);
    expect([...mem.keys()]).toEqual(['khac']);
    await ds.importSession(packed!);
    expect(calls).toContain('set:AT:RT');
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
