import { subjectGroupsFor, subjectLabelFor, type SubjectId } from '@openedu/contracts';

/**
 * Các <option> môn học của một lớp, chia nhóm theo Thông tư 32/2018: Môn học bắt buộc · Hoạt động giáo dục bắt buộc ·
 * Môn học tự chọn · Khác. `present`: môn đang chọn — luôn giữ trong danh sách.
 */
export function SubjectOptions({ grade, present = [] }: { grade?: number | null; present?: (SubjectId | '')[] }) {
  return (
    <>
      {subjectGroupsFor(grade, present).map((g) => (
        <optgroup key={g.group} label={g.label}>
          {g.subjects.map((s) => <option key={s.id} value={s.id}>{subjectLabelFor(s.id, grade)}</option>)}
        </optgroup>
      ))}
    </>
  );
}
