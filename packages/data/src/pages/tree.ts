/** Trang học dạng cây (như Google Sites) — hàm thuần. docs/TRANG_HOC.md */
import type { ClassPage } from './types';

export interface PageNode { page: ClassPage; depth: number; children: PageNode[] }
export const MAX_PAGE_DEPTH = 4;

const order = (a: ClassPage, b: ClassPage) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

/**
 * Dựng cây. Trang có trang cha không còn trong danh sách (đã xóa) → lên làm trang gốc; riêng khi `hideOrphans`
 * (HS: trang cha bị ẩn nên không đọc được) thì bỏ cả nhánh. `onlyVisible`: bỏ trang ẩn và mọi trang con của nó.
 */
export function buildPageTree(pages: ClassPage[], opts: { onlyVisible?: boolean; hideOrphans?: boolean } = {}): PageNode[] {
  const list = opts.onlyVisible ? pages.filter((p) => !p.hidden) : pages;
  const ids = new Set(list.map((p) => p.id));
  const kids = new Map<string | null, ClassPage[]>();
  for (const p of list) {
    let parent = p.parentId ?? null;
    if (parent && !ids.has(parent)) {
      if (opts.hideOrphans || (opts.onlyVisible && pages.some((x) => x.id === parent))) continue;
      parent = null;
    }
    (kids.get(parent) ?? kids.set(parent, []).get(parent)!).push(p);
  }
  const walk = (parent: string | null, depth: number, seen: Set<string>): PageNode[] =>
    (kids.get(parent) ?? []).sort(order).filter((p) => !seen.has(p.id)).map((p) => {
      const s = new Set(seen).add(p.id);
      return { page: p, depth, children: walk(p.id, depth + 1, s) };
    });
  return walk(null, 0, new Set());
}

/** Duyệt cây theo thứ tự hiển thị (để vẽ danh sách thụt lề). */
export function flattenTree(nodes: PageNode[]): PageNode[] {
  const out: PageNode[] = [];
  const go = (ns: PageNode[]) => ns.forEach((n) => { out.push(n); go(n.children); });
  go(nodes);
  return out;
}

/** Đường dẫn từ gốc tới trang (để hiện "Tiếng Việt › Tuần 12 › Bài đọc"). */
export function pagePath(pages: ClassPage[], id: string): ClassPage[] {
  const by = new Map(pages.map((p) => [p.id, p]));
  const out: ClassPage[] = [];
  let cur = by.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = cur.parentId ? by.get(cur.parentId) : undefined; }
  return out;
}

/** Trang có thể làm cha của `id`: không phải chính nó / con cháu của nó, và không vượt quá độ sâu. */
export function parentOptions(pages: ClassPage[], id?: string): { page: ClassPage; depth: number }[] {
  const tree = flattenTree(buildPageTree(pages));
  const banned = new Set<string>();
  if (id) {
    const mark = (pid: string) => { banned.add(pid); pages.filter((p) => p.parentId === pid).forEach((c) => mark(c.id)); };
    mark(id);
  }
  const height = (pid?: string): number => (pid ? 1 + Math.max(0, ...pages.filter((p) => p.parentId === pid).map((c) => height(c.id))) : 1);
  const h = height(id);
  return tree.filter((n) => !banned.has(n.page.id) && n.depth + 1 + h <= MAX_PAGE_DEPTH).map((n) => ({ page: n.page, depth: n.depth }));
}

/** Đổi chỗ với trang anh em liền trước / sau. Trả các cặp (id, vị trí mới) cần lưu. */
export function moveAmongSiblings(pages: ClassPage[], id: string, dir: -1 | 1): { id: string; position: number }[] {
  const me = pages.find((p) => p.id === id);
  if (!me) return [];
  const sib = pages.filter((p) => (p.parentId ?? null) === (me.parentId ?? null)).sort(order);
  const i = sib.findIndex((p) => p.id === id);
  const j = i + dir;
  if (j < 0 || j >= sib.length) return [];
  const re = sib.map((p, k) => ({ id: p.id, position: k }));
  [re[i]!.position, re[j]!.position] = [re[j]!.position, re[i]!.position];
  return re.filter((r) => pages.find((p) => p.id === r.id)!.position !== r.position);
}
