import { skillsFor, skillShort, type Grade, type SubjectId } from '@openedu/contracts';

/** Chọn mã kĩ năng (yêu cầu cần đạt) — danh mục chính thức có cho môn Toán; môn khác dùng kĩ năng tạm nếu có. */
export function SkillPicker({ subject, grade, value, onChange, compact }: { subject: SubjectId; grade: Grade; value: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const list = skillsFor(subject, grade);
  if (!list.length && !value.length) return compact ? <span className="tc-muted tc-small">—</span> : <span className="tc-muted tc-small">Môn này chưa có danh mục kĩ năng.</span>;
  return (
    <span className="tc-qb-skills">
      {value.map((c) => (
        <span key={c} className="tc-chip" title={c}>
          {skillShort(c)}
          <button type="button" className="tc-qb-x" aria-label={`Bỏ kĩ năng ${skillShort(c)}`} onClick={() => onChange(value.filter((x) => x !== c))}>×</button>
        </span>
      ))}
      {list.length ? (
        <select className="tc-input tc-input--sm tc-qb-skillsel" value="" aria-label="Thêm kĩ năng" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">{value.length ? '+ kĩ năng' : compact ? '+ Gắn kĩ năng' : 'Chọn kĩ năng…'}</option>
          {list.filter((s) => !value.includes(s.code)).map((s) => <option key={s.code} value={s.code}>{s.short} ({s.code})</option>)}
        </select>
      ) : null}
    </span>
  );
}
