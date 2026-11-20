import type { ClassHeatmap, MasteryLevel } from '@openedu/contracts';

/**
 * Phân hóa học sinh theo mức thành thạo (dựa trên bản đồ kiến thức của lớp) — để GV chọn cách hỗ trợ:
 *   ho-tro    Cần hỗ trợ: số kĩ năng "cần ôn" nhiều hơn số đã vững, hoặc từ 3 kĩ năng cần ôn và bằng ít nhất nửa số đã vững.
 *   mo-rong   Vững, nên mở rộng: không còn kĩ năng cần ôn và ít nhất 60% kĩ năng đã làm ở mức vững.
 *   tien-bo   Đang tiến bộ: các trường hợp còn lại.
 *   chua-co   Chưa có dữ liệu: chưa làm kĩ năng nào.
 * Ngưỡng cố ý đơn giản, GV đọc là hiểu; không phải nhãn cố định cho học sinh — tính lại mỗi lần mở trang.
 */
export type GroupId = 'ho-tro' | 'tien-bo' | 'mo-rong' | 'chua-co';

export const GROUPS: { id: GroupId; label: string; hint: string }[] = [
  { id: 'ho-tro', label: 'Cần hỗ trợ', hint: 'Nhiều kĩ năng cần ôn — nên kèm theo nhóm nhỏ và giao bộ ôn từ kĩ năng gốc.' },
  { id: 'tien-bo', label: 'Đang tiến bộ', hint: 'Đang học đúng nhịp — tiếp tục luyện tập để các kĩ năng đang học thành vững.' },
  { id: 'mo-rong', label: 'Vững, nên mở rộng', hint: 'Đã vững phần đã học — giao bài nâng cao hoặc nhờ em kèm bạn.' },
  { id: 'chua-co', label: 'Chưa có dữ liệu', hint: 'Chưa làm bài nào có gắn kĩ năng.' },
];
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;

export function groupOf(counts: Record<MasteryLevel, number>): GroupId {
  const vung = counts.vung ?? 0;
  const dang = counts['dang-hoc'] ?? 0;
  const canOn = counts['can-on'] ?? 0;
  const done = vung + dang + canOn;
  if (!done) return 'chua-co';
  if (canOn > vung || (canOn >= 3 && canOn * 2 >= vung)) return 'ho-tro';
  if (canOn === 0 && vung / done >= 0.6) return 'mo-rong';
  return 'tien-bo';
}

/** Đếm mức thành thạo của từng HS trên các kĩ năng trong bản đồ lớp. */
export function countsByStudent(hm: ClassHeatmap | undefined): Record<string, Record<MasteryLevel, number>> {
  const out: Record<string, Record<MasteryLevel, number>> = {};
  if (!hm) return out;
  for (const s of hm.students) {
    const c: Record<MasteryLevel, number> = { vung: 0, 'dang-hoc': 0, 'can-on': 0, 'chua-hoc': 0 };
    for (const k of hm.skills) c[hm.cells[s.id]?.[k.code]?.level ?? 'chua-hoc']++;
    out[s.id] = c;
  }
  return out;
}
