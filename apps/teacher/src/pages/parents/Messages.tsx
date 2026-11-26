/** Tin nhắn hai chiều với phụ huynh: danh sách theo từng em + khung trò chuyện. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ClassInfo, ParentMessage } from '@openedu/contracts';
import { foldVietnamese, useParentThread, useParentThreads, useRemoveParentMessage, useSendParentMessage } from '@openedu/data';
import { Btn, Empty, ErrorNote, Loading } from '../../components/common';
import { cx, fmtDateTime, relTime, shorten } from '../../lib/format';

export function MessagesPanel({ cls }: { cls: ClassInfo }) {
  const [sp, setSp] = useSearchParams();
  const sel = sp.get('em') ?? '';
  const pick = (id: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('em', id); return n; }, { replace: true });
  const q = useParentThreads(cls.id);
  const [find, setFind] = useState('');
  const list = useMemo(() => {
    const f = foldVietnamese(find.trim());
    return (q.data ?? []).filter((t) => !f || foldVietnamese(t.studentName).includes(f));
  }, [q.data, find]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div className={cx('tc-ph-msg', sel && 'has-sel')}>
      <aside className="tc-card tc-card--flush tc-ph-msg__list" aria-label="Cuộc trò chuyện">
        <div className="tc-ph-msg__find"><input className="tc-input" placeholder="Tìm học sinh…" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Tìm học sinh" /></div>
        <ul>
          {list.map((t) => (
            <li key={t.studentId}>
              <button type="button" className={cx('tc-ph-thread', t.studentId === sel && 'is-on', t.unread > 0 && 'is-unread')} onClick={() => pick(t.studentId)} data-testid="ph-thread">
                <span className="tc-ph-thread__top">
                  <strong>{t.studentName}</strong>
                  {t.unread ? <span className="tc-ph__count">{t.unread}</span> : null}
                  <span className="tc-spacer" />
                  {t.last ? <small className="tc-muted">{relTime(t.last.at)}</small> : null}
                </span>
                <small className="tc-muted">
                  {t.last ? `${t.last.fromTeacher ? 'Cô: ' : ''}${shorten(t.last.body, 60)}` : t.parents ? `${t.parents} phụ huynh · chưa có tin nhắn` : 'Chưa có phụ huynh liên kết'}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="tc-card tc-ph-msg__pane">
        {sel ? <ThreadView key={sel} studentId={sel} onBack={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('em'); return n; }, { replace: true })} />
          : <Empty icon="chat" title="Chọn một em để xem tin nhắn">Phụ huynh nhắn cô về con nào sẽ hiện ở đầu danh sách. Cô cũng có thể nhắn trước cho phụ huynh của bất kì em nào.</Empty>}
      </section>
    </div>
  );
}

function ThreadView({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const q = useParentThread(studentId);
  const send = useSendParentMessage();
  const remove = useRemoveParentMessage();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const n = q.data?.messages.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [n]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const t = q.data!;
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate({ studentId, body }, { onSuccess: () => setText('') });
  };
  return (
    <div className="tc-ph-chat" data-testid="ph-chat">
      <header className="tc-ph-chat__head">
        <Btn size="sm" kind="ghost" icon="back" className="tc-ph-chat__back" onClick={onBack}>Danh sách</Btn>
        <div>
          <strong>Phụ huynh {t.studentName}</strong>
          <p className="tc-small tc-muted">{t.parents.length ? t.parents.map((p) => `${p.name}${p.relation ? ` (${p.relation})` : ''}`).join(' · ') : 'Chưa có phụ huynh liên kết — tin nhắn sẽ chờ đến khi phụ huynh liên kết.'}</p>
        </div>
      </header>
      <div className="tc-ph-chat__body" aria-live="polite">
        {t.messages.length === 0 ? <p className="tc-muted tc-small tc-ph-chat__empty">Chưa có tin nhắn. Mọi phụ huynh đã liên kết của em đều thấy tin cô gửi.</p> : null}
        {t.messages.map((m) => <Bubble key={m.id} m={m} onRemove={() => remove.mutate(m.id)} />)}
        <div ref={end} />
      </div>
      <ErrorNote error={send.error ?? remove.error} />
      <div className="tc-ph-chat__send">
        <textarea className="tc-input" rows={2} value={text} maxLength={2000} placeholder="Nhắn phụ huynh…" aria-label="Tin nhắn"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} data-testid="ph-chat-input" />
        <Btn kind="primary" icon="send" disabled={!text.trim() || send.isPending} onClick={submit} data-testid="ph-chat-send">Gửi</Btn>
      </div>
      <p className="tc-small tc-muted">Phụ huynh nhắn được trong giờ nhận tin {t.msg.from}–{t.msg.to}{t.msg.enabled ? '' : ' (đang tắt)'} — đổi ở thẻ “Phụ huynh thấy gì”.</p>
    </div>
  );
}

function Bubble({ m, onRemove }: { m: ParentMessage; onRemove: () => void }) {
  return (
    <div className={cx('tc-ph-bubble', m.fromTeacher ? 'is-me' : 'is-them', m.deleted && 'is-deleted')}>
      <div className="tc-ph-bubble__meta">
        <strong>{m.senderName}</strong> · {fmtDateTime(m.at)}
        {m.fromTeacher && m.readAt ? <span className="tc-ph-bubble__read"> · đã xem</span> : null}
      </div>
      {m.postTitle ? <div className="tc-ph-bubble__ref">Trả lời: {m.postTitle}</div> : null}
      <div className="tc-ph-bubble__text">{m.deleted ? <em>Tin nhắn đã gỡ</em> : m.body}</div>
      {m.mine && !m.deleted ? <button type="button" className="tc-ph-bubble__x" onClick={onRemove} aria-label="Gỡ tin nhắn">Gỡ</button> : null}
    </div>
  );
}
