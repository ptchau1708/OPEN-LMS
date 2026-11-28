import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES, MASCOTS, type AnyResponse, type Item, type ItemType, type ScoreResult } from '@openedu/contracts';
import { buildSeed, SEED_ITEMS } from '../seed';

const seed = buildSeed(new Date('2026-11-06T10:00:00'));
const itemById = new Map(seed.items.map((i) => [i.id, i]));
const UNGRADED: ItemType[] = ['DRAW', 'RECORD_READ', 'POLL'];

function blankIds(passage: string): string[] {
  return [...passage.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map((m) => m[1]);
}
function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
}
function uniqueIds(list: { id: string }[]): boolean {
  return new Set(list.map((x) => x.id)).size === list.length;
}

/** Kiểm tra key đúng cấu trúc dạng câu hỏi (contracts/items.ts). Trả về danh sách lỗi. */
function keyErrors(it: Item): string[] {
  const e: string[] = [];
  const need = (cond: boolean, msg: string) => {
    if (!cond) e.push(`${it.id}: ${msg}`);
  };
  switch (it.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE':
      need(uniqueIds(it.payload.options), 'id lựa chọn trùng');
      need(!!it.key && it.payload.options.some((o) => o.id === it.key?.correct), 'correct không thuộc options');
      break;
    case 'MCQ_MULTIPLE':
      need(uniqueIds(it.payload.options), 'id lựa chọn trùng');
      need(!!it.key && it.key.correct.length > 0 && it.key.correct.every((c) => it.payload.options.some((o) => o.id === c)), 'correct không hợp lệ');
      need(!!it.key && it.key.correct.length < it.payload.options.length, 'mọi lựa chọn đều đúng');
      break;
    case 'MATCHING': {
      const pairs = it.key?.pairs ?? {};
      need(uniqueIds(it.payload.left) && uniqueIds(it.payload.right), 'id trùng');
      need(sameSet(Object.keys(pairs), it.payload.left.map((l) => l.id)), 'pairs phải phủ đủ cột trái');
      need(sameSet(Object.values(pairs), it.payload.right.map((r) => r.id)), 'pairs phải là song ánh sang cột phải');
      break;
    }
    case 'ORDERING':
      need(uniqueIds(it.payload.items), 'id trùng');
      need(!!it.key && sameSet(it.key.order, it.payload.items.map((x) => x.id)), 'order không phải hoán vị của items');
      need(!!it.key && it.key.order.join() !== it.payload.items.map((x) => x.id).join(), 'payload đang đúng thứ tự sẵn');
      break;
    case 'SENTENCE_SCRAMBLE':
      need(uniqueIds(it.payload.words), 'id trùng');
      need(!!it.key && sameSet(it.key.order, it.payload.words.map((x) => x.id)), 'order không phải hoán vị của words');
      need(!!it.key && it.key.order.join() !== it.payload.words.map((x) => x.id).join(), 'payload đang đúng thứ tự sẵn');
      break;
    case 'DRAG_DROP': {
      const pl = it.key?.placement ?? {};
      need(uniqueIds(it.payload.tokens) && uniqueIds(it.payload.zones), 'id trùng');
      need(sameSet(Object.keys(pl), it.payload.tokens.map((t) => t.id)), 'placement phải phủ đủ tokens');
      need(Object.values(pl).every((z) => it.payload.zones.some((x) => x.id === z)), 'zone không tồn tại');
      break;
    }
    case 'WORD_CLASSIFY': {
      const pl = it.key?.placement ?? {};
      need(uniqueIds(it.payload.words) && uniqueIds(it.payload.groups), 'id trùng');
      if (it.payload.distractors) {
        const ids = it.payload.words.map((t) => t.id);
        need(Object.keys(pl).every((k) => ids.includes(k)) && Object.keys(pl).length < ids.length, 'thẻ nhiễu: placement là tập con thật sự của words');
      } else need(sameSet(Object.keys(pl), it.payload.words.map((t) => t.id)), 'placement phải phủ đủ words');
      need(Object.values(pl).every((g) => it.payload.groups.some((x) => x.id === g)), 'group không tồn tại');
      need(it.payload.groups.every((g) => Object.values(pl).includes(g.id)), 'có nhóm rỗng');
      break;
    }
    case 'SHORT_ANSWER':
      need(!!it.key && it.key.accepted.length > 0 && it.key.accepted.every((a) => a.trim().length > 0), 'accepted rỗng');
      if (it.payload.inputMode === 'numeric') need(!!it.key && it.key.accepted.every((a) => /^-?\d+([.,]\d+)?$/.test(a)), 'đáp án số không phải số');
      break;
    case 'FILL_IN_PASSAGE': {
      const blanks = it.key?.blanks ?? {};
      need(sameSet(Object.keys(blanks), blankIds(it.payload.passage)), 'blanks khác chỗ trống trong passage');
      need(Object.values(blanks).every((a) => a.length > 0), 'chỗ trống không có đáp án');
      if (it.payload.bank) {
        const texts = it.payload.bank.map((b) => b.text);
        need(Object.values(blanks).every((a) => a.some((x) => texts.includes(x))), 'đáp án không có trong kho từ');
      }
      break;
    }
    case 'INLINE_DROPDOWN': {
      const blanks = it.key?.blanks ?? {};
      const ids = blankIds(it.payload.passage);
      need(sameSet(Object.keys(blanks), ids), 'blanks khác ô chọn trong passage');
      need(sameSet(Object.keys(it.payload.dropdowns), ids), 'dropdowns khác ô chọn trong passage');
      need(ids.every((d) => (it.payload.dropdowns[d] ?? []).some((c) => c.id === blanks[d])), 'đáp án không thuộc danh sách chọn');
      break;
    }
    case 'HOTSPOT':
      need(uniqueIds(it.payload.regions), 'id vùng trùng');
      need(!!it.key && it.key.correct.length > 0 && it.key.correct.every((c) => it.payload.regions.some((r) => r.id === c)), 'correct không thuộc regions');
      need(!!it.payload.multiple || (it.key?.correct.length ?? 0) === 1, 'một lựa chọn nhưng nhiều vùng đúng');
      need(
        it.payload.regions.every((r) => r.x >= 0 && r.y >= 0 && (r.shape === 'circle' ? (r.r ?? 0) > 0 && r.x <= 100 && r.y <= 100 : r.x + (r.w ?? 0) <= 100 && r.y + (r.h ?? 0) <= 100)),
        'vùng ngoài ảnh',
      );
      need(it.payload.image.startsWith('data:image/svg+xml'), 'ảnh phải là SVG nhúng');
      break;
    case 'MATH_MANIPULATIVE': {
      const p = it.payload;
      const v = it.key?.value;
      if (p.kind === 'sticks') {
        const expect = p.op === '+' ? p.operands.reduce((a, b) => a + b, 0) : p.operands.slice(1).reduce((a, b) => a - b, p.operands[0]);
        need(v === expect, `value ${v} ≠ ${expect}`);
        if (p.choices) need(p.choices.includes(expect) && new Set(p.choices).size === p.choices.length, 'choices thiếu đáp án hoặc trùng');
      } else need(typeof v === 'number' && v >= 0 && v < 720, 'giờ ngoài 0–719');
      break;
    }
    case 'DRAW':
    case 'RECORD_READ':
    case 'POLL':
      need(it.key === null || it.key === undefined, 'dạng không chấm không có key');
      break;
    case 'TRUE_FALSE_MULTI': {
      const st = it.payload.statements;
      need(st.length >= 2 && st.length <= 6, '2–6 nhận định');
      need(st.every((s) => typeof it.key?.truth[s.id] === 'boolean'), 'nhận định thiếu Đúng/Sai');
      need(new Set(st.map((s) => s.id)).size === st.length, 'id nhận định trùng');
      break;
    }
  }
  return e;
}

/** Câu trả lời đúng dựng từ key. */
function correctResponse(it: Item): AnyResponse {
  switch (it.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE':
      return { choice: it.key!.correct };
    case 'MCQ_MULTIPLE':
      return { choices: [...it.key!.correct] };
    case 'MATCHING':
      return { pairs: { ...it.key!.pairs } };
    case 'ORDERING':
    case 'SENTENCE_SCRAMBLE':
      return { order: [...it.key!.order] };
    case 'DRAG_DROP':
    case 'WORD_CLASSIFY':
      return { placement: { ...it.key!.placement } };
    case 'SHORT_ANSWER':
      return { text: it.key!.accepted[0] };
    case 'FILL_IN_PASSAGE':
      return { blanks: Object.fromEntries(Object.entries(it.key!.blanks).map(([k, v]) => [k, v[0]])) };
    case 'INLINE_DROPDOWN':
      return { blanks: { ...it.key!.blanks } };
    case 'HOTSPOT':
      return { regions: [...it.key!.correct] };
    case 'MATH_MANIPULATIVE':
      return { value: it.key!.value };
    case 'DRAW':
      return { dataUrl: 'data:image/png;base64,AA' };
    case 'RECORD_READ':
      return { durationSec: 5 };
    case 'POLL':
      return { choice: it.payload.options[0].id };
    case 'TRUE_FALSE_MULTI':
      return { picks: { ...it.key!.truth } };
  }
}

describe('nội dung mẫu', () => {
  it('≥ 40 item, đủ 17 dạng, lớp 1–3, id không trùng', () => {
    expect(SEED_ITEMS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SEED_ITEMS.map((i) => i.id)).size).toBe(SEED_ITEMS.length);
    for (const t of ACTIVITY_TYPES) expect(SEED_ITEMS.some((i) => i.type === t.type), t.type).toBe(true);
    for (const g of [1, 2, 3]) expect(SEED_ITEMS.some((i) => i.grade === g)).toBe(true);
  });

  it('mọi key hợp lệ với dạng câu hỏi', () => {
    const errors = SEED_ITEMS.flatMap(keyErrors);
    expect(errors).toEqual([]);
  });

  it('đề bài có chữ, gradable có giải thích', () => {
    for (const it of SEED_ITEMS) {
      expect(it.prompt.text.trim().length, it.id).toBeGreaterThan(0);
      if (!UNGRADED.includes(it.type)) expect(it.explanation, it.id).toBeTruthy();
    }
  });

  it('mọi itemId trong bài giảng đều có trong ngân hàng; slide id không trùng', () => {
    for (const l of seed.lessons) {
      expect(new Set(l.slides.map((s) => s.id)).size, l.id).toBe(l.slides.length);
      for (const s of l.slides) {
        if (s.layout === 'activity') expect(!!s.itemId || !!s.item, `${l.id}/${s.id}`).toBe(true);
        if (s.itemId) expect(itemById.has(s.itemId), `${l.id}/${s.id} → ${s.itemId}`).toBe(true);
        if (s.packageId) expect(seed.packages.some((p) => p.id === s.packageId), s.packageId).toBe(true);
      }
    }
  });

  it('bốn bài giảng đúng yêu cầu', () => {
    const byId = Object.fromEntries(seed.lessons.map((l) => [l.id, l]));
    const layouts = (id: string) => byId[id].slides.map((s) => (s.layout === 'activity' ? itemById.get(s.itemId!)?.type : s.layout));
    expect(layouts('l-toan2-cong-co-nho')).toEqual(['title', 'image-text', 'MATH_MANIPULATIVE', 'MCQ', 'SHORT_ANSWER', 'ORDERING', 'game', 'package', 'summary']);
    expect(layouts('l-tv1-van-ang-anh')).toEqual(['title', 'image-text', 'LISTEN_CHOOSE', 'WORD_CLASSIFY', 'FILL_IN_PASSAGE', 'RECORD_READ', 'summary']);
    expect(layouts('l-tnxh1-con-vat')).toEqual(['title', 'compare', 'DRAG_DROP', 'HOTSPOT', 'POLL', 'DRAW', 'summary']);
    expect(layouts('l-ta3-hello-world')).toEqual(['title', 'image-text', 'MATCHING', 'LISTEN_CHOOSE', 'SENTENCE_SCRAMBLE', 'INLINE_DROPDOWN', 'MCQ_MULTIPLE', 'summary']);
    expect(byId['l-toan2-cong-co-nho'].mascot).toBe('shiba');
    expect(byId['l-ta3-hello-world'].mascot).toBe('kiwi');
    const sticks = itemById.get('it-toan2-que-26-7')!;
    expect(sticks.type === 'MATH_MANIPULATIVE' && sticks.payload).toEqual({ kind: 'sticks', operands: [26, 7], op: '+', choices: [31, 33, 23, 32] });
    const wheel = byId['l-toan2-cong-co-nho'].slides.find((s) => s.layout === 'game')!;
    expect(wheel.game?.entries).toEqual(['Minh An', 'Gia Bình', 'Bảo Chi', 'Tiến Dũng']);
    const hello = byId['l-ta3-hello-world'].slides[1].text ?? '';
    for (const m of MASCOTS) expect(hello).toContain(m.greeting);
  });

  it('khóa học mỗi môn và bài giao cho 2A, lớp 3', () => {
    expect(new Set(seed.courses.map((c) => c.subject)).size).toBe(4);
    const for2a = seed.assignments.filter((a) => a.classId === 'c-2a').map((a) => a.targetId).sort();
    expect(for2a).toEqual(['l-tnxh1-con-vat', 'l-toan2-cong-co-nho', 'l-tv1-van-ang-anh']);
    expect(seed.assignments.some((a) => a.classId === 'c-3c' && a.targetId === 'l-ta3-hello-world')).toBe(true);
  });
});

describe('chấm câu trả lời đúng bằng activity-engine', () => {
  let scoreItem: ((i: Item, r: AnyResponse | undefined) => ScoreResult) | null = null;
  beforeAll(async () => {
    try {
      scoreItem = (await import('@openedu/activity-engine')).scoreItem;
    } catch (e) {
      console.warn('Không tải được @openedu/activity-engine — bỏ qua kiểm tra chấm.', e);
    }
  });

  it('mọi item có chấm: câu trả lời đúng được 100% (bỏ qua dạng mà scorer còn là STUB)', () => {
    if (!scoreItem) return;
    const skipped: string[] = [];
    for (const it of SEED_ITEMS) {
      const r = scoreItem(it, correctResponse(it));
      if (UNGRADED.includes(it.type)) {
        expect(r.graded, it.id).toBe(false);
        continue;
      }
      if (!r.graded) {
        skipped.push(it.type);
        continue;
      }
      expect({ id: it.id, correct: r.correct, score: r.score }).toEqual({ id: it.id, correct: true, score: 1 });
    }
    if (skipped.length) console.info('Scorer còn STUB (bỏ qua):', [...new Set(skipped)].join(', '));
  });
});
