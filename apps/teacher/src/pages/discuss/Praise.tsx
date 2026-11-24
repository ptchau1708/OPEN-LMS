import { useState } from 'react';
import type { Profile } from '@openedu/contracts';
import { defaultBehaviors, useBehaviors, useReactPost, useRecordBehavior, type DiscussionPost } from '@openedu/data';
import { Btn } from '../../components/common';

/**
 * 🏅 Khen bài của HS → ghi một hành vi TÍCH CỰC vào Thi đua (cộng điểm + sao vào ví như khi khen trên lớp),
 * kèm thả ⭐ lên bài (⭐ của GV = đã khen, nút chuyển thành "Đã khen" để không khen trùng).
 */
export function PraiseButton({ post, classId, title, user, compact }: { post: DiscussionPost; classId: string; title: string; user: Profile; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const bq = useBehaviors(classId);
  const record = useRecordBehavior();
  const react = useReactPost();
  if (post.author.role && post.author.role !== 'student') return null;
  const list = (bq.data?.length ? bq.data : defaultBehaviors(classId)).filter((b) => b.kind === 'positive');
  const praised = post.mine.star || !!done;
  if (praised) return <span className="tc-chip tc-chip--ok" title="Đã ghi vào Thi đua">🏅 {done ?? 'Đã khen'}</span>;
  return (
    <span className={compact ? 'tc-praise is-inline' : 'tc-praise'}>
      <Btn size="sm" kind="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="dc-praise">🏅 {compact ? '' : 'Khen'}</Btn>
      {open ? (
        <span className="tc-praise__menu" role="menu" aria-label="Khen vào Thi đua">
          {list.map((b) => (
            <button key={b.id} type="button" role="menuitem" disabled={record.isPending}
              onClick={() => record.mutate({ classId, behaviorId: b.id, studentIds: [post.authorId], note: `Thảo luận: ${title}`, by: user.id }, {
                onSuccess: () => {
                  setOpen(false);
                  setDone(`+${b.points} ${b.label}`);
                  if (!post.mine.star) react.mutate({ postId: post.id, kind: 'star' });
                },
              })}>
              <span aria-hidden="true">{b.icon}</span> {b.label} <b>+{b.points}</b>
            </button>
          ))}
          {record.error ? <small className="tc-warn">{(record.error as Error).message}</small> : null}
        </span>
      ) : null}
    </span>
  );
}
