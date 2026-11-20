import { MASTERY_LEVEL_LABEL, uid, type Assignment, type Grade, type Lesson, type MasteryLevel, type SubjectId } from '@openedu/contracts';
import { cx } from './format';

/** Thứ tự hiển thị chú giải: tốt → chưa học. */
export const LEVEL_ORDER: MasteryLevel[] = ['vung', 'dang-hoc', 'can-on', 'chua-hoc'];

export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Dấu hiệu không dựa vào màu: ✓ vững · • đang học · ! cần ôn · (trống) chưa học. */
const GLYPH: Record<MasteryLevel, string> = { vung: '✓', 'dang-hoc': '•', 'can-on': '!', 'chua-hoc': '' };

export function LevelSwatch({ level, className }: { level: MasteryLevel; className?: string }) {
  return <i className={cx('tc-lv', `tc-lv--${level}`, className)} aria-hidden="true">{GLYPH[level]}</i>;
}

export function LevelLegend() {
  return (
    <ul className="tc-legend" aria-label="Chú giải mức thành thạo">
      {LEVEL_ORDER.map((l) => <li key={l}><LevelSwatch level={l} />{MASTERY_LEVEL_LABEL[l]}</li>)}
    </ul>
  );
}

/** Thanh xếp chồng số kĩ năng theo mức. */
export function LevelBar({ counts, total }: { counts: Record<MasteryLevel, number>; total?: number }) {
  const sum = total ?? LEVEL_ORDER.reduce((s, l) => s + (counts[l] ?? 0), 0);
  const label = LEVEL_ORDER.map((l) => `${MASTERY_LEVEL_LABEL[l]} ${counts[l] ?? 0}`).join(', ');
  return (
    <div className="tc-lvbar" role="img" aria-label={label}>
      {sum ? LEVEL_ORDER.map((l) => (counts[l] ? <span key={l} className={`tc-lvbar__seg tc-lv--${l}`} style={{ flexGrow: counts[l] }} title={`${MASTERY_LEVEL_LABEL[l]}: ${counts[l]}`} /> : null)) : null}
    </div>
  );
}

/** Bài giảng ngắn từ danh sách câu hỏi (bộ ôn cho nhóm / cho một em). */
export function remediationLesson(o: { title: string; subject: SubjectId; grade: Grade; ownerId: string; itemIds: string[]; note?: string }): Lesson {
  return {
    id: uid('l'),
    title: o.title,
    subject: o.subject,
    grade: o.grade,
    ownerId: o.ownerId,
    status: 'published',
    minutes: Math.max(3, o.itemIds.length),
    updatedAt: new Date().toISOString(),
    description: o.note,
    slides: [
      { id: uid('s'), layout: 'title', title: o.title, text: 'Cùng ôn lại nào!', teacherNotes: o.note },
      ...o.itemIds.map((itemId) => ({ id: uid('s'), layout: 'activity' as const, itemId })),
      { id: uid('s'), layout: 'summary', title: 'Giỏi lắm!', text: 'Em đã ôn xong.' },
    ],
  };
}

export function assignmentFor(lesson: Lesson, classId: string, studentIds: string[], createdBy: string): Omit<Assignment, 'id'> {
  const due = new Date();
  due.setDate(due.getDate() + 3);
  due.setHours(20, 0, 0, 0);
  return { targetType: 'lesson', targetId: lesson.id, title: lesson.title, classId, studentIds, openAt: new Date().toISOString(), dueAt: due.toISOString(), createdBy };
}
