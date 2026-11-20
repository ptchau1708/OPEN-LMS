// Kiểm thử khói: render (SSR) Player ở mọi chế độ + Editor của 8 dạng do agent E2 làm.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ItemType } from '@openedu/contracts';
import * as MATCHING from '../MATCHING/index';
import * as ORDERING from '../ORDERING/index';
import * as SENTENCE_SCRAMBLE from '../SENTENCE_SCRAMBLE/index';
import * as DRAG_DROP from './index';
import * as WORD_CLASSIFY from '../WORD_CLASSIFY/index';
import * as MATH_MANIPULATIVE from '../MATH_MANIPULATIVE/index';
import { sampleClock } from '../MATH_MANIPULATIVE/sample';
import * as DRAW from '../DRAW/index';
import * as RECORD_READ from '../RECORD_READ/index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- module dạng tổng quát cho kiểm thử
type Mod = { Player: (p: any) => JSX.Element; Editor: (p: any) => JSX.Element; sample: () => any; score: (i: any, r: any) => any };
const MODS: [ItemType, Mod, unknown][] = [
  ['MATCHING', MATCHING, { pairs: { l1: 'r1', l2: 'r3' } }],
  ['ORDERING', ORDERING, { order: ['n4', 'n2'] }],
  ['SENTENCE_SCRAMBLE', SENTENCE_SCRAMBLE, { order: ['w1', 'w3'] }],
  ['DRAG_DROP', DRAG_DROP, { placement: { t1: 'z1', t2: 'z1' } }],
  ['WORD_CLASSIFY', WORD_CLASSIFY, { placement: { w1: 'g1', w2: 'g1' } }],
  ['MATH_MANIPULATIVE', MATH_MANIPULATIVE, { value: 23 }],
  ['DRAW', DRAW, undefined],
  ['RECORD_READ', RECORD_READ, undefined],
];

describe('E2 render smoke', () => {
  for (const [type, m, partial] of MODS) {
    it(`${type}: player / bigscreen / reveal / editor`, () => {
      const item = m.sample();
      expect(item.type).toBe(type);
      const base = { item, onChange: () => undefined, disabled: false, reveal: false, mode: 'player', bigText: true };
      expect(renderToString(<m.Player {...base} value={undefined} />).length).toBeGreaterThan(20);
      expect(renderToString(<m.Player {...base} value={partial} mode="bigscreen" />).length).toBeGreaterThan(20);
      const result = m.score(item, partial);
      expect(renderToString(<m.Player {...base} value={partial} disabled reveal result={result} />).length).toBeGreaterThan(20);
      expect(renderToString(<m.Editor item={item} onChange={() => undefined} />)).toContain('ae-ed-k');
    });
  }
  it('MATH_MANIPULATIVE clock + number pad', () => {
    const c = sampleClock();
    const html = renderToString(<MATH_MANIPULATIVE.Player item={c} value={{ value: 180 }} onChange={() => undefined} disabled reveal mode="player" bigText={false} />);
    expect(html).toContain('3 giờ 30 phút');
    expect(renderToString(<MATH_MANIPULATIVE.Editor item={c} onChange={() => undefined} />)).toContain('Đồng hồ kim');
    const s = MATH_MANIPULATIVE.sample();
    const pad = { ...s, payload: { kind: 'sticks' as const, operands: [32, 5], op: '-' as const } };
    expect(renderToString(<MATH_MANIPULATIVE.Player item={pad} value={undefined} onChange={() => undefined} disabled={false} reveal={false} mode="player" bigText={false} />)).toContain('Tháo bó');
  });
});
