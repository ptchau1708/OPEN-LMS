import { beforeAll, describe, expect, it } from 'vitest';
import { CT2018_SKILLS, MISCONCEPTIONS, SKILLS, SKILL_BY_CODE, prereqClosure, skillsFor, subjectsForGrade, type AnyResponse, type Item, type ScoreResult } from '@openedu/contracts';
import { buildSeed, SEED_ITEMS, TOAN45_ITEMS, syntheticCorrectResponse } from '../seed';
import { detectMisconceptions, normalizeAnswer } from '../mastery';

describe('danh mục kĩ năng', () => {
  it('mọi môn của mọi lớp (CT GDPT 2018) đều có kĩ năng', () => {
    for (const g of [1, 2, 3, 4, 5] as const) for (const subj of subjectsForGrade(g)) {
      expect(skillsFor(subj, g).length, `${subj} lớp ${g}`).toBeGreaterThan(0);
    }
    expect(CT2018_SKILLS.every((s) => s.strand === 'CHU-DE' && s.provisional)).toBe(true);
    expect(skillsFor('khoa-hoc', 4).map((s) => s.topic)).toEqual(expect.arrayContaining(['Chất', 'Năng lượng', 'Nấm']));
  });

  it('mã duy nhất, đúng định dạng, kĩ năng nền tồn tại, tên ngắn ≤ 6 từ', () => {
    expect(new Set(SKILLS.map((s) => s.code)).size).toBe(SKILLS.length);
    for (const s of SKILLS) {
      expect(s.code, s.code).toMatch(/^[A-Z]+[1-5]\.[A-Z0-9-]+\.[A-Z0-9-]+$/);
      expect(s.code.startsWith(s.subject === 'toan' ? `T${s.grade}.` : '')).toBe(true);
      expect(s.text.trim().length, s.code).toBeGreaterThan(5);
      expect(s.short.trim().split(/\s+/).length, `${s.code}: ${s.short}`).toBeLessThanOrEqual(6);
      for (const p of s.prereqs) expect(SKILL_BY_CODE[p], `${s.code} → ${p}`).toBeTruthy();
      if (s.subject !== 'toan') expect(s.provisional, s.code).toBe(true);
    }
  });

  it('phủ đủ Toán lớp 1–5; kĩ năng nền không ở lớp cao hơn', () => {
    const counts = [1, 2, 3, 4, 5].map((g) => skillsFor('toan', g as 1).length);
    expect(counts[3]).toBeGreaterThanOrEqual(50);
    expect(counts[4]).toBeGreaterThanOrEqual(55);
    for (const c of counts) expect(c).toBeGreaterThan(20);
    for (const s of SKILLS) for (const p of s.prereqs) expect(SKILL_BY_CODE[p].grade, `${s.code} → ${p}`).toBeLessThanOrEqual(s.grade);
    // ví dụ bắt buộc
    expect(prereqClosure('T5.PS.CONG-KHAC-MAU')).toContain('T4.PS.QUY-DONG');
    expect(SKILL_BY_CODE['T4.PS.RUT-GON'].prereqs).toContain('T4.PS.TINH-CHAT');
    expect(prereqClosure('T4.PT.CHIA-2-CS')).toContain('T3.PT.CHIA-1-CS');
    expect(prereqClosure('T5.STPPT.CONG-TRU')).toContain('T5.STP.DOC-VIET');
  });

  it('không có chu trình kĩ năng nền', () => {
    const state: Record<string, 0 | 1 | 2> = {};
    const cycles: string[] = [];
    const visit = (c: string, path: string[]) => {
      if (state[c] === 2) return;
      if (state[c] === 1) {
        cycles.push([...path, c].join(' → '));
        return;
      }
      state[c] = 1;
      for (const p of SKILL_BY_CODE[c]?.prereqs ?? []) visit(p, [...path, c]);
      state[c] = 2;
    };
    for (const s of SKILLS) visit(s.code, []);
    expect(cycles).toEqual([]);
  });

  it('quan niệm sai trỏ tới kĩ năng có thật', () => {
    for (const m of Object.values(MISCONCEPTIONS)) {
      expect(SKILL_BY_CODE[m.skill], m.code).toBeTruthy();
      if (m.rootSkill) expect(SKILL_BY_CODE[m.rootSkill], m.code).toBeTruthy();
      expect(m.kidHint.length, m.code).toBeGreaterThan(10);
    }
  });
});

describe('gắn thẻ câu hỏi', () => {
  it('mọi câu hỏi mẫu có skills, mã có thật, môn/lớp khớp', () => {
    for (const it of SEED_ITEMS) {
      expect(it.skills?.length, it.id).toBeGreaterThan(0);
      for (const c of it.skills ?? []) {
        const s = SKILL_BY_CODE[c];
        expect(s, `${it.id} → ${c}`).toBeTruthy();
        expect(s.subject, `${it.id} → ${c}`).toBe(it.subject);
        expect(s.grade, `${it.id} → ${c}`).toBeLessThanOrEqual(it.grade);
      }
    }
  });

  it('mã quan niệm sai trong câu hỏi đều có trong danh mục', () => {
    for (const it of SEED_ITEMS) {
      const p = it.payload as { options?: { misconception?: string }[] };
      for (const o of p.options ?? []) if (o.misconception) expect(MISCONCEPTIONS[o.misconception], `${it.id}`).toBeTruthy();
      for (const c of Object.values((it.key as { misconceptions?: Record<string, string> } | null)?.misconceptions ?? {})) expect(MISCONCEPTIONS[c], `${it.id}: ${c}`).toBeTruthy();
    }
  });

  it('≥ 24 câu Toán lớp 4–5 mới, nhiều dạng, đủ chủ đề', () => {
    expect(TOAN45_ITEMS.length).toBeGreaterThanOrEqual(24);
    expect(TOAN45_ITEMS.some((i) => i.grade === 4) && TOAN45_ITEMS.some((i) => i.grade === 5)).toBe(true);
    expect(new Set(TOAN45_ITEMS.map((i) => i.type)).size).toBeGreaterThanOrEqual(5);
    const topics = new Set(TOAN45_ITEMS.flatMap((i) => i.skills ?? []).map((c) => c.split('.')[1]));
    for (const t of ['STN', 'PT', 'PS', 'PSPT', 'STP', 'STPPT', 'TSPT', 'HH', 'DL', 'TK']) expect(topics.has(t), t).toBe(true);
  });

  it('bài giảng Phân số (lớp 4) và Số thập phân (lớp 5) có 8 trang, câu hỏi có thật', () => {
    const seed = buildSeed(new Date('2026-11-11T10:00:00'));
    const ids = new Set(seed.items.map((i) => i.id));
    for (const [id, grade] of [['l-toan4-phan-so', 4], ['l-toan5-so-thap-phan', 5]] as const) {
      const l = seed.lessons.find((x) => x.id === id)!;
      expect(l.grade).toBe(grade);
      expect(l.slides.length).toBe(8);
      for (const s of l.slides) if (s.itemId) expect(ids.has(s.itemId), s.itemId).toBe(true);
    }
  });
});

describe('chấm câu mới + quan niệm sai', () => {
  let scoreItem: ((i: Item, r: AnyResponse | undefined) => ScoreResult) | null = null;
  beforeAll(async () => {
    scoreItem = (await import('@openedu/activity-engine')).scoreItem;
  });

  it('mọi câu mới: đáp án đúng được 100%', () => {
    for (const it of TOAN45_ITEMS) {
      const r = scoreItem!(it, syntheticCorrectResponse(it));
      expect({ id: it.id, correct: r.correct, score: r.score }).toEqual({ id: it.id, correct: true, score: 1 });
    }
  });

  it('mọi câu trả lời gắn quan niệm sai đều bị chấm SAI và được nhận diện đúng mã', () => {
    for (const it of TOAN45_ITEMS) {
      const table = (it.key as { misconceptions?: Record<string, string> }).misconceptions ?? {};
      const cases: [AnyResponse, string][] = [];
      if (it.type === 'MCQ') for (const o of it.payload.options) if (o.misconception) cases.push([{ choice: o.id }, o.misconception]);
      if (it.type === 'MCQ_MULTIPLE') for (const o of it.payload.options) if (o.misconception) cases.push([{ choices: [o.id] }, o.misconception]);
      if (it.type === 'SHORT_ANSWER') for (const [k, c] of Object.entries(table)) cases.push([{ text: k }, c]);
      if (it.type === 'ORDERING') for (const [k, c] of Object.entries(table)) cases.push([{ order: k.split(',') }, c]);
      if (it.type === 'DRAG_DROP')
        for (const [k, c] of Object.entries(table)) {
          const [t, z] = k.split('>');
          cases.push([{ placement: { ...it.key!.placement, [t]: z } }, c]);
        }
      for (const [resp, code] of cases) {
        expect(scoreItem!(it, resp).correct, `${it.id} ${JSON.stringify(resp)}`).toBe(false);
        expect(detectMisconceptions(it, resp), `${it.id} ${JSON.stringify(resp)}`).toContain(code);
      }
    }
  });

  it('chuẩn hoá câu trả lời ngắn', () => {
    expect(normalizeAnswer('0,50')).toBe('0.5');
    expect(normalizeAnswer(' 96 kg')).toBe('96');
    expect(normalizeAnswer('48 000')).toBe('48000');
    expect(normalizeAnswer('3 / 4')).toBe('3/4');
    expect(normalizeAnswer('60%')).toBe('60');
  });
});
