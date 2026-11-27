/** /thao-luan, /thao-luan/:id — Phòng thảo luận của lớp (học sinh). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { MascotId } from '@openedu/contracts';
import {
  CARD_COLORS, discussionState, groupPosts, roomsFor, STARTERS, STATE_LABEL, useDiscussion, useDiscussionPosts, useDiscussions,
  useEditDiscussionPost, usePostDiscussion, useReactPost, useRemoveMyPost, useReportPost, type DiscussionPost, type DiscussionReaction,
} from '@openedu/data';
import { Button, Card, Icon, sfx } from '@openedu/ui';
import { Avatar, EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { useSpeech } from '../../lib/speech';
import { useMe } from '../../lib/util';
import { ChatRoom } from './ChatRoom';
import '../../styles/discuss.css';

const RX: { kind: DiscussionReaction; icon: string; label: string }[] = [{ kind: 'heart', icon: '❤️', label: 'Thả tim' }, { kind: 'star', icon: '⭐', label: 'Khen' }, { kind: 'like', icon: '👍', label: 'Thích' }];
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : new Date(iso).toLocaleDateString('vi-VN');
};

export function DiscussHome() {
  const me = useMe();
  const nav = useNavigate();
  const q = useDiscussions(me.classId);
  const list = q.data ?? [];
  return (
    <div className="ln-page ln-dhome">
      <TopBack title="Thảo luận" />
      {!me.classId ? <EmptyState title="Em chưa có lớp" text="Khi thầy/cô xếp em vào lớp, các phòng thảo luận sẽ hiện ở đây." />
        : q.isPending ? <LoadingScreen /> : q.isError ? <ErrorState onRetry={() => void q.refetch()} message={(q.error as Error).message} />
        : !list.length ? <EmptyState title="Chưa có phòng thảo luận" text="Khi thầy/cô mở chủ đề mới, em sẽ thấy ở đây nhé!" />
        : (
          <div className="ln-dhome__list">
            {list.map((d) => {
              const st = discussionState(d);
              return (
                <Card key={d.id} className="ln-dhome__card">
                  <div className="ln-dhome__text">
                    <h2 className="ln-h2">{d.pinned ? '📌 ' : ''}{d.kind === 'chat' ? '💬 ' : ''}{d.title}</h2>
                    {d.kind === 'chat' ? <p className="ln-dkind">Trò chuyện nhóm cùng tổ</p> : null}
                    {d.prompt ? <p>{d.prompt.slice(0, 120)}{d.prompt.length > 120 ? '…' : ''}</p> : null}
                    <span className={`ln-dstate is-${st}`}>{STATE_LABEL[st]}</span>
                  </div>
                  <Button size="lg" onClick={() => { sfx.tap(); nav(`/thao-luan/${d.id}`); }} data-testid="dc-enter">Vào</Button>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}

function Card2({ p, replies, meId, canPost, onReply }: { p: DiscussionPost; replies: DiscussionPost[]; meId: string; canPost: boolean; onReply: (p: DiscussionPost) => void }) {
  const react = useReactPost();
  const report = useReportPost();
  const remove = useRemoveMyPost();
  const edit = useEditDiscussionPost();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | 'report' | 'remove'>(null);
  const mine = p.authorId === meId;
  const teacher = p.author.role === 'teacher' || p.author.role === 'admin';
  return (
    <article className={`ln-dcard${p.status === 'pending' ? ' is-pending' : ''}${teacher ? ' is-teacher' : ''}`} style={p.color ? { background: p.color } : undefined} data-testid="dc-card">
      <header className="ln-dcard__head">
        <Avatar mascot={(p.author.mascot ?? 'nghe') as MascotId} color={p.author.color} size={34} />
        <strong>{mine ? 'Em' : p.author.name}{teacher ? ' 👩‍🏫' : ''}</strong>
        <small>{ago(p.createdAt)}</small>
      </header>
      {p.status === 'pending' ? <p className="ln-dcard__wait" role="status">⏳ Đang chờ thầy/cô xem — chỉ em thấy bài này.</p> : null}
      {editing !== null ? (
        <div className="ln-dcard__edit">
          <textarea className="ln-dtext" value={editing} maxLength={1000} onChange={(e) => setEditing(e.target.value)} aria-label="Sửa bài" />
          <div className="ln-row"><Button size="md" variant="secondary" onClick={() => setEditing(null)}>Hủy</Button><Button size="md" disabled={!editing.trim() || edit.isPending} onClick={() => edit.mutate({ id: p.id, body: editing }, { onSuccess: () => setEditing(null) })}>Lưu</Button></div>
        </div>
      ) : p.body ? <p className="ln-dcard__body">{p.body}</p> : null}
      {p.images.length ? <div className="ln-dcard__imgs">{p.images.map((im) => (im.url ? <img key={im.path} src={im.url} alt="Ảnh bạn gửi" loading="lazy" /> : null))}</div> : null}
      <footer className="ln-dcard__foot">
        {RX.map((r) => (
          <button key={r.kind} type="button" className={`ln-rx${p.mine[r.kind] ? ' is-on' : ''}`} aria-pressed={p.mine[r.kind]} aria-label={r.label}
            disabled={p.status !== 'visible' || react.isPending} onClick={() => { sfx.tap(); react.mutate({ postId: p.id, kind: r.kind }); }}>
            {r.icon}{p.reactions[r.kind] ? <b>{p.reactions[r.kind]}</b> : null}
          </button>
        ))}
        <button type="button" className="ln-rx" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="dc-replies">💬{replies.length ? <b>{replies.length}</b> : null}</button>
        <span className="ln-grow" />
        {mine && p.status !== 'removed' ? (
          <>
            <button type="button" className="ln-dlink" onClick={() => setEditing(p.body)}>Sửa</button>
            <button type="button" className="ln-dlink" onClick={() => setAsk('remove')}>Gỡ</button>
          </>
        ) : !teacher && p.status === 'visible' ? (
          <button type="button" className="ln-dlink" disabled={p.reports > 0} onClick={() => setAsk('report')}>{p.reports ? 'Đã báo thầy/cô' : '⚑ Báo thầy/cô'}</button>
        ) : null}
      </footer>
      {ask ? (
        <div className="ln-dask" role="alertdialog" aria-label={ask === 'remove' ? 'Gỡ bài' : 'Báo thầy/cô'}>
          <span>{ask === 'remove' ? 'Gỡ bài này?' : 'Báo thầy/cô bài này chưa hay?'}</span>
          <Button size="md" variant="secondary" onClick={() => setAsk(null)}>Thôi</Button>
          <Button size="md" onClick={() => { if (ask === 'remove') remove.mutate(p.id); else report.mutate({ postId: p.id, reason: '' }); setAsk(null); }}>{ask === 'remove' ? 'Gỡ' : 'Báo thầy/cô'}</Button>
        </div>
      ) : null}
      {open ? (
        <div className="ln-dcard__replies">
          {replies.map((r) => (
            <p key={r.id} className={`ln-dreply${r.status === 'pending' ? ' is-pending' : ''}`}><strong>{r.authorId === meId ? 'Em' : r.author.name}:</strong> {r.body}{r.status === 'pending' ? ' (chờ thầy/cô xem)' : ''}</p>
          ))}
          {canPost && p.status === 'visible' ? <Button size="md" variant="secondary" onClick={() => onReply(p)} data-testid="dc-reply">Trả lời bạn</Button> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function DiscussRoom() {
  const { id = '' } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const dq = useDiscussion(id);
  const posts = useDiscussionPosts(id);
  const send = usePostDiscussion();
  const d = dq.data;
  const myRooms = useMemo(() => (d ? roomsFor(d, me.id, false) : []), [d, me.id]);
  const [room, setRoom] = useState('');
  const [tab, setTab] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<DiscussionPost | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [cols, setCols] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech((t) => setBody((b) => (b ? `${b} ${t}` : t)));
  useEffect(() => { if (!done) return; const t = window.setTimeout(() => setDone(null), 3000); return () => window.clearTimeout(t); }, [done]);

  if (dq.isPending) return <LoadingScreen />;
  if (!d) return <ErrorState title="Không tìm thấy phòng" message={(dq.error as Error | null)?.message} onRetry={() => nav('/thao-luan')} />;
  if (d.kind === 'chat') return <ChatRoom d={d} />;
  const roomId = myRooms.some((r) => r.id === room) ? room : myRooms[0]?.id ?? '';
  const tabId = d.tabs.some((t) => t.id === tab) ? tab : d.tabs[0]?.id ?? '';
  const st = discussionState(d);
  const canPost = st === 'open' && !!roomId;
  const all = posts.data ?? [];
  const { byTab, replies } = groupPosts(all, roomId);
  const list = (byTab[tabId] ?? []).filter((p) => p.status !== 'removed' && p.status !== 'hidden');
  const iPosted = all.some((p) => p.authorId === me.id && !p.parentId && p.status !== 'removed');

  const post = () => {
    sfx.tap();
    send.mutate({ discussionId: d.id, roomId, tabId: replyTo ? replyTo.tabId : tabId, parentId: replyTo?.id ?? null, body, files, color }, {
      onSuccess: (p) => {
        setBody(''); setFiles([]); setColor(null); setReplyTo(null);
        setDone(p.status === 'pending' ? 'Đã gửi! Bài sẽ hiện khi thầy/cô xem xong.' : 'Đã đăng bài!');
        sfx.drop();
      },
    });
  };

  return (
    <div className="ln-page ln-dpage">
      <TopBack title={d.title} to="/thao-luan" />
      {d.prompt ? <div className="ln-dprompt"><Icon name="hint" size={24} /><p>{d.prompt}</p></div> : null}
      {st !== 'open' ? <p className={`ln-dstate is-${st} ln-dstate--big`} role="status">{STATE_LABEL[st]}{st === 'not-yet' && d.opensAt ? ` — mở lúc ${new Date(d.opensAt).toLocaleString('vi-VN')}` : ''}. Em vẫn xem được bài.</p> : null}

      {myRooms.length > 1 ? (
        <div className="ln-drooms" role="tablist" aria-label="Phòng">
          {myRooms.map((r) => <button key={r.id} type="button" role="tab" aria-selected={r.id === roomId} className={`ln-droom${r.id === roomId ? ' is-on' : ''}`} onClick={() => { sfx.tap(); setRoom(r.id); }}>{r.members.length ? '👥 ' : '🏫 '}{r.name}</button>)}
        </div>
      ) : null}
      <div className="ln-dtabs" role="tablist" aria-label="Tab">
        {d.tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tabId} className={`ln-dtab${t.id === tabId ? ' is-on' : ''}`} style={{ ['--tab' as string]: t.color }} onClick={() => { sfx.tap(); setTab(t.id); setReplyTo(null); }}>
            {t.name}<span>{(byTab[t.id] ?? []).filter((p) => p.status === 'visible').length}</span>
          </button>
        ))}
      </div>

      {canPost ? (
        <section className="ln-dcompose" aria-label="Viết bài">
          <p className="ln-dcompose__to">{replyTo ? <>Trả lời bài của <b>{replyTo.author.name}</b> <button type="button" className="ln-dlink" onClick={() => setReplyTo(null)}>Thôi</button></> : <>Em đăng vào tab <b>{d.tabs.find((t) => t.id === tabId)?.name}</b></>}</p>
          <div className="ln-dstarters">{STARTERS.map((s) => <button key={s} type="button" className="ln-dstarter" onClick={() => { setBody((b) => (b ? `${b} ${s}` : s)); boxRef.current?.focus(); }}>{s}</button>)}</div>
          <textarea ref={boxRef} className="ln-dtext" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={replyTo ? 'Em nghĩ gì về bài của bạn?' : 'Em viết ở đây…'} aria-label="Nội dung bài" data-testid="dc-body" />
          <div className="ln-dcompose__bar">
            {speech.supported ? <Button size="md" variant={speech.on ? 'primary' : 'secondary'} onClick={speech.toggle} icon={<Icon name="mic" size={22} />}>{speech.on ? 'Đang nghe…' : 'Nói'}</Button> : null}
            {!replyTo ? <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
              <Button size="md" variant="secondary" onClick={() => fileRef.current?.click()} icon={<Icon name="image" size={22} />}>{files.length ? `${files.length} ảnh` : 'Ảnh'}</Button>
              <span className="ln-dcolors" role="group" aria-label="Màu thẻ">{CARD_COLORS.slice(1).map((c) => <button key={c} type="button" aria-label="Chọn màu thẻ" aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(color === c ? null : c)} />)}</span>
            </> : null}
            <span className="ln-grow" />
            <Button size="lg" disabled={send.isPending || (!body.trim() && !files.length)} onClick={post} icon={<Icon name="upload" size={24} />} data-testid="dc-send">{send.isPending ? 'Đang gửi…' : 'Đăng'}</Button>
          </div>
          {send.isError ? <p className="ln-derr" role="alert">{(send.error as Error).message}</p> : null}
          {done ? <p className="ln-dok" role="status" data-testid="dc-done">{done}</p> : null}
        </section>
      ) : null}

      {d.hideOthers && !iPosted ? <p className="ln-dhint">Em đăng bài của mình trước, rồi sẽ thấy bài của các bạn nhé!</p> : null}
      {d.tabs.length > 1 ? <label className="ln-dcolsw"><input type="checkbox" checked={cols} onChange={(e) => setCols(e.target.checked)} /> Xem các tab cạnh nhau</label> : null}
      {cols ? (
        <div className="ln-dcols">
          {d.tabs.map((t) => (
            <section key={t.id} className="ln-dcol" style={{ ['--tab' as string]: t.color }}>
              <h2>{t.name}</h2>
              {(byTab[t.id] ?? []).filter((p) => p.status !== 'removed' && p.status !== 'hidden').map((p) => <Card2 key={p.id} p={p} replies={(replies[p.id] ?? []).filter((r) => r.status !== 'removed' && r.status !== 'hidden')} meId={me.id} canPost={canPost} onReply={(x) => { setReplyTo(x); boxRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
            </section>
          ))}
        </div>
      ) : posts.isPending ? <LoadingScreen /> : list.length ? (
        <div className="ln-dgrid">{list.map((p) => <Card2 key={p.id} p={p} replies={(replies[p.id] ?? []).filter((r) => r.status !== 'removed' && r.status !== 'hidden')} meId={me.id} canPost={canPost} onReply={(x) => { setReplyTo(x); boxRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}</div>
      ) : <EmptyState title="Chưa có bài nào" text={canPost ? 'Em là người đầu tiên đăng bài nhé!' : 'Tab này chưa có bài.'} />}
    </div>
  );
}
