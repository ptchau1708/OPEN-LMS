import { describe, expect, it } from 'vitest';
import type { Lesson, LiveState } from '@openedu/contracts';
import { applyLiveCommand, createInitialLiveState, mergeIncomingState } from '../live/reducer';

const T0 = new Date('2026-11-06T08:00:00.000Z');
const lesson = { id: 'l1', title: 'Bài thử', slides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as unknown as Lesson;

function base(): LiveState {
  const s = createInitialLiveState({
    sessionId: 's1',
    pin: '123456',
    lesson,
    teams: [
      { id: 'tA', name: 'Tổ A', color: '#f00', stars: 0 },
      { id: 'tB', name: 'Tổ B', color: '#00f', stars: 2 },
    ],
    now: T0,
  });
  return { ...s, participants: [{ userId: 'u1', name: 'An', mascot: 'nghe', color: '#111', teamId: 'tA' }, { userId: 'u2', name: 'Bình', mascot: 'shiba', color: '#222' }] };
}

describe('applyLiveCommand', () => {
  it('khởi tạo ở phòng chờ', () => {
    const s = base();
    expect(s.phase).toBe('lobby');
    expect(s.slideIndex).toBe(0);
    expect(s.locked).toBe(false);
    expect(s.studentStars).toEqual({});
  });

  it('go: đổi slide, về phase slide, xóa hoạt động/đồng hồ, chặn trong khoảng slide', () => {
    const opened = applyLiveCommand(base(), { type: 'open', itemId: 'it1', seconds: 30 }, T0);
    const s = applyLiveCommand(opened, { type: 'go', slideIndex: 2 }, T0);
    expect(s.slideIndex).toBe(2);
    expect(s.phase).toBe('slide');
    expect(s.activeItemId).toBeUndefined();
    expect(s.timerEndsAt).toBeUndefined();
    expect(applyLiveCommand(base(), { type: 'go', slideIndex: 99 }, T0).slideIndex).toBe(2);
    expect(applyLiveCommand(base(), { type: 'go', slideIndex: -3 }, T0).slideIndex).toBe(0);
  });

  it('open có giây → timerEndsAt; không giây → không đồng hồ; mở khóa màn hình', () => {
    const locked = applyLiveCommand(base(), { type: 'lock', locked: true }, T0);
    const s = applyLiveCommand(locked, { type: 'open', itemId: 'it1', seconds: 45 }, T0);
    expect(s.phase).toBe('activity-open');
    expect(s.activeItemId).toBe('it1');
    expect(s.timerEndsAt).toBe(new Date(T0.getTime() + 45_000).toISOString());
    expect(s.locked).toBe(false);
    const s2 = applyLiveCommand(base(), { type: 'open', itemId: 'it2' }, T0);
    expect(s2.timerEndsAt).toBeUndefined();
  });

  it('close và reveal giữ hoạt động, bỏ đồng hồ', () => {
    const o = applyLiveCommand(base(), { type: 'open', itemId: 'it1', seconds: 10 }, T0);
    const c = applyLiveCommand(o, { type: 'close' }, T0);
    expect(c.phase).toBe('activity-closed');
    expect(c.activeItemId).toBe('it1');
    expect(c.timerEndsAt).toBeUndefined();
    const r = applyLiveCommand(c, { type: 'reveal' }, T0);
    expect(r.phase).toBe('reveal');
    expect(r.activeItemId).toBe('it1');
  });

  it('lock bật/tắt', () => {
    const s = applyLiveCommand(base(), { type: 'lock', locked: true }, T0);
    expect(s.locked).toBe(true);
    expect(applyLiveCommand(s, { type: 'lock', locked: false }, T0).locked).toBe(false);
  });

  it('award cho tổ và cho HS, không âm', () => {
    let s = applyLiveCommand(base(), { type: 'award', target: { kind: 'team', id: 'tB' }, stars: 3 }, T0);
    expect(s.teams.find((t) => t.id === 'tB')?.stars).toBe(5);
    expect(s.teams.find((t) => t.id === 'tA')?.stars).toBe(0);
    s = applyLiveCommand(s, { type: 'award', target: { kind: 'student', id: 'u1' }, stars: 2 }, T0);
    s = applyLiveCommand(s, { type: 'award', target: { kind: 'student', id: 'u1' }, stars: 1 }, T0);
    expect(s.studentStars).toEqual({ u1: 3 });
    s = applyLiveCommand(s, { type: 'award', target: { kind: 'team', id: 'tA' }, stars: -4 }, T0);
    expect(s.teams.find((t) => t.id === 'tA')?.stars).toBe(0);
  });

  it('set-teams thay tổ và bỏ teamId không còn tồn tại', () => {
    const s = applyLiveCommand(base(), { type: 'set-teams', teams: [{ id: 'tX', name: 'Tổ X', color: '#0f0', stars: 0 }] }, T0);
    expect(s.teams.map((t) => t.id)).toEqual(['tX']);
    expect(s.participants.find((p) => p.userId === 'u1')?.teamId).toBeUndefined();
  });

  it('assign-team chỉ nhận tổ có thật', () => {
    const s = applyLiveCommand(base(), { type: 'assign-team', userId: 'u2', teamId: 'tB' }, T0);
    expect(s.participants.find((p) => p.userId === 'u2')?.teamId).toBe('tB');
    const same = base();
    expect(applyLiveCommand(same, { type: 'assign-team', userId: 'u2', teamId: 'khong-co' }, T0)).toBe(same);
  });

  it('end: kết thúc, mở khóa', () => {
    const l = applyLiveCommand(base(), { type: 'lock', locked: true }, T0);
    const e = applyLiveCommand(l, { type: 'end' }, T0);
    expect(e.phase).toBe('ended');
    expect(e.locked).toBe(false);
  });

  it('thuần: không sửa đầu vào; updatedAt tăng ngặt kể cả cùng mili giây', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    const a = applyLiveCommand(s, { type: 'go', slideIndex: 1 }, T0);
    const b = applyLiveCommand(a, { type: 'go', slideIndex: 2 }, T0);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(Date.parse(a.updatedAt)).toBeGreaterThan(Date.parse(s.updatedAt));
    expect(Date.parse(b.updatedAt)).toBeGreaterThan(Date.parse(a.updatedAt));
    expect(a.lesson).toBe(s.lesson);
  });

  it('mergeIncomingState giữ lesson/items khi tin rút gọn', () => {
    const s = base();
    const { lesson: _l, items: _i, ...slim } = applyLiveCommand(s, { type: 'go', slideIndex: 1 }, T0);
    const merged = mergeIncomingState(s, slim as LiveState);
    expect(merged.lesson).toBe(s.lesson);
    expect(merged.slideIndex).toBe(1);
  });
});
