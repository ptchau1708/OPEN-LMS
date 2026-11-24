import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@openedu/contracts';
import { usePostDiscussion, type Discussion, type DiscussionPost } from '@openedu/data';
import { Btn } from '../../components/common';
import { cx } from '../../lib/format';
import { PraiseButton } from './Praise';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Một nhóm (phòng nhỏ): tin nhắn mới nhất ở dưới, GV nhắn vào nhóm, duyệt / ẩn, khen. */
export function ChatPane({ d, roomId, posts, user, onModerate, big, hideNames }: {
  d: Discussion; roomId: string; posts: DiscussionPost[]; user?: Profile; big?: boolean; hideNames?: boolean;
  onModerate?: (ids: string[], status: 'visible' | 'hidden' | 'pending') => void;
}) {
  const room = d.rooms.find((r) => r.id === roomId);
  const send = usePostDiscussion();
  const [text, setText] = useState('');
  const list = posts.filter((p) => p.roomId === roomId && p.status !== 'removed' && (!big || p.status === 'visible'));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [list.length]);
  const go = () => send.mutate({ discussionId: d.id, roomId, tabId: 'chat', body: text }, { onSuccess: () => setText('') });
  return (
    <section className={cx('tc-chat', big && 'is-big')} aria-label={`Nhóm ${room?.name ?? ''}`} data-testid="chat-pane">
      <header className="tc-chat__head">
        <strong>{room?.name}</strong>
        <small className="tc-muted">{room?.members.length ? `${room.members.length} em` : 'Cả lớp'} · {list.length} tin</small>
        {list.some((p) => p.status === 'pending') ? <span className="tc-chip tc-chip--warn">{list.filter((p) => p.status === 'pending').length} chờ duyệt</span> : null}
      </header>
      <div className="tc-chat__list" ref={box}>
        {!list.length ? <p className="tc-muted tc-small">Nhóm chưa nhắn gì.</p> : list.map((p) => {
          const teacher = p.author.role === 'teacher' || p.author.role === 'admin';
          return (
            <div key={p.id} className={cx('tc-msg', teacher && 'is-teacher', `is-${p.status}`)}>
              <div className="tc-msg__who">{hideNames && !teacher ? 'Một bạn' : p.author.name} <small>{hhmm(p.createdAt)}</small>{p.flagged ? <span className="tc-chip tc-chip--warn">⚠</span> : null}</div>
              <div className="tc-msg__body">{p.body}</div>
              {onModerate && !big ? (
                <div className="tc-msg__act">
                  {p.status === 'pending' ? <Btn size="sm" kind="ghost" onClick={() => onModerate([p.id], 'visible')}>Duyệt</Btn> : null}
                  {p.status !== 'hidden' ? <Btn size="sm" kind="ghost" onClick={() => onModerate([p.id], 'hidden')} aria-label="Ẩn tin">Ẩn</Btn> : <Btn size="sm" kind="ghost" onClick={() => onModerate([p.id], 'visible')}>Hiện lại</Btn>}
                  {user && !teacher && p.status === 'visible' ? <PraiseButton post={p} classId={d.classId} title={d.title} user={user} compact /> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {user && !big ? (
        <form className="tc-chat__send" onSubmit={(e) => { e.preventDefault(); if (text.trim()) go(); }}>
          <input className="tc-input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={`Nhắn nhóm ${room?.name ?? ''}…`} aria-label={`Nhắn nhóm ${room?.name ?? ''}`} />
          <Btn type="submit" kind="primary" disabled={!text.trim() || send.isPending}>Gửi</Btn>
        </form>
      ) : null}
    </section>
  );
}

/** GV xem mọi nhóm cùng lúc (hoặc một nhóm). */
export function ChatPanes({ d, posts, user, onModerate }: { d: Discussion; posts: DiscussionPost[]; user: Profile; onModerate: (ids: string[], status: 'visible' | 'hidden' | 'pending') => void }) {
  const [one, setOne] = useState<string | null>(null);
  const rooms = one ? d.rooms.filter((r) => r.id === one) : d.rooms;
  return (
    <div className="tc-stack">
      {d.rooms.length > 1 ? (
        <div className="tc-drooms" role="tablist" aria-label="Nhóm">
          <button type="button" role="tab" aria-selected={!one} className={cx('tc-droom', !one && 'is-active')} onClick={() => setOne(null)}>Tất cả nhóm</button>
          {d.rooms.map((r) => <button key={r.id} type="button" role="tab" aria-selected={one === r.id} className={cx('tc-droom', one === r.id && 'is-active')} onClick={() => setOne(r.id)}>{r.name}</button>)}
        </div>
      ) : null}
      <div className={cx('tc-chatgrid', one && 'is-one')}>
        {rooms.map((r) => <ChatPane key={r.id} d={d} roomId={r.id} posts={posts} user={user} onModerate={onModerate} />)}
      </div>
    </div>
  );
}
