/** Trò chuyện nhóm (HS): tin nhắn của nhóm em, nhắn bằng chữ hoặc giọng nói, tin có từ chưa phù hợp chờ thầy/cô xem. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MascotId } from '@openedu/contracts';
import { DEFAULT_QUICK_REPLIES, discussionState, roomsFor, STATE_LABEL, useDiscussionPosts, usePostDiscussion, useReportPost, type Discussion } from '@openedu/data';
import { Button, Icon, sfx } from '@openedu/ui';
import { Avatar, EmptyState, TopBack } from '../../components/Common';
import { useSpeech } from '../../lib/speech';
import { useMe } from '../../lib/util';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function ChatRoom({ d }: { d: Discussion }) {
  const me = useMe();
  const posts = useDiscussionPosts(d.id, { fast: true });
  const send = usePostDiscussion();
  const report = useReportPost();
  const myRooms = useMemo(() => roomsFor(d, me.id, false), [d, me.id]);
  const [room, setRoom] = useState('');
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech((t) => setText((b) => (b ? `${b} ${t}` : t)));
  const roomId = myRooms.some((r) => r.id === room) ? room : myRooms[0]?.id ?? '';
  const msgs = (posts.data ?? []).filter((p) => p.roomId === roomId && p.status !== 'removed' && p.status !== 'hidden');
  // Giờ đóng tới thì khóa ô nhắn ngay, không cần tải lại.
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15_000); return () => window.clearInterval(t); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, roomId]);
  const st = discussionState(d, now);
  const canSend = st === 'open' && !!roomId;
  const go = (body: string) => {
    if (!body.trim()) return;
    sfx.tap();
    send.mutate({ discussionId: d.id, roomId, tabId: d.tabs[0]?.id ?? 'chat', body }, { onSuccess: () => setText('') });
  };

  return (
    <div className="ln-page ln-chatpage">
      <TopBack title={d.title} to="/thao-luan" />
      {d.prompt ? <p className="ln-chat__prompt">{d.prompt}</p> : null}
      {myRooms.length > 1 ? (
        <div className="ln-drooms" role="tablist" aria-label="Nhóm">
          {myRooms.map((r) => <button key={r.id} type="button" role="tab" aria-selected={r.id === roomId} className={`ln-droom${r.id === roomId ? ' is-on' : ''}`} onClick={() => setRoom(r.id)}>👥 {r.name}</button>)}
        </div>
      ) : myRooms[0] ? <p className="ln-chat__room">👥 Nhóm <b>{myRooms[0].name}</b></p> : null}
      {!roomId ? <EmptyState title="Em chưa được xếp vào nhóm nào" text="Em hỏi thầy/cô để được vào nhóm nhé." /> : (
        <>
          <div className="ln-chat__list" ref={listRef} aria-live="polite" data-testid="chat-list">
            {!msgs.length ? <p className="ln-chat__empty">Nhóm chưa có tin nhắn. Em chào các bạn trước nhé!</p> : msgs.map((p) => {
              const mine = p.authorId === me.id;
              const teacher = p.author.role === 'teacher' || p.author.role === 'admin';
              return (
                <div key={p.id} className={`ln-msg${mine ? ' is-mine' : ''}${teacher ? ' is-teacher' : ''}${p.status === 'pending' ? ' is-pending' : ''}`} data-testid="chat-msg">
                  {!mine ? <Avatar mascot={(p.author.mascot ?? 'nghe') as MascotId} color={p.author.color} size={30} /> : null}
                  <div className="ln-msg__bubble">
                    {!mine ? <span className="ln-msg__who">{p.author.name}{teacher ? ' 👩‍🏫' : ''}</span> : null}
                    <span className="ln-msg__body">{p.body}</span>
                    <span className="ln-msg__meta">
                      {hhmm(p.createdAt)}{p.status === 'pending' ? ' · chờ thầy/cô xem' : ''}
                      {!mine && !teacher && p.status === 'visible' ? (
                        <button type="button" className="ln-dlink" disabled={p.reports > 0} onClick={() => report.mutate({ postId: p.id, reason: 'Trò chuyện nhóm' })}>{p.reports ? 'Đã báo thầy/cô' : '⚑'}</button>
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {canSend ? (
            <div className="ln-chat__compose">
              <div className="ln-dstarters">{(d.quickReplies?.length ? d.quickReplies : DEFAULT_QUICK_REPLIES).map((q) => <button key={q} type="button" className="ln-dstarter" onClick={() => go(q)} disabled={send.isPending}>{q}</button>)}</div>
              <form className="ln-chat__form" onSubmit={(e) => { e.preventDefault(); go(text); }}>
                {speech.supported ? <Button size="md" variant={speech.on ? 'primary' : 'secondary'} onClick={speech.toggle} aria-label={speech.on ? 'Đang nghe, bấm để dừng' : 'Nói'} icon={<Icon name="mic" size={22} />} /> : null}
                <input className="ln-dtext ln-chat__input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Nhắn cho nhóm…" aria-label="Tin nhắn" data-testid="chat-input" />
                <Button type="submit" size="md" disabled={!text.trim() || send.isPending} icon={<Icon name="upload" size={22} />} data-testid="chat-send">Gửi</Button>
              </form>
              {send.isError ? <p className="ln-derr" role="alert">{(send.error as Error).message}</p> : null}
            </div>
          ) : (
            <p className={`ln-dstate is-${st} ln-dstate--big`} role="status">{STATE_LABEL[st]}{st === 'not-yet' && d.opensAt ? ` — mở lúc ${hhmm(d.opensAt)}` : ''}. Thầy/cô mở thì em nhắn được nhé.</p>
          )}
        </>
      )}
    </div>
  );
}
