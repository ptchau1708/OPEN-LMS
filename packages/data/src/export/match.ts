/**
 * Ghép dòng trong tệp Excel với học sinh OPEN-EDU: theo mã học sinh trước, rồi theo họ tên đã chuẩn hóa (+ lớp).
 * Trường hợp không chắc (trùng tên, chỉ khớp phần đuôi tên với nhiều em, không thấy) được đánh dấu để GV chọn tay.
 */
import { foldVietnamese } from '../text';

export interface MatchStudent {
  id: string;
  name: string;
  /** Mã ở phần mềm quản lí trường (VnEdu). */
  externalCode?: string;
  username?: string;
  className?: string;
}

export interface MatchInputRow {
  row: number;
  code: string;
  name: string;
  className?: string;
}

/**
 * code: khớp theo mã · name: khớp đúng họ tên · loose: khớp phần đuôi họ tên (vd tệp "Nguyễn Minh Hải", hệ thống "Minh Hải") ·
 * ambiguous: nhiều em có thể khớp · missing: không tìm thấy · manual: GV tự chọn.
 */
export type MatchStatus = 'code' | 'name' | 'loose' | 'ambiguous' | 'missing' | 'manual';

export interface RowMatch {
  row: number;
  status: MatchStatus;
  studentId?: string;
  /** Gợi ý khi ambiguous. */
  candidates: string[];
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  code: 'Khớp theo mã',
  name: 'Khớp theo họ tên',
  loose: 'Khớp gần đúng theo tên',
  ambiguous: 'Cần chọn',
  missing: 'Chưa thấy trong lớp',
  manual: 'Thầy/cô đã chọn',
};

export function normName(s: string): string {
  return foldVietnamese(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normCode(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '');
}
const normClass = (s: string | undefined) => foldVietnamese(s ?? '').replace(/^lop\s*/, '').replace(/[^a-z0-9]/g, '');

function isSuffix(short: string[], long: string[]): boolean {
  if (!short.length || short.length > long.length) return false;
  for (let i = 1; i <= short.length; i++) if (short[short.length - i] !== long[long.length - i]) return false;
  return true;
}

export function matchRows(rows: MatchInputRow[], students: MatchStudent[]): RowMatch[] {
  const byCode = new Map<string, MatchStudent[]>();
  for (const s of students) {
    for (const k of new Set([normCode(s.externalCode), normCode(s.username)])) {
      if (!k) continue;
      byCode.set(k, [...(byCode.get(k) ?? []), s]);
    }
  }
  const names = students.map((s) => ({ s, n: normName(s.name), t: normName(s.name).split(' ').filter(Boolean) }));
  const out: RowMatch[] = rows.map((r) => {
    const code = normCode(r.code);
    if (code) {
      const hit = byCode.get(code);
      if (hit?.length === 1) return { row: r.row, status: 'code', studentId: hit[0].id, candidates: [] };
    }
    const n = normName(r.name);
    if (!n) return { row: r.row, status: 'missing', candidates: [] };
    const cls = normClass(r.className);
    const narrow = <T extends { s: MatchStudent }>(list: T[]): T[] => {
      if (list.length < 2 || !cls) return list;
      const same = list.filter((x) => normClass(x.s.className) === cls);
      return same.length ? same : list;
    };
    const exact = narrow(names.filter((x) => x.n === n));
    if (exact.length === 1) return { row: r.row, status: 'name', studentId: exact[0].s.id, candidates: [] };
    if (exact.length > 1) return { row: r.row, status: 'ambiguous', candidates: exact.map((x) => x.s.id) };
    const t = n.split(' ');
    const loose = narrow(names.filter((x) => x.t.length !== t.length && (isSuffix(x.t, t) || isSuffix(t, x.t))));
    // Chỉ nhận khớp đuôi khi phần chung có ít nhất 2 từ (tránh "An" khớp mọi em tên An).
    const strong = loose.filter((x) => Math.min(x.t.length, t.length) >= 2);
    if (strong.length === 1) return { row: r.row, status: 'loose', studentId: strong[0].s.id, candidates: [] };
    if (loose.length) return { row: r.row, status: 'ambiguous', candidates: loose.map((x) => x.s.id) };
    return { row: r.row, status: 'missing', candidates: [] };
  });
  // Một học sinh chỉ ứng với một dòng: nếu bị nhận 2 lần, giữ dòng khớp theo mã, các dòng còn lại để GV chọn.
  const claimed = new Map<string, RowMatch[]>();
  for (const m of out) if (m.studentId) claimed.set(m.studentId, [...(claimed.get(m.studentId) ?? []), m]);
  for (const [id, list] of claimed) {
    if (list.length < 2) continue;
    const keep = list.filter((m) => m.status === 'code');
    for (const m of list) {
      if (keep.length === 1 && m === keep[0]) continue;
      m.status = 'ambiguous';
      m.candidates = [id];
      delete m.studentId;
    }
  }
  return out;
}

export function matchSummary(matches: RowMatch[]): { matched: number; review: number; missing: number } {
  let matched = 0;
  let review = 0;
  let missing = 0;
  for (const m of matches) {
    if (m.studentId) matched++;
    else if (m.status === 'ambiguous') review++;
    else missing++;
  }
  return { matched, review, missing };
}
