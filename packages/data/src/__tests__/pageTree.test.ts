import { describe, expect, it } from 'vitest';
import type { ClassPage } from '../pages';
import { buildPageTree, flattenTree, moveAmongSiblings, pagePath, parentOptions } from '../pages';

const pg = (id: string, parentId: string | null, position = 0, hidden = false): ClassPage => ({ id, classId: 'c', title: id, description: '', kind: 'section', url: null, appId: null, lti: {}, openIn: 'iframe', position, hidden, createdAt: '2026-11-23T00:00:00Z', parentId, body: '' });
const pages = [pg('tv', null, 0), pg('toan', null, 1), pg('t12', 'tv', 0), pg('bai', 't12', 0), pg('t13', 'tv', 1, true), pg('bai13', 't13', 0)];

describe('Trang học dạng cây', () => {
  it('dựng cây theo thứ tự, đường dẫn trang', () => {
    expect(flattenTree(buildPageTree(pages)).map((n) => `${'-'.repeat(n.depth)}${n.page.id}`)).toEqual(['tv', '-t12', '--bai', '-t13', '--bai13', 'toan']);
    expect(pagePath(pages, 'bai').map((p) => p.id)).toEqual(['tv', 't12', 'bai']);
  });
  it('học sinh: trang ẩn ẩn cả nhánh; trang mồ côi (cha bị ẩn, không đọc được) bị bỏ', () => {
    expect(flattenTree(buildPageTree(pages, { onlyVisible: true })).map((n) => n.page.id)).toEqual(['tv', 't12', 'bai', 'toan']);
    const asStudent = pages.filter((p) => !p.hidden); // RLS không trả trang ẩn
    expect(flattenTree(buildPageTree(asStudent, { onlyVisible: true, hideOrphans: true })).map((n) => n.page.id)).not.toContain('bai13');
  });
  it('chọn trang cha: không phải chính nó / con cháu, không quá 4 tầng', () => {
    const ids = parentOptions(pages, 't12').map((o) => o.page.id);
    expect(ids).not.toContain('t12');
    expect(ids).not.toContain('bai');
    expect(ids).toContain('toan');
    // bai đang ở tầng 3: làm cha cho trang mới (tầng 4) được, nhưng t12 (cao 2 tầng) không đặt dưới bai được.
    expect(parentOptions(pages).map((o) => o.page.id)).toContain('bai');
  });
  it('đổi chỗ với trang anh em', () => {
    expect(moveAmongSiblings(pages, 't13', -1)).toEqual([{ id: 't12', position: 1 }, { id: 't13', position: 0 }]);
    expect(moveAmongSiblings(pages, 'tv', -1)).toEqual([]);
  });
});
