/** Phụ huynh: "Thông báo của cô" (tin cả lớp / tin riêng, xác nhận), mục cô đã gửi kèm lời nhắn, ô "Nhắn cô". */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { InboxPost, ParentInbox as Inbox, Profile } from '@openedu/contracts';
import { useReadParentPost } from '@openedu/data';
import { Button, Icon } from '@openedu/ui';
import { dayLabel, timeLabel } from '../../lib/util';

/** Tách đường link trong văn bản thành thẻ <a>. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : <span key={i}>{p}</span>))}</>;
}

export function ParentInbox({ child, box }: { child: Profile; box: Inbox }) {
  const [sp] = useSearchParams();
  const focus = sp.get('tin');
  const [open, setOpen] = useState<string | null>(focus);
  const read = useReadParentPost();
  const newCount = box.posts.filter((p) => !p.readAt || (p.ackRequired && !p.ackedAt)).length;
  useEffect(() => {
    if (!focus) return;
    const p = box.posts.find((x) => x.id === focus);
    if (p && !p.readAt) read.mutate({ postId: p.id });
    document.getElementById(`ln-post-${focus}`)?.scrollIntoView?.({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  const toggle = (p: InboxPost) => {
    setOpen((o) => (o === p.id ? null : p.id));
    if (!p.readAt) read.mutate({ postId: p.id });
  };
  const t = box.thread;
  return (
    <section className="ln-pp-card ln-pin" aria-label="Thông báo của cô" data-testid="pp-inbox">
      <h2 className="ln-pp-h"><Icon name="bell" size={22} /> Thông báo của cô {newCount ? <span className="ln-pin__new">{newCount} mới</span> : null}</h2>
      {box.posts.length === 0 && box.items.length === 0 ? <p className="ln-pp-muted">Chưa có thông báo nào của cô.</p> : null}
      {box.posts.length ? (
        <ul className="ln-pin__list">
          {box.posts.slice(0, 20).map((p) => {
            const isOpen = open === p.id;
            const isNew = !p.readAt;
            return (
              <li key={p.id} id={`ln-post-${p.id}`} className={`ln-pin__post${isNew ? ' is-new' : ''}${isOpen ? ' is-open' : ''}`}>
                <button type="button" className="ln-pin__head" aria-expanded={isOpen} onClick={() => toggle(p)} data-testid="pp-post">
                  <span className="ln-pin__title">{p.private ? <span className="ln-pin__tag">Riêng</span> : null}{p.title}</span>
                  <span className="ln-pp-muted">{p.teacherName} · {dayLabel(p.at)} {timeLabel(p.at)}</span>
                </button>
                {isOpen ? (
                  <div className="ln-pin__body">
                    {p.body ? <p><Linkify text={p.body} /></p> : null}
                    <div className="ln-row ln-row--wrap">
                      {p.ackRequired ? (p.ackedAt
                        ? <span className="ln-pin__ok"><Icon name="check" size={18} /> Đã xác nhận</span>
                        : <Button disabled={read.isPending} onClick={() => read.mutate({ postId: p.id, ack: true })} data-testid="pp-ack">Đã nhận</Button>) : null}
                      {box.msg.enabled ? <Link className="k-btn k-btn--secondary k-btn--md" to={`/phu-huynh/nhan-tin?con=${child.id}&tin=${p.id}`}><span className="k-btn__label">Trả lời cô</span></Link> : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {box.items.length ? (
        <ul className="ln-pin__items">
          {box.items.slice(0, 10).map((i) => (
            <li key={`${i.kind}-${i.refId}`}>
              <strong>{i.title}</strong>
              <span className="ln-pp-muted">{i.teacherName} gửi · {dayLabel(i.sentAt)}</span>
              {i.note ? <span className="ln-pin__note">“{i.note}”</span> : null}
              {i.detail ? <span className="ln-pp-muted">{i.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Link className={`ln-pin__chat${t.unread ? ' is-new' : ''}`} to={`/phu-huynh/nhan-tin?con=${child.id}`} data-testid="pp-chat-link">
        <Icon name="chat" size={24} />
        <span className="ln-pin__chatmain">
          <strong>Nhắn tin với {box.teachers[0] ?? 'cô'}{t.unread ? ` · ${t.unread} tin mới` : ''}</strong>
          <span className="ln-pp-muted">{t.last ? `${t.last.fromTeacher ? '' : 'Bạn: '}${t.last.body.slice(0, 80)}` : box.msg.enabled ? `Cô nhận tin từ ${box.msg.from} đến ${box.msg.to}.` : 'Lớp đang tắt nhắn tin.'}</span>
        </span>
        <Icon name="next" size={20} />
      </Link>
    </section>
  );
}
