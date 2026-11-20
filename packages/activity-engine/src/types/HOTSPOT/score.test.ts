import { describe, expect, it } from 'vitest';
import type { ItemOf } from '@openedu/contracts';
import { isComplete, score } from './score';
import { sample } from './sample';
import { hitTest, viewHeight } from './geometry';

describe('HOTSPOT score (multiple)', () => {
  const item = sample(); // đúng: ca-cam, ca-vang
  it('sample key regions exist and image is a data URI', () => {
    const ids = item.payload.regions.map((r) => r.id);
    item.key!.correct.forEach((id) => expect(ids).toContain(id));
    expect(item.payload.image.startsWith('data:image/svg+xml')).toBe(true);
  });
  it('exact set correct', () => {
    expect(score(item, { regions: ['ca-vang', 'ca-cam'] })).toMatchObject({ correct: true, score: 1 });
  });
  it('partial', () => {
    const r = score(item, { regions: ['ca-cam'] });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
  });
  it('wrong region lowers score and is marked false', () => {
    const r = score(item, { regions: ['ca-cam', 'meo'] });
    expect(r.score).toBe(0);
    expect(r.parts).toMatchObject({ meo: false, 'ca-cam': true, 'ca-vang': true });
  });
  it('missing key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { regions: ['ca-cam'] }).graded).toBe(false);
  });
  it('isComplete', () => {
    expect(isComplete(item, { regions: [] })).toBe(false);
    expect(isComplete(item, { regions: ['chim'] })).toBe(true);
  });
});

describe('HOTSPOT score (single)', () => {
  const single: ItemOf<'HOTSPOT'> = { ...sample(), payload: { ...sample().payload, multiple: false } };
  it('any one correct region is enough', () => {
    expect(score(single, { regions: ['ca-vang'] }).correct).toBe(true);
    expect(score(single, { regions: ['chim'] })).toMatchObject({ correct: false, score: 0, parts: { chim: false } });
  });
});

describe('HOTSPOT geometry', () => {
  const item = sample();
  const H = viewHeight(item.payload.aspect);
  it('hit test finds the fish and the cat, misses the sky', () => {
    expect(hitTest(item.payload.regions, 51, (74 * H) / 100, H)?.id).toBe('ca-cam');
    expect(hitTest(item.payload.regions, 18, (70 * H) / 100, H)?.id).toBe('meo');
    expect(hitTest(item.payload.regions, 5, 2, H)).toBeNull();
  });
});
