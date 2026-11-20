import type { CSSProperties } from 'react';
import type { StudentWorkEntry, SubmissionDetail, Tt27Level, WorkTask } from '@openedu/contracts';
import { TT27_LEVEL_LABEL } from '@openedu/contracts';
import { useSubmissions, useWorkTasks } from '@openedu/data';
import { Card, Icon, StarShape } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { dayLabel, dueLabel, subjectColor } from '../lib/util';
import { isSeen, workState, type WorkState } from '../lib/work';
import '../styles/work-cards.css';

export interface WorkItem { task: WorkTask; sub?: SubmissionDetail; state: WorkState; fresh: boolean }

const ORDER: Record<string, number> = { redo: 0, todo: 1, fresh: 2, waiting: 3, feedback: 4 };

/** Bài viết được giao cho HS + bài nộp mới nhất của mỗi bài. */
export function useWorkItems(studentId: string) {
  const tasksQ = useWorkTasks({ studentId });
  const subsQ = useSubmissions({ studentId });
  const subs = subsQ.data ?? [];
  const items: WorkItem[] = (tasksQ.data ?? []).map((task) => {
    const sub = subs.find((s) => s.taskId === task.id);
    const state = workState(sub);
    return { task, sub, state, fresh: state === 'feedback' && !!sub && !isSeen(sub.id) };
  });
  items.sort((a, b) => ORDER[a.fresh ? 'fresh' : a.state] - ORDER[b.fresh ? 'fresh' : b.state]);
  return { items, isPending: tasksQ.isPending || subsQ.isPending, isError: tasksQ.isError || subsQ.isError, refetch: () => { void tasksQ.refetch(); void subsQ.refetch(); } };
}

const LEVEL_ICON: Record<Tt27Level, IconName> = { T: 'trophy', H: 'star', C: 'flame' };

/** Nhãn mức đạt kiểu nhãn dán (C dùng màu cam dịu, không đỏ). */
export function LevelSticker({ level, size = 'md', className }: { level: Tt27Level; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={`ln-lvl ln-lvl--${level} ln-lvl--${size}${className ? ' ' + className : ''}`}>
      {size === 'lg' && level === 'T' ? <StarShape size={34} /> : <Icon name={LEVEL_ICON[level]} size={size === 'sm' ? 16 : size === 'lg' ? 30 : 20} />}
      <span>{level === 'C' && size !== 'lg' ? 'Cố thêm chút nữa' : TT27_LEVEL_LABEL[level]}</span>
    </span>
  );
}

const STATE_UI: Record<WorkState, { sub: string; icon: IconName; go: IconName }> = {
  todo: { sub: 'Chụp ảnh hoặc gõ bài làm', icon: 'pencil', go: 'play' },
  waiting: { sub: 'Đang chờ thầy cô xem', icon: 'clock', go: 'eye' },
  feedback: { sub: 'Thầy cô đã nhận xét bài của em', icon: 'star', go: 'eye' },
  redo: { sub: 'Thầy cô nhờ em sửa lại một chút', icon: 'retry', go: 'play' },
};

export function WorkTaskCard({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  const { task, state, sub } = item;
  const ui = STATE_UI[state];
  const due = task.dueAt && (state === 'todo' || state === 'redo') ? dueLabel(task.dueAt) : null;
  const level = state === 'feedback' ? sub?.final?.level ?? sub?.grade?.level : undefined;
  return (
    <Card interactive onClick={onOpen} className={`ln-task ln-wtask is-${state}`} style={{ ['--subj' as string]: subjectColor(task.subject) } as CSSProperties} aria-label={`Bài viết: ${task.title}. ${ui.sub}`}>
      <span className="ln-task__tile ln-wtask__tile" aria-hidden="true"><Icon name={ui.icon} size={32} strokeWidth={2.4} /></span>
      <span className="ln-task__body">
        <span className="ln-wtask__kicker"><Icon name="pencil" size={15} /> Bài viết</span>
        <span className="ln-task__title">{task.title}</span>
        <span className="ln-wtask__state">{ui.sub}</span>
        {(due || level) && (
          <span className="ln-task__meta">
            {level && <LevelSticker level={level} size="sm" />}
            {due && <span className={`ln-due ln-wtask__due${due.late ? ' is-late' : ''}`}><Icon name="clock" size={16} /> {due.text}</span>}
          </span>
        )}
      </span>
      <span className="ln-task__go" aria-hidden="true"><Icon name={ui.go} size={28} strokeWidth={2.6} /></span>
      {item.fresh && <span className="ln-sticker ln-wtask__new">Có nhận xét!</span>}
    </Card>
  );
}

/** Bộ sưu tập bài đã được duyệt (trang Tôi). */
export function WorkGallery({ entries, pending, onOpen }: { entries: StudentWorkEntry[]; pending: number; onOpen: (taskId: string) => void }) {
  return (
    <>
      {pending > 0 && <p className="ln-wgal__pending"><Icon name="clock" size={20} /> {pending} bài đang chờ thầy cô xem</p>}
      <div className="ln-wgal">
        {entries.map((e) => (
          <button key={e.submissionId} type="button" className="ln-wgal__item" onClick={() => onOpen(e.taskId)} style={{ ['--subj' as string]: subjectColor(e.subject) } as CSSProperties}>
            <span className="ln-wgal__thumb">
              {e.thumbnail ? <img src={e.thumbnail} alt="" loading="lazy" /> : <span className="ln-wgal__text" aria-hidden="true"><Icon name="pencil" size={28} /> Bài gõ</span>}
              <LevelSticker level={e.level} size="sm" className="ln-wgal__lvl" />
            </span>
            <span className="ln-wgal__title">{e.title}</span>
            <span className="ln-wgal__date">{dayLabel(e.at)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
