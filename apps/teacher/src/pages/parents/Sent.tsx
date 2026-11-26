/** Thông báo đã gửi: số phụ huynh đã xem / xác nhận, xem từng em, nhắc lại, thu hồi. */
import { useState } from 'react';
import type { ClassInfo, ParentPost } from '@openedu/contracts';
import { useParentPostDetail, useParentPosts, useRecallParentPost, useRemindParentPost } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Loading } from '../../components/common';
import { fmtDateTime } from '../../lib/format';

function Status({ p }: { p: ParentPost }) {
  if (p.recalled) return <span className="tc-chip">Đã thu hồi</span>;
  if (!p.sent) return <span className="tc-chip tc-chip--warn">Hẹn {fmtDateTime(p.sendAt)}</span>;
  const n = p.ackRequired ? p.acks : p.reads;
  const all = p.parents > 0 && n >= p.parents;
  return <span className={`tc-chip ${all ? 'tc-chip--ok' : ''}`}>{p.ackRequired ? 'Đã xác nhận' : 'Đã xem'} {n}/{p.parents}</span>;
}

export function SentPanel({ cls, onNew }: { cls: ClassInfo; onNew: () => void }) {
  const q = useParentPosts(cls.id);
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const list = q.data ?? [];
  if (!list.length) {
    return <Empty icon="send" title="Chưa gửi thông báo nào"><Btn kind="primary" onClick={onNew}>Gửi phụ huynh</Btn></Empty>;
  }
  return (
    <>
      <ul className="tc-ph-sent" data-testid="ph-sent">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" className="tc-card tc-ph-sent__card" onClick={() => setOpen(p.id)} data-testid="ph-sent-card">
              <span className="tc-row tc-wrap">
                <strong>{p.title}</strong>
                <span className="tc-spacer" />
                <Status p={p} />
              </span>
              <span className="tc-small tc-muted">
                {p.audience === 'class' ? `Cả lớp ${cls.name}` : p.studentNames.join(', ')} · {fmtDateTime(p.sendAt)} · {p.authorName}
                {p.noParent ? ` · ${p.noParent} em chưa có phụ huynh liên kết` : ''}
              </span>
              {p.body ? <span className="tc-small tc-ph-sent__body">{p.body}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {open ? <PostDialog id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PostDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useParentPostDetail(id);
  const recall = useRecallParentPost();
  const remind = useRemindParentPost();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const p = q.data;
  return (
    <Dialog open onClose={onClose} title={p?.title ?? 'Thông báo'} wide footer={p && !p.recalled ? <>
      {p.sent ? <Btn disabled={remind.isPending} onClick={() => remind.mutate(p.id, { onSuccess: (n) => setMsg(n ? `Đã nhắc lại ${n} phụ huynh.` : 'Mọi phụ huynh đã xem.') })} data-testid="ph-remind">Nhắc người chưa {p.ackRequired ? 'xác nhận' : 'xem'}</Btn> : null}
      <Btn kind="danger" onClick={() => setConfirm(true)}>Thu hồi</Btn>
      <Btn kind="primary" onClick={onClose}>Đóng</Btn>
    </> : <Btn kind="primary" onClick={onClose}>Đóng</Btn>}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : p ? (
        <div className="tc-col">
          <p className="tc-small tc-muted"><Status p={p} /> Gửi {fmtDateTime(p.sendAt)} · {p.authorName}</p>
          {p.body ? <p className="tc-ph-sent__body">{p.body}</p> : null}
          {msg ? <p className="tc-alert tc-alert--ok" role="status">{msg}</p> : null}
          <ErrorNote error={recall.error ?? remind.error} />
          {confirm ? <ConfirmBar text="Thu hồi thông báo này? Phụ huynh sẽ không còn thấy nữa." confirmLabel="Thu hồi" busy={recall.isPending} onCancel={() => setConfirm(false)} onConfirm={() => recall.mutate(p.id, { onSuccess: () => setConfirm(false) })} /> : null}
          <div className="tc-tablewrap">
            <table className="tc-table">
              <thead><tr><th>Học sinh</th><th>Phụ huynh</th><th>Đã xem</th>{p.ackRequired ? <th>Xác nhận</th> : null}</tr></thead>
              <tbody>
                {(p.students ?? []).map((s) => s.parents.length ? s.parents.map((g, i) => (
                  <tr key={`${s.studentId}-${g.id}`}>
                    {i === 0 ? <td rowSpan={s.parents.length}><strong>{s.studentName}</strong></td> : null}
                    <td>{g.name}{g.relation ? ` (${g.relation})` : ''}</td>
                    <td>{g.readAt ? fmtDateTime(g.readAt) : <span className="tc-chip tc-chip--warn">Chưa xem</span>}</td>
                    {p.ackRequired ? <td>{g.ackedAt ? <span className="tc-chip tc-chip--ok">Đã nhận</span> : <span className="tc-muted">–</span>}</td> : null}
                  </tr>
                )) : (
                  <tr key={s.studentId}><td><strong>{s.studentName}</strong></td><td colSpan={p.ackRequired ? 3 : 2} className="tc-muted">Chưa có phụ huynh liên kết</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
