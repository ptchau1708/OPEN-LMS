/** Phụ huynh nhắn tin với thầy/cô về một con (hai chiều). */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useChildren, useParentThread, useRemoveParentMessage, useSendParentMessage } from '@openedu/data';
import { Button, Icon } from '@openedu/ui';
import { ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { dayLabel, timeLabel, useMe } from '../../lib/util';
import { Linkify } from './ParentInbox';
import '../../styles/notify.css';

export default function ParentChat() {
  const me = useMe();
  const [sp] = useSearchParams();
  const kids = useChildren(me.id).data ?? [];
  const childId = sp.get('con') ?? kids[0]?.id;
  const postId = sp.get('tin') ?? undefined;
  const q = useParentThread(childId);
  const send = useSendParentMessage();
  const remove = useRemoveParentMessage();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const n = q.data?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [n]);
  if (!childId || q.isPending) return <LoadingScreen label="Đang mở tin nhắn" />;
  if (q.isError) return <ErrorState message={(q.error as Error).message || 'Chưa mở được tin nhắn.'} onRetry={() => void q.refetch()} />;
  const t = q.data;
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate({ studentId: t.studentId, body, postId }, { onSuccess: () => setText('') });
  };
  return (
    <div className="ln-page ln-chat" data-testid="pp-chat">
      <TopBack title={`Nhắn ${t.teachers[0] ?? 'thầy/cô'}`} to="/phu-huynh" />
      <p className="ln-chat__sub">Về con: <b>{t.studentName}</b>{t.className ? ` · Lớp ${t.className}` : ''}</p>
      <div className="ln-chat__body" aria-live="polite">
        {t.messages.length === 0 ? <p className="ln-pp-muted ln-chat__empty">Chưa có tin nhắn. Bố mẹ có thể hỏi thầy/cô về việc học của con, xin phép nghỉ học…</p> : null}
        {t.messages.map((m) => (
          <div key={m.id} className={`ln-chat__b${m.mine ? ' is-me' : m.fromTeacher ? ' is-gv' : ' is-other'}${m.deleted ? ' is-del' : ''}`}>
            <span className="ln-chat__meta">{m.mine ? 'Bạn' : m.senderName} · {dayLabel(m.at)} {timeLabel(m.at)}{m.mine && m.readAt ? ' · thầy/cô đã xem' : ''}</span>
            {m.postTitle ? <span className="ln-chat__ref">Trả lời: {m.postTitle}</span> : null}
            <span className="ln-chat__text">{m.deleted ? <em>Tin nhắn đã gỡ</em> : <Linkify text={m.body} />}</span>
            {m.mine && !m.deleted ? <button type="button" className="ln-chat__x" onClick={() => remove.mutate(m.id)}>Gỡ</button> : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      {t.msg.enabled ? (
        <>
          {!t.msg.open ? <p className="ln-chat__hours"><Icon name="clock" size={18} /> Thầy/cô nhận tin từ {t.msg.from} đến {t.msg.to}. Bố mẹ vẫn gửi được, thầy/cô sẽ đọc khi vào giờ.</p> : null}
          {postId ? <p className="ln-chat__hours">Đang trả lời một thông báo của thầy/cô.</p> : null}
          <div className="ln-chat__send">
            <textarea className="ln-input" rows={2} maxLength={2000} value={text} placeholder="Nhắn thầy/cô…" aria-label="Tin nhắn"
              onChange={(e) => setText(e.target.value)} data-testid="pp-chat-input" />
            <Button icon={<Icon name="send" size={22} />} disabled={!text.trim() || send.isPending} onClick={submit} data-testid="pp-chat-send">Gửi</Button>
          </div>
          {send.error ? <p className="ln-ntf__msg is-err" role="alert">{(send.error as Error).message}</p> : null}
        </>
      ) : <p className="ln-chat__hours">Lớp đang tắt nhắn tin với thầy/cô. Bố mẹ liên hệ thầy/cô qua sổ liên lạc hoặc điện thoại nhé.</p>}
    </div>
  );
}
