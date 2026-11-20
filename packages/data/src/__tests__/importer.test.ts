import { describe, expect, it } from 'vitest';
import { DemoDataSource } from '../demo/DemoDataSource';
import { importSampleContent } from '../seed/importer';
import { MemoryStorage } from '../storage';

describe('importSampleContent', () => {
  it('nạp câu hỏi, bài giảng, tiêu chí qua hàm lưu của app; chạy lại không nhân đôi; bỏ slide gói HTML5', async () => {
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
    const admin = await ds.signIn('admin', '123456');
    const before = (await ds.listItems({})).length;
    const seen: number[] = [];
    const r1 = await importSampleContent(ds, admin.id, (p) => seen.push(p.done));
    expect(r1.failed).toEqual([]);
    expect(r1.items).toBeGreaterThan(100);
    expect(r1.lessons).toBeGreaterThanOrEqual(6);
    expect(seen[seen.length - 1]).toBe(r1.items + r1.lessons + r1.rubrics);
    const r2 = await importSampleContent(ds, admin.id);
    expect(r2.items).toBe(r1.items);
    expect((await ds.listItems({})).length).toBe(before);
    const lessons = await ds.listLessons({});
    expect(lessons.every((l) => l.slides.every((s) => !s.packageId))).toBe(true);
    const tagged = (await ds.listItems({ subject: 'toan', grade: 4 })).filter((i) => i.skills?.length);
    expect(tagged.length).toBeGreaterThan(20);
  });
});
