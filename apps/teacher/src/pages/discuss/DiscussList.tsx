import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { discussionState, newDiscussion, STATE_LABEL, useDeleteDiscussion, useDiscussions, useDiscussionStats, type Discussion, type DiscussionInput } from '@openedu/data';
import { Btn, ConfirmBar, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { cx, relTime } from '../../lib/format';
import { DiscussEditor } from './DiscussEditor';

/** /thao-luan — các phòng thảo luận của lớp. */
export default function DiscussList({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const { roster } = useRoster(cls);
  const q = useDiscussions(classId);
  const stats = useDiscussionStats(classId).data ?? {};
  const del = useDeleteDiscussion();
  const nav = useNavigate();
  const [edit, setEdit] = useState<DiscussionInput | Discussion | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const items = q.data ?? [];
  const live = items.filter((d) => !d.archived);
  const old = items.filter((d) => d.archived);

  if (classes.isLoading) return <Loading />;
  const row = (d: Discussion) => {
    const s = stats[d.id];
    const st = discussionState(d);
    return (
      <li key={d.id} className="tc-dlist__row">
        <Link to={`/thao-luan/${d.id}`} className="tc-dlist__main" data-testid="dc-open">
          <strong>{d.pinned ? '📌 ' : ''}{d.title}</strong>
          <small className="tc-muted">{d.rooms.length > 1 ? `${d.rooms.length} phòng nhỏ · ` : ''}{d.tabs.map((t) => t.name).join(' · ')}{s?.lastAt ? ` · bài mới ${relTime(s.lastAt)}` : ''}</small>
        </Link>
        <span className={cx('tc-chip', st === 'open' ? 'tc-chip--ok' : '')}>{STATE_LABEL[st]}</span>
        <span className="tc-small">{s?.total ?? 0} bài</span>
        {s?.pending ? <span className="tc-chip tc-chip--warn" data-testid="dc-pending-count">{s.pending} chờ duyệt</span> : null}
        {s?.reports ? <span className="tc-chip tc-chip--warn">⚑ {s.reports}</span> : null}
        <Btn size="sm" kind="ghost" icon="pencil" aria-label={`Sửa ${d.title}`} onClick={() => setEdit(d)} />
        {confirm === d.id ? <ConfirmBar text="Xóa phòng và mọi bài trong phòng?" busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(d.id, { onSuccess: () => setConfirm(null) })} />
          : <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xóa ${d.title}`} onClick={() => setConfirm(d.id)} />}
      </li>
    );
  };

  return (
    <div className="tc-page tc-dlist">
      <PageHead title="Phòng thảo luận" sub="Học sinh trao đổi theo chủ đề: chia phòng nhỏ theo tổ, đăng bài vào từng tab như Padlet. GV duyệt, ẩn bài, khóa phòng bất cứ lúc nào." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Btn kind="primary" icon="plus" disabled={!cls} onClick={() => setEdit(newDiscussion(classId, cls?.grade))} data-testid="dc-new">Tạo phòng thảo luận</Btn>
      </>} />
      <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
      {q.isLoading ? <Loading /> : !items.length ? (
        <Empty icon="team" title="Lớp chưa có phòng thảo luận">Bấm <b>Tạo phòng thảo luận</b>, đặt câu hỏi, chọn tab (Ý kiến, Câu hỏi, Hình ảnh…) và chia phòng nhỏ theo tổ nếu muốn.</Empty>
      ) : (
        <>
          <ul className="tc-card tc-card--flush tc-list">{live.map(row)}</ul>
          {old.length ? <><h3 className="tc-h3">Đã lưu trữ</h3><ul className="tc-card tc-card--flush tc-list">{old.map(row)}</ul></> : null}
        </>
      )}
      {edit && cls ? <DiscussEditor value={edit} cls={cls} roster={roster} onClose={() => setEdit(null)} onSaved={(d) => { const isNew = !('id' in edit && edit.id); setEdit(null); if (isNew) nav(`/thao-luan/${d.id}`); }} /> : null}
    </div>
  );
}
