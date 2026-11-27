/** Phụ huynh: bài con đã đăng trong Phòng thảo luận (chỉ xem, chỉ bài đã được hiện). */
import type { Profile } from '@openedu/contracts';
import { useDiscussionPosts, useDiscussions, type Discussion } from '@openedu/data';

function One({ d, child }: { d: Discussion; child: Profile }) {
  const q = useDiscussionPosts(d.id);
  const mine = (q.data ?? []).filter((p) => p.authorId === child.id && p.status === 'visible');
  if (!mine.length) return null;
  return (
    <div className="ln-pp-disc">
      <p className="ln-pp-disc__t"><b>{d.title}</b></p>
      <ul className="ln-pp-sents">
        {mine.slice(-5).map((p) => (
          <li key={p.id}>{p.parentId ? '↳ ' : ''}{p.body || '(ảnh)'}{p.reactions.heart + p.reactions.star + p.reactions.like > 0 ? ` · ${p.reactions.heart + p.reactions.star + p.reactions.like} lượt khen` : ''}</li>
        ))}
      </ul>
    </div>
  );
}

export function ParentDiscuss({ child }: { child: Profile }) {
  const ds = useDiscussions(child.classId).data ?? [];
  if (!ds.length) return null;
  return (
    <section className="ln-pp-card" data-testid="pp-discuss">
      <h2 className="ln-pp-h">Con thảo luận cùng lớp</h2>
      {ds.slice(0, 6).map((d) => <One key={d.id} d={d} child={child} />)}
      <p className="ln-pp-muted">Chỉ hiện các bài con đã đăng và được thầy/cô duyệt.</p>
    </section>
  );
}
