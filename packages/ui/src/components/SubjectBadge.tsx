import { SUBJECTS, type SubjectId } from '@openedu/contracts';
import type { CSSProperties } from 'react';

/** Nhãn môn học: viên thuốc màu theo môn. */
export function SubjectBadge({ subject, className, size = 'md' }: { subject: SubjectId; className?: string; size?: 'sm' | 'md' }) {
  const s = SUBJECTS[subject] ?? SUBJECTS.khac;
  return (
    <span className={`k-subject k-subject--${size}${className ? ' ' + className : ''}`} style={{ '--subject-color': `var(${s.colorVar}, ${s.color})` } as CSSProperties}>
      <i className="k-subject__dot" aria-hidden="true" />
      {s.name}
    </span>
  );
}
