import { describe, expect, it } from 'vitest';
import type { LearningEvent, SkillMastery } from '@openedu/contracts';
import {
  computeMastery,
  evaluateRemediation,
  findGaps,
  planRemediation,
  recencyWeightedP,
  remediationSetId,
  type ItemLike,
} from '../mastery';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';

const T0 = new Date('2026-11-01T09:00:00Z').getTime();
const DAY = 86_400_000;
let n = 0;
function ans(skill: string | string[], correct: boolean, dayOffset: number, extra: Partial<NonNullable<LearningEvent['result']>> = {}): LearningEvent {
  return {
    id: `e${++n}`,
    userId: 'u',
    verb: 'answered',
    objectType: 'item',
    objectId: `it-${n}`,
    result: { correct, score: correct ? 1 : 0, skills: Array.isArray(skill) ? skill : [skill], misconceptions: [], ...extra },
    at: new Date(T0 + dayOffset * DAY + n * 60_000).toISOString(),
  };
}
function rem(skill: string, passed: boolean, dayOffset: number, stage = 0): LearningEvent {
  return { id: `e${++n}`, userId: 'u', verb: 'completed', objectType: 'remediation', objectId: remediationSetId('u', skill, stage), result: { correct: passed, skills: [skill] }, at: new Date(T0 + dayOffset * DAY + n * 60_000).toISOString() };
}
const m = (events: LearningEvent[], code: string): SkillMastery | undefined => computeMastery('u', events).find((x) => x.skillCode === code);

describe('mức thành thạo', () => {
  it('chưa làm → không có bản ghi (chua-hoc); < 3 lần → dang-hoc', () => {
    expect(m([], 'T4.PS.RUT-GON')).toBeUndefined();
    expect(m([ans('T4.PS.RUT-GON', false, 0), ans('T4.PS.RUT-GON', false, 0)], 'T4.PS.RUT-GON')?.level).toBe('dang-hoc');
  });

  it('p < 0.6 → can-on; vung cần p ≥ 0.85, 3 câu đúng liền, ≥ 2 ngày', () => {
    const S = 'T4.PS.RUT-GON';
    expect(m([ans(S, false, 0), ans(S, true, 0), ans(S, false, 0)], S)?.level).toBe('can-on');
    const oneDay = [ans(S, true, 0), ans(S, true, 0), ans(S, true, 0), ans(S, true, 0)];
    expect(m(oneDay, S)?.level).toBe('dang-hoc'); // chỉ 1 ngày
    const twoDays = [ans(S, true, 0), ans(S, true, 0), ans(S, true, 1), ans(S, true, 1)];
    const v = m(twoDays, S)!;
    expect([v.level, v.p, v.correctStreak, v.distinctDays]).toEqual(['vung', 1, 4, 2]);
    expect(m([...twoDays, ans(S, false, 2)], S)?.level).toBe('dang-hoc'); // mất chuỗi đúng
  });

  it('trọng số độ mới: câu gần đây nặng hơn (bán rã 10 ngày)', () => {
    const t = (d: number) => T0 + d * DAY;
    expect(recencyWeightedP([{ t: t(0), score: 0 }, { t: t(10), score: 1 }])).toBeCloseTo(2 / 3, 5);
    expect(recencyWeightedP([{ t: t(0), score: 1 }, { t: t(10), score: 0 }])).toBeCloseTo(1 / 3, 5);
  });

  it('đếm quan niệm sai và lưu tối đa 3 lần sai gần nhất', () => {
    const S = 'T4.PSPT.CONG-TRU';
    const r = m([1, 2, 3, 4].map((i) => ans(S, false, i, { misconceptions: ['CONG-TU-CONG-MAU'] })), S)!;
    expect(r.misconceptions).toEqual({ 'CONG-TU-CONG-MAU': 4 });
    expect(r.recentWrong.length).toBe(3);
    expect(r.recentWrong[0].misconception).toBe('CONG-TU-CONG-MAU');
  });
});

describe('gốc lỗ hổng', () => {
  const weakQuyDong = [0, 1, 2].map((d) => ans('T4.PS.QUY-DONG', false, d));
  const weakCong = [0, 1, 2, 3].map((d) => ans('T4.PSPT.CONG-TRU', false, d, { misconceptions: ['CONG-TU-CONG-MAU'] }));
  const goodTinhChat = [0, 1, 2].map((d) => ans('T4.PS.TINH-CHAT', true, d));

  it('kĩ năng nền yếu trở thành gốc (cộng phân số ← quy đồng)', () => {
    const gaps = findGaps(computeMastery('u', [...weakQuyDong, ...weakCong, ...goodTinhChat]));
    const g = gaps.find((x) => x.skillCode === 'T4.PSPT.CONG-TRU')!;
    expect(g.rootSkill).toBe('T4.PS.QUY-DONG');
    expect(g.rootChain).toEqual(['T4.PSPT.CONG-TRU', 'T4.PS.QUY-DONG']);
    expect(g.topMisconceptions[0].code).toBe('CONG-TU-CONG-MAU');
    expect(g.evidence.length).toBeGreaterThan(0);
  });

  it('lần sâu hơn khi kĩ năng nền của gốc cũng yếu', () => {
    const weakTinhChat = [0, 1, 2].map((d) => ans('T4.PS.TINH-CHAT', false, d));
    const g = findGaps(computeMastery('u', [...weakQuyDong, ...weakCong, ...weakTinhChat])).find((x) => x.skillCode === 'T4.PSPT.CONG-TRU')!;
    expect(g.rootChain).toEqual(['T4.PSPT.CONG-TRU', 'T4.PS.QUY-DONG', 'T4.PS.TINH-CHAT']);
  });

  it('kĩ năng nền vững → gốc là chính nó; kĩ năng nền ít bằng chứng (< 3 lần) không bị coi là gốc', () => {
    const goodQuyDong = [0, 1, 2].map((d) => ans('T4.PS.QUY-DONG', true, d));
    expect(findGaps(computeMastery('u', [...goodQuyDong, ...weakCong]))[0].rootSkill).toBe('T4.PSPT.CONG-TRU');
    expect(findGaps(computeMastery('u', [ans('T4.PS.QUY-DONG', false, 0), ...weakCong]))[0].rootSkill).toBe('T4.PSPT.CONG-TRU');
  });

  it('không thấy nền yếu → dùng rootSkill của quan niệm sai nếu kĩ năng đó yếu', () => {
    const weakCauTao = [0, 1, 2].map((d) => ans('T5.STP.CAU-TAO', d === 0, d));
    const weakSoSanh = [0, 1, 2, 3].map((d) => ans('T5.STP.SO-SANH', false, d, { misconceptions: ['SO-SANH-STP-THEO-DO-DAI'] }));
    // CAU-TAO là prereq trực tiếp nên đi theo prereqs; kiểm tra thêm nhánh quan niệm sai với kĩ năng không phải prereq:
    expect(findGaps(computeMastery('u', [...weakCauTao, ...weakSoSanh]))[0].rootSkill).toBe('T5.STP.CAU-TAO');
    const weakDoiDonVi = [0, 1, 2].map((d) => ans('T4.DL.YEN-TA-TAN', false, d));
    const weakStp = [0, 1, 2].map((d) => ans('T5.STP.SO-DO', false, d, { misconceptions: ['DOI-DON-VI-SAI-HE-SO'] }));
    const g = findGaps(computeMastery('u', [...weakDoiDonVi, ...weakStp])).find((x) => x.skillCode === 'T5.STP.SO-DO')!;
    expect(g.rootSkill).toBe('T4.DL.YEN-TA-TAN');
  });
});

describe('ôn tập ngắt quãng', () => {
  const S = 'T4.PS.RUT-GON';
  const gap = [0, 0, 1].map((d) => ans(S, false, d));

  it('đạt ≥ 80%: 4/5 đạt, 3/5 chưa; 3/4 đạt; 2/3 đạt', () => {
    const r = (k: number, total: number) => evaluateRemediation(Array.from({ length: total }, (_, i) => ({ itemId: `i${i}`, correct: i < k }))).passed;
    expect([r(4, 5), r(3, 5), r(3, 4), r(2, 3), r(0, 0)]).toEqual([true, false, true, true, false]);
  });

  it('đạt bộ ôn: chặng 1 (+1 ngày) → 2 (+3) → 3 (+7); vững chỉ sau chặng 3', () => {
    const ev = [...gap, ans(S, true, 2), ans(S, true, 2), ans(S, true, 2), rem(S, true, 2)];
    const s1 = m(ev, S)!;
    expect([s1.level, s1.reviewStage]).toEqual(['dang-hoc', 1]);
    expect(new Date(s1.nextReviewAt!).getTime() - new Date(ev[ev.length - 1].at).getTime()).toBe(1 * DAY);
    ev.push(ans(S, true, 3), ans(S, true, 3), rem(S, true, 3, 1));
    const s2 = m(ev, S)!;
    expect([s2.level, s2.reviewStage]).toEqual(['dang-hoc', 2]);
    expect(new Date(s2.nextReviewAt!).getTime() - new Date(ev[ev.length - 1].at).getTime()).toBe(3 * DAY);
    for (let i = 0; i < 6; i++) ev.push(ans(S, true, 6));
    expect(m(ev, S)!.level).toBe('dang-hoc'); // p cao nhưng chưa tới chặng 3
    ev.push(rem(S, true, 6, 2));
    const s3 = m(ev, S)!;
    expect(s3.reviewStage).toBe(3);
    expect(new Date(s3.nextReviewAt!).getTime() - new Date(ev[ev.length - 1].at).getTime()).toBe(7 * DAY);
    for (let i = 0; i < 10; i++) ev.push(ans(S, true, 7));
    expect(m(ev, S)!.level).toBe('vung');
    ev.push(rem(S, true, 13, 3));
    expect(m(ev, S)!.nextReviewAt).toBeUndefined(); // xong lịch ôn
  });

  it('trượt lần ôn → về can-on (chặng 0) tới khi đạt một bộ; sai 3 câu liền khi đang ôn → tái phát', () => {
    const ev = [...gap, rem(S, true, 2), ...[0, 1, 2, 3, 4].map(() => ans(S, true, 3))];
    expect(m(ev, S)!.level).toBe('dang-hoc');
    const failed = [...ev, rem(S, false, 4, 1)];
    expect([m(failed, S)!.level, m(failed, S)!.reviewStage, m(failed, S)!.nextReviewAt]).toEqual(['can-on', 0, undefined]);
    expect(m([...failed, rem(S, true, 5)], S)!.reviewStage).toBe(1);
    const relapse = [...ev, ans(S, false, 4), ans(S, false, 4), ans(S, false, 4)];
    expect([m(relapse, S)!.level, m(relapse, S)!.reviewStage]).toEqual(['can-on', 0]);
  });

  it('planRemediation: ôn lại đến hạn trước, rồi lỗ hổng; 3–5 câu, câu gốc trước', () => {
    const items: ItemLike[] = [
      { id: 'q1', type: 'MCQ', difficulty: 'ket-noi', skills: ['T4.PS.QUY-DONG'] },
      { id: 'q2', type: 'MCQ', difficulty: 'nhan-biet', skills: ['T4.PS.QUY-DONG'] },
      { id: 'c1', type: 'MCQ', difficulty: 'nhan-biet', skills: ['T4.PSPT.CONG-TRU'] },
      { id: 'c2', type: 'SHORT_ANSWER', difficulty: 'van-dung', skills: ['T4.PSPT.CONG-TRU'] },
      { id: 'c3', type: 'MCQ', skills: ['T4.PSPT.CONG-TRU'] },
      { id: 'c4', type: 'POLL', skills: ['T4.PSPT.CONG-TRU'] },
      { id: 'r1', type: 'MCQ', skills: [S] },
      { id: 'r2', type: 'MCQ', skills: [S] },
      { id: 't1', type: 'MCQ', skills: ['T4.PS.TINH-CHAT'] },
    ];
    const ev = [
      ...[0, 1, 2].map((d) => ans('T4.PS.QUY-DONG', false, d)),
      ...[0, 1, 2, 3].map((d) => ans('T4.PSPT.CONG-TRU', false, d)),
      ...gap,
      rem(S, true, 2),
    ];
    const sets = planRemediation({ userId: 'u', masteries: computeMastery('u', ev), items, now: new Date(T0 + 5 * DAY) });
    expect(sets[0].kind).toBe('review');
    expect(sets[0].skillCode).toBe(S);
    expect(sets[0].itemIds.length).toBeGreaterThanOrEqual(3); // 2 câu rút gọn + câu kĩ năng nền (tính chất)
    const g = sets.find((s) => s.kind === 'remediation')!;
    expect(g.rootSkill).toBe('T4.PS.QUY-DONG');
    expect(g.itemIds.slice(0, 2)).toEqual(['q2', 'q1']); // gốc trước, dễ trước
    expect(g.itemIds).not.toContain('c4'); // POLL không chấm
    expect(g.itemIds.length).toBeLessThanOrEqual(5);
    expect(sets.filter((s) => s.kind === 'remediation').length).toBe(1); // mỗi gốc một bộ
  });
});

describe('demo lớp 4A', () => {
  const NOW = new Date('2026-11-11T10:00:00');
  const ds = () => new DemoDataSource({ storage: new MemoryStorage(), now: () => NOW, relayUrl: 'ws://127.0.0.1:1' });

  it('hồ sơ khác nhau rõ rệt; nhóm chung gốc; bản đồ nhiệt; nhiệm vụ ôn tập', async () => {
    const d = ds();
    const lan = await d.getStudentProfile('u-lan4a2');
    expect(lan.gaps.some((g) => g.skillCode === 'T4.PSPT.CONG-TRU' && g.rootSkill === 'T4.PS.QUY-DONG')).toBe(true);
    expect(lan.class?.name).toBe('4A');
    expect(lan.behavior && lan.attendance && lan.tt27).toBeTruthy();
    const khoa = await d.getStudentProfile('u-khoa4a3');
    expect(khoa.gaps[0].topMisconceptions[0].code).toBe('QUEN-NHO');
    const mai = await d.getStudentProfile('u-mai4a4');
    expect(mai.gaps.some((g) => g.skillCode === 'T5.STP.SO-SANH' && g.topMisconceptions[0]?.code === 'SO-SANH-STP-THEO-DO-DAI')).toBe(true);
    const hai = await d.getStudentProfile('u-hai4a1');
    expect(hai.gaps).toEqual([]);
    expect(hai.strengths.length).toBeGreaterThanOrEqual(3);

    const groups = await d.getGapGroups('c-4a');
    const qd = groups.find((g) => g.rootSkill === 'T4.PS.QUY-DONG')!;
    expect(qd.students.map((s) => s.id).sort()).toEqual(['u-lan4a2', 'u-vy4a6']);
    expect(groups.find((g) => g.rootSkill === 'T4.PT.CONG-TRU')?.students.map((s) => s.id).sort()).toEqual(['u-khoa4a3', 'u-thao4a8']);

    const hm = await d.getClassHeatmap('c-4a');
    expect(hm.students.length).toBe(8);
    expect(hm.skills.some((s) => s.code === 'T4.PS.QUY-DONG')).toBe(true);
    expect(hm.cells['u-lan4a2']['T4.PS.QUY-DONG'].level).toBe('can-on');
    expect(hm.skillSummary['T4.PS.QUY-DONG'].counts['can-on']).toBeGreaterThanOrEqual(2);

    const tasks = await d.getTodayTasks('u-tuan4a5');
    const rem = tasks.filter((t) => t.kind === 'practice');
    expect(rem.length).toBeGreaterThan(0);
    expect(rem[0].subtitle).toMatch(/^Ôn \d câu · \d+ phút$/);
    expect(rem[0].isNew).toBe(true);

    const parent = await d.getParentSummary('u-lan4a2');
    expect(parent.sentences.join(' ')).toMatch(/quy đồng mẫu số/);
    expect(parent.gaps[0].suggestions.length).toBeGreaterThanOrEqual(1);
    expect((await d.listChildren('u-phuhuynh4a')).map((c) => c.id)).toEqual(['u-lan4a2']);

    // In kết quả 3 HS cho báo cáo
    for (const id of ['u-lan4a2', 'u-khoa4a3', 'u-mai4a4']) {
      const p = await d.getStudentProfile(id);
      console.info(
        `${p.student.name}: ` +
          JSON.stringify(p.mastery.counts) +
          ' | gaps: ' +
          p.gaps.map((g) => `${g.skillCode} (p=${g.p}, ${g.attempts} câu) ← gốc ${g.rootSkill} [${g.topMisconceptions.map((x) => `${x.code}×${x.count}`).join(', ')}]`).join('; ') +
          ' | sets: ' +
          p.remediation.map((s) => `${s.title} [${s.itemIds.length} câu]`).join('; '),
      );
    }
  });

  it('submitRemediationResult: đạt → lên chặng, hẹn +1 ngày; nhiệm vụ biến mất', async () => {
    const d = ds();
    const sets = await d.getRemediationSets('u-khoa4a3');
    const set = sets.find((s) => s.kind === 'remediation')!;
    expect(set.skillCode).toBe('T4.PT.CONG-TRU');
    const before = (await d.getTodayTasks('u-khoa4a3')).filter((t) => t.targetId === set.id).length;
    expect(before).toBe(1);
    const out = await d.submitRemediationResult('u-khoa4a3', set.id, set.itemIds.map((itemId) => ({ itemId, correct: true })));
    expect(out.passed).toBe(true);
    expect(out.mastery.reviewStage).toBe(1);
    expect(new Date(out.mastery.nextReviewAt!).getTime() - NOW.getTime()).toBe(DAY);
    expect(out.message).toMatch(/Giỏi lắm/);
    expect((await d.getTodayTasks('u-khoa4a3')).some((t) => t.targetId === set.id)).toBe(false);
    await expect(d.submitRemediationResult('u-hai4a1', set.id, [])).rejects.toThrow();
  });
});
