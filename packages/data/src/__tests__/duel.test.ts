import { describe, expect, it } from 'vitest';
import { DUEL_DAILY_REWARDED, DUEL_FORFEIT_MS, type DuelInfo, type Item, type SkillMastery } from '@openedu/contracts';
import {
  DUEL_COUNTDOWN_MS,
  DUEL_GRACE_MS,
  DUEL_LIMIT_MS,
  DUEL_REVEAL_MS,
  DuelMatch,
  attachBot,
  botPlan,
  botProfileFor,
  createMatchState,
  decideWinner,
  duelPoints,
  duelReducer,
  duelStars,
  loopbackPair,
  pickDuelItems,
  seededShuffle,
  statsFromEvents,
  type DuelClock,
} from '../duel';

class FakeClock implements DuelClock {
  t = 1_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void; every?: number }>();
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => { const id = ++this.seq; this.timers.set(id, { at: this.t + ms, fn }); return id; };
  setInterval = (fn: () => void, ms: number) => { const id = ++this.seq; this.timers.set(id, { at: this.t + ms, fn, every: ms }); return id; };
  clearTimeout = (id: unknown) => { this.timers.delete(id as number); };
  clearInterval = (id: unknown) => { this.timers.delete(id as number); };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void; every?: number }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      const [id, tm] = next;
      this.t = tm.at;
      if (tm.every) tm.at += tm.every; else this.timers.delete(id);
      tm.fn();
    }
    this.t = end;
  }
}

const mk = (id: string, skills: string[] = []): Item => ({ id, type: 'MCQ', grade: 2, subject: 'toan', prompt: { text: id }, payload: { options: [] }, key: { correct: 'a' }, skills } as unknown as Item);

function duelOf(players: DuelInfo['players'], extra: Partial<DuelInfo> = {}): DuelInfo {
  return { id: 'd1', code: '1234', mode: 'queue', subject: 'toan', grade: 2, players, itemIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], seed: 42, status: 'playing', createdAt: '', ...extra };
}
const A = { userId: 'a', name: 'An', mascot: 'nghe' as const, color: '#2f7bf6' };
const B = { userId: 'b', name: 'Bình', mascot: 'shiba' as const, color: '#ff8a3d' };

describe('điểm & thắng thua', () => {
  it('đúng + thưởng tốc độ, sai = 0', () => {
    expect(duelPoints(true, 0)).toBe(150);
    expect(duelPoints(true, DUEL_LIMIT_MS)).toBe(100);
    expect(duelPoints(true, 10_000)).toBe(125);
    expect(duelPoints(false, 100)).toBe(0);
    expect(duelPoints(true, 99_999)).toBe(100);
  });
  it('bằng điểm → nhiều câu đúng hơn; vẫn bằng → hoà; bỏ cuộc → thua', () => {
    const r = (q: number, correct: boolean, points: number) => ({ q, correct, points, ms: 0 });
    expect(decideWinner('a', 'b', { a: [r(0, true, 120)], b: [r(0, true, 110)] })).toBe('a');
    expect(decideWinner('a', 'b', { a: [r(0, true, 100)], b: [r(0, true, 100)] })).toBeNull();
    expect(decideWinner('a', 'b', { a: [r(0, true, 300)], b: [] }, 'a')).toBe('b');
  });
  it('sao: tham gia 1, thắng +2, giới hạn ngày, bỏ cuộc 0', () => {
    expect(duelStars('win', 0)).toEqual({ stars: 3, capped: false });
    expect(duelStars('lose', 2)).toEqual({ stars: 1, capped: false });
    expect(duelStars('win', DUEL_DAILY_REWARDED)).toEqual({ stars: 0, capped: true });
    expect(duelStars('win', 0, true).stars).toBe(0);
  });
  it('thống kê từ sự kiện', () => {
    const ev = (o: string) => ({ verb: 'completed', objectType: 'arena', objectId: `duel:${o}${Math.random()}`, result: { response: { outcome: o } } });
    const s = statsFromEvents('a', [ev('win'), ev('win'), ev('lose'), ev('draw'), { verb: 'answered', objectType: 'arena', objectId: 'x' }]);
    expect(s).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1, winRate: 0.5 });
  });
});

describe('chọn câu & bạn Robo', () => {
  const pool = Array.from({ length: 20 }, (_, i) => mk(`i${String(i).padStart(2, '0')}`, i < 5 ? ['T2-X'] : ['T2-Y']));
  const mastery = [{ skillCode: 'T2-X', level: 'dang-hoc', p: 0.4 } as SkillMastery];
  it('cùng hạt giống → cùng thứ tự; ưu tiên kĩ năng đang học', () => {
    const a = pickDuelItems(pool, { seed: 7, mastery });
    const b = pickDuelItems(pool.slice().reverse(), { seed: 7, mastery });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a).toHaveLength(7);
    expect(a.filter((i) => i.skills?.[0] === 'T2-X').length).toBe(5);
    expect(pickDuelItems(pool, { seed: 8, mastery }).map((i) => i.id)).not.toEqual(a.map((i) => i.id));
  });
  it('shuffle tất định', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 3)).toEqual(seededShuffle([1, 2, 3, 4, 5], 3));
  });
  it('Robo theo mức thành thạo: giỏi hơn → Robo mạnh hơn, trong giới hạn', () => {
    const weak = botProfileFor([{ skillCode: 'x', level: 'dang-hoc', p: 0.1 } as SkillMastery]);
    const strong = botProfileFor([{ skillCode: 'x', level: 'vung', p: 0.95 } as SkillMastery]);
    expect(weak.accuracy).toBeGreaterThanOrEqual(0.45);
    expect(strong.accuracy).toBeLessThanOrEqual(0.85);
    expect(strong.accuracy).toBeGreaterThan(weak.accuracy);
    expect(strong.meanMs).toBeLessThan(weak.meanMs);
    const plan = botPlan(strong, 1, 200);
    expect(botPlan(strong, 1, 200)).toEqual(plan);
    const acc = plan.filter((s) => s.correct).length / plan.length;
    expect(Math.abs(acc - strong.accuracy)).toBeLessThan(0.12);
    expect(plan.every((s) => s.ms >= 2500 && s.ms <= 18_000)).toBe(true);
  });
});

describe('máy trạng thái', () => {
  const t0 = 0;
  const start = () => duelReducer(createMatchState({ me: 'a', opp: 'b', isHost: true, at: t0, total: 2 }), { type: 'seen', at: t0 });
  it('đếm ngược → câu hỏi → mở đáp án khi cả hai trả lời → câu sau → kết thúc', () => {
    let s = start();
    expect(s.phase).toBe('countdown');
    s = duelReducer(s, { type: 'tick', at: DUEL_COUNTDOWN_MS });
    expect(s).toMatchObject({ phase: 'question', q: 0 });
    s = duelReducer(s, { type: 'answer', userId: 'a', report: { q: 0, correct: true, points: 140, ms: 2000 }, at: 5000 });
    expect(s.phase).toBe('question');
    s = duelReducer(s, { type: 'answer', userId: 'b', report: { q: 0, correct: false, points: 0, ms: 3000 }, at: 6000 });
    expect(s.phase).toBe('reveal');
    s = duelReducer(s, { type: 'tick', at: 6000 + DUEL_REVEAL_MS });
    expect(s).toMatchObject({ phase: 'question', q: 1 });
    s = duelReducer(s, { type: 'seen', at: 9000 });
    s = duelReducer(s, { type: 'tick', at: 9000 + DUEL_LIMIT_MS });
    expect(s.answers.a[1]?.timedOut).toBe(true);
    expect(s.phase).toBe('question');
    s = duelReducer(s, { type: 'seen', at: 30_000 });
    s = duelReducer(s, { type: 'tick', at: 9000 + DUEL_LIMIT_MS + DUEL_GRACE_MS });
    expect(s.answers.b[1]?.timedOut).toBe(true);
    expect(s.phase).toBe('reveal');
    s = duelReducer(s, { type: 'tick', at: 9000 + DUEL_LIMIT_MS + DUEL_GRACE_MS + DUEL_REVEAL_MS });
    expect(s.phase).toBe('finished');
    expect(s.forfeitBy).toBeUndefined();
  });
  it('đang chấm thì chưa tính hết giờ; câu thật thay ô hết giờ', () => {
    let s = duelReducer(start(), { type: 'tick', at: DUEL_COUNTDOWN_MS });
    s = duelReducer(s, { type: 'pending', q: 0 });
    s = duelReducer(s, { type: 'seen', at: DUEL_LIMIT_MS });
    s = duelReducer(s, { type: 'tick', at: DUEL_COUNTDOWN_MS + DUEL_LIMIT_MS + 100 });
    expect(s.answers.a[0]).toBeUndefined();
    s = duelReducer(s, { type: 'answer', userId: 'a', report: { q: 0, correct: true, points: 101, ms: 19_900 }, at: DUEL_COUNTDOWN_MS + DUEL_LIMIT_MS + 500 });
    expect(s.answers.a[0]?.points).toBe(101);
    s = duelReducer(s, { type: 'answer', userId: 'a', report: { q: 0, correct: false, points: 0, ms: 1 }, at: 1 });
    expect(s.answers.a[0]?.points).toBe(101);
  });
  it('bạn im lặng 20 giây → thắng do bạn rời trận; rời hẳn → kết thúc ngay', () => {
    let s = duelReducer(start(), { type: 'tick', at: DUEL_FORFEIT_MS + 1 });
    expect(s).toMatchObject({ phase: 'finished', forfeitBy: 'b' });
    s = duelReducer(start(), { type: 'leave', from: 'b', at: 10 });
    expect(s).toMatchObject({ phase: 'finished', forfeitBy: 'b' });
  });
  it('máy khách theo nhịp chủ phòng', () => {
    let s = duelReducer(createMatchState({ me: 'b', opp: 'a', isHost: false, at: 0, total: 3 }), { type: 'seen', at: 0 });
    s = duelReducer(s, { type: 'round', q: 2, at: 100 });
    expect(s).toMatchObject({ phase: 'question', q: 2 });
    s = duelReducer(s, { type: 'round', q: 1, at: 200 });
    expect(s.q).toBe(2);
  });
});

describe('trận đấu qua kênh', () => {
  it('em đấu với bạn Robo tới hết, hai bên khớp điểm', () => {
    const clock = new FakeClock();
    const robo = { userId: 'bot-robo', name: 'Bạn Robo', mascot: 'panda' as const, color: '#64748b', isBot: true };
    const plan = botPlan({ accuracy: 0.7, meanMs: 6000 }, 5);
    const duel = duelOf([A, robo], { mode: 'bot', botPlan: plan });
    const [mine, bots] = loopbackPair((fn) => { clock.setTimeout(fn, 20); });
    attachBot(duel, bots, clock);
    const m = new DuelMatch(duel, 'a', mine, clock);
    m.start();
    clock.advance(500);
    expect(m.state.phase).toBe('countdown');
    for (let i = 0; i < 400 && m.state.phase !== 'finished'; i++) {
      // em trả lời câu chẵn đúng, câu lẻ để hết giờ
      const st = m.state;
      if (st.phase === 'question' && st.q % 2 === 0 && !st.answers.a[st.q]) m.answer({ q: st.q, correct: true, points: duelPoints(true, 1000), ms: 1000 });
      clock.advance(500);
    }
    clock.advance(10_000);
    expect(m.state.phase).toBe('finished');
    expect(m.state.forfeitBy).toBeUndefined();
    const roboAnswers = m.state.answers['bot-robo'];
    expect(roboAnswers.filter(Boolean)).toHaveLength(7);
    expect(roboAnswers.map((r) => r?.correct)).toEqual(plan.map((p) => p.correct));
    expect(m.state.answers.a.filter((r) => r && !r.timedOut)).toHaveLength(4);
  });

  it('hai bạn đấu nhau; bạn đóng máy giữa trận → em thắng sau 20 giây', () => {
    const clock = new FakeClock();
    const duel = duelOf([A, B]);
    const [ta, tb] = loopbackPair((fn) => { clock.setTimeout(fn, 40); });
    const ma = new DuelMatch(duel, 'a', ta, clock);
    const mb = new DuelMatch(duel, 'b', tb, clock);
    ma.start();
    mb.start();
    clock.advance(DUEL_COUNTDOWN_MS + 300);
    expect(ma.state).toMatchObject({ phase: 'question', q: 0 });
    expect(mb.state).toMatchObject({ phase: 'question', q: 0 });
    ma.answer({ q: 0, correct: true, points: 140, ms: 3000 });
    mb.answer({ q: 0, correct: true, points: 130, ms: 6000 });
    clock.advance(200);
    expect(ma.state.phase).toBe('reveal');
    expect(mb.state.answers.a[0]?.points).toBe(140);
    clock.advance(DUEL_REVEAL_MS + 200);
    expect(mb.state.q).toBe(1);
    // B mất mạng (không gửi gì nữa, không báo rời)
    (mb as unknown as { stopped: boolean }).stopped = true;
    clock.advance(DUEL_FORFEIT_MS + 1000);
    expect(ma.state).toMatchObject({ phase: 'finished', forfeitBy: 'b' });
  });
});
