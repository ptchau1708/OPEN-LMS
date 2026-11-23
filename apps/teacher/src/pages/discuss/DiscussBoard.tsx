import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { MascotId, Profile } from '@openedu/contracts';
import {
  bridge, CARD_COLORS, discussionState, groupPosts, participation, slugId, STATE_LABEL, useAddDiscussionWord, useClass, useDiscussion, useDiscussionPosts,
  useDiscussionWords, useModeratePosts, usePostDiscussion, useReactPost, useRemoveDiscussionWord, useSaveDiscussion,
  type DiscussionPost, type DiscussionReaction,
} from '@openedu/data';
import { Icon } from '@openedu/ui';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { useRoster } from '../../lib/assess';
import { cx, fmtDateTime, relTime } from '../../lib/format';
import { DiscussEditor } from './DiscussEditor';

const STATUS: Record<DiscussionPost['status'], string> = { pending: 'Chờ duyệt', visible: 'Đã hiện', hidden: 'Đã ẩn', removed: 'HS đã gỡ' };
const RX: { kind: DiscussionReaction; icon: string; label: string }[] = [{ kind: 'heart', icon: '❤️', label: 'Thả tim' }, { kind: 'star', icon: '⭐', label: 'Khen' }, { kind: 'like', icon: '👍', label: 'Thích' }];

export function PostCard({ p, replies, onModerate, onReact, onReply, hideName, big }: {
  p: DiscussionPost; replies: DiscussionPost[]; hideName?: boolean; big?: boolean;
  onModerate?: (ids: string[], status: 'visible' | 'hidden' | 'pending') => void; onReact?: (id: string, k: DiscussionReaction) => void; onReply?: (p: DiscussionPost) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className={cx('tc-dcard', `is-${p.status}`, big && 'is-big')} style={p.color ? { background: p.color } : undefined} data-testid="dc-card">
      <header className="tc-dcard__head">
        {!hideName ? <Avatar mascot={(p.author.mascot ?? 'nghe') as MascotId} color={p.author.color} size={26} /> : null}
        <strong>{hideName ? 'Một bạn' : p.author.name}</strong>
        <small className="tc-muted" title={fmtDateTime(p.createdAt)}>{relTime(p.createdAt)}</small>
        <span className="tc-ebar__spacer" />
        {p.status !== 'visible' && !big ? <span className={cx('tc-chip', p.status === 'pending' ? 'tc-chip--warn' : '')}>{STATUS[p.status]}</span> : null}
        {p.flagged && !big ? <span className="tc-chip tc-chip--warn" title="Có từ trong danh sách cần chặn">⚠ Từ chưa phù hợp</span> : null}
        {p.reports && !big ? <span className="tc-chip tc-chip--warn">⚑ {p.reports} báo cáo</span> : null}
      </header>
      {p.body ? <p className="tc-dcard__body">{p.body}</p> : null}
      {p.images.length ? <div className="tc-dcard__imgs">{p.images.map((im) => (im.url ? <a key={im.path} href={im.url} target="_blank" rel="noreferrer"><img src={im.url} alt="Ảnh học sinh gửi" loading="lazy" /></a> : null))}</div> : null}
      <footer className="tc-dcard__foot">
        {RX.map((r) => <button key={r.kind} type="button" className={cx('tc-rx', p.mine[r.kind] && 'is-on')} aria-pressed={p.mine[r.kind]} aria-label={r.label} disabled={!onReact || p.status !== 'visible'} onClick={() => onReact?.(p.id, r.kind)}>{r.icon} {p.reactions[r.kind] || ''}</button>)}
        {replies.length || onReply ? <button type="button" className="tc-rx" onClick={() => setOpen((v) => !v)} aria-expanded={open}>💬 {replies.length || ''}</button> : null}
        <span className="tc-ebar__spacer" />
        {onModerate && p.status === 'pending' ? <Btn size="sm" kind="primary" icon="check" onClick={() => onModerate([p.id], 'visible')} data-testid="dc-approve">Duyệt</Btn> : null}
        {onModerate && p.status !== 'hidden' && p.status !== 'removed' ? <Btn size="sm" kind="ghost" icon="eye" onClick={() => onModerate([p.id], 'hidden')}>Ẩn</Btn> : null}
        {onModerate && p.status === 'hidden' ? <Btn size="sm" kind="ghost" onClick={() => onModerate([p.id], 'visible')}>Hiện lại</Btn> : null}
      </footer>
      {open ? (
        <div className="tc-dcard__replies">
          {replies.map((r) => (
            <div key={r.id} className={cx('tc-dreply', `is-${r.status}`)}>
              <strong>{hideName ? 'Một bạn' : r.author.name}</strong> <span>{r.body}</span>
              {r.status !== 'visible' ? <span className="tc-chip tc-chip--warn">{STATUS[r.status]}</span> : null}
              {onModerate && r.status === 'pending' ? <Btn size="sm" kind="ghost" onClick={() => onModerate([r.id], 'visible')}>Duyệt</Btn> : null}
              {onModerate && r.status === 'visible' ? <Btn size="sm" kind="ghost" onClick={() => onModerate([r.id], 'hidden')}>Ẩn</Btn> : null}
            </div>
          ))}
          {onReply ? <Btn size="sm" kind="ghost" onClick={() => onReply(p)}>Trả lời bài này</Btn> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function DiscussBoard({ user }: { user: Profile }) {
  const { id = '' } = useParams();
  const dq = useDiscussion(id);
  const d = dq.data;
  const cls = useClass(d?.classId).data ?? undefined;
  const { roster } = useRoster(cls);
  const posts = useDiscussionPosts(id);
  const moderate = useModeratePosts();
  const react = useReactPost();
  const send = usePostDiscussion();
  const saveD = useSaveDiscussion();
  const [room, setRoom] = useState('chung');
  const [tab, setTab] = useState<string>('');
  const [cols, setCols] = useState(false);
  const [edit, setEdit] = useState(false);
  const [words, setWords] = useState(false);
  const [show, setShow] = useState<null | { hideNames: boolean }>(null);
  const [body, setBody] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DiscussionPost | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const all = posts.data ?? [];
  const roomId = d?.rooms.some((r) => r.id === room) ? room : d?.rooms[0]?.id ?? 'chung';
  const tabId = d?.tabs.some((t) => t.id === tab) ? tab : d?.tabs[0]?.id ?? '';
  const { byTab, replies } = useMemo(() => groupPosts(all, roomId), [all, roomId]);
  const pending = all.filter((p) => p.status === 'pending');
  const roomCount = (rid: string) => all.filter((p) => p.roomId === rid && !p.parentId && p.status !== 'removed').length;

  if (dq.isLoading) return <Loading />;
  if (!d) return <div className="tc-page"><ErrorNote error={dq.error ?? new Error('Không tìm thấy phòng thảo luận.')} /><Link to="/thao-luan">Về danh sách</Link></div>;
  const st = discussionState(d);
  const mod = (ids: string[], status: 'visible' | 'hidden' | 'pending') => moderate.mutate({ ids, status });
  const onReact = (pid: string, kind: DiscussionReaction) => react.mutate({ postId: pid, kind });
  const post = () => send.mutate({ discussionId: d.id, roomId, tabId: replyTo ? replyTo.tabId : tabId, parentId: replyTo?.id ?? null, body, files, color }, {
    onSuccess: () => { setBody(''); setFiles([]); setReplyTo(null); setColor(null); },
  });
  const exportXlsx = () => {
    const part = participation(all);
    const name = (u: string) => roster.find((s) => s.id === u)?.name ?? all.find((p) => p.authorId === u)?.author.name ?? u;
    const roomName = (r: string) => d.rooms.find((x) => x.id === r)?.name ?? r;
    const tabName = (t: string) => d.tabs.find((x) => x.id === t)?.name ?? t;
    bridge.downloadBytes(`thao-luan-${cls?.name ?? ''}-${slugId(d.title, [], 'phong')}.xlsx`, bridge.writeXlsx([
      { name: 'Tham gia', header: 1, rows: [[`${d.title} — lớp ${cls?.name ?? ''}`], ['Học sinh', 'Số bài', 'Số bình luận', 'Lượt thả tim/khen nhận được'],
        ...roster.map((s) => [s.name, part[s.id]?.posts ?? 0, part[s.id]?.replies ?? 0, part[s.id]?.hearts ?? 0])] },
      { name: 'Tất cả bài', header: 1, rows: [['Thời gian', 'Học sinh', 'Phòng nhỏ', 'Tab', 'Loại', 'Nội dung', 'Trạng thái', '❤️', '⭐', '👍'],
        ...all.map((p) => [fmtDateTime(p.createdAt), name(p.authorId), roomName(p.roomId), tabName(p.tabId), p.parentId ? 'Bình luận' : 'Bài', p.body, STATUS[p.status], p.reactions.heart, p.reactions.star, p.reactions.like])] },
    ]));
  };

  const cards = (list: DiscussionPost[], big?: boolean, hideName?: boolean) => list.filter((p) => p.status !== 'removed' && (!big || p.status === 'visible')).map((p) => (
    <PostCard key={p.id} p={p} replies={(replies[p.id] ?? []).filter((r) => !big || r.status === 'visible')} big={big} hideName={hideName}
      {...(big ? {} : { onModerate: mod, onReact, onReply: (x: DiscussionPost) => { setReplyTo(x); setBody(''); } })} />
  ));

  return (
    <div className="tc-page tc-page--wide tc-dboard">
      <PageHead title={d.title} sub={<>
        <span className={cx('tc-chip', st === 'open' ? 'tc-chip--ok' : 'tc-chip--warn')}>{STATE_LABEL[st]}</span>{' '}
        Lớp {cls?.name} · {d.moderation === 'pre' ? 'Duyệt trước khi hiện' : 'Hiện ngay'}{d.hideOthers ? ' · HS thấy bài bạn sau khi đăng' : ''}
        {d.opensAt || d.closesAt ? ` · ${d.opensAt ? `mở ${fmtDateTime(d.opensAt)}` : ''}${d.closesAt ? ` – đóng ${fmtDateTime(d.closesAt)}` : ''}` : ''}
      </>} actions={<>
        <Link className="tc-btn" to={`/thao-luan?lop=${d.classId}`}><Icon name="back" size={16} /> Danh sách</Link>
        <Btn icon="lock" onClick={() => saveD.mutate({ ...d, locked: !d.locked })} data-testid="dc-lock">{d.locked ? 'Mở khóa' : 'Khóa ngay'}</Btn>
        <Btn icon="pencil" onClick={() => setEdit(true)}>Sửa phòng</Btn>
        <Btn icon="tv" onClick={() => setShow({ hideNames: false })}>Trình chiếu</Btn>
        <Btn icon="upload" onClick={exportXlsx} data-testid="dc-export">Xuất Excel</Btn>
        <Btn kind="ghost" onClick={() => setWords(true)}>Từ cần chặn</Btn>
      </>} />
      {d.prompt ? <div className="tc-card tc-dprompt"><p>{d.prompt}</p></div> : null}
      <ErrorNote error={posts.error ?? moderate.error ?? saveD.error} onRetry={() => void posts.refetch()} />

      {pending.length ? (
        <div className="tc-alert tc-alert--warn tc-dpending" data-testid="dc-pending">
          <span><b>{pending.length}</b> bài chờ duyệt{pending.some((p) => p.flagged) ? ` (${pending.filter((p) => p.flagged).length} bài có từ chưa phù hợp)` : ''} — ở phòng: {[...new Set(pending.map((p) => d.rooms.find((r) => r.id === p.roomId)?.name ?? p.roomId))].join(', ')}</span>
          <Btn size="sm" kind="primary" icon="check" onClick={() => mod(pending.filter((p) => !p.flagged).map((p) => p.id), 'visible')} disabled={!pending.some((p) => !p.flagged)} data-testid="dc-approve-all">Duyệt tất cả bài không có cảnh báo</Btn>
        </div>
      ) : null}

      {d.rooms.length > 1 ? (
        <div className="tc-drooms" role="tablist" aria-label="Phòng nhỏ">
          {d.rooms.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === roomId} className={cx('tc-droom', r.id === roomId && 'is-active')} onClick={() => setRoom(r.id)}>
              {r.name} <em>{roomCount(r.id)}</em>{all.some((p) => p.roomId === r.id && p.status === 'pending') ? <i className="tc-dot" aria-label="có bài chờ duyệt" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="tc-dtabs" role="tablist" aria-label="Tab đăng bài">
        {d.tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={!cols && t.id === tabId} className={cx('tc-dtab', !cols && t.id === tabId && 'is-active')} style={{ ['--tab' as string]: t.color }} onClick={() => { setCols(false); setTab(t.id); }}>
            {t.name} <em>{(byTab[t.id] ?? []).filter((p) => p.status !== 'removed').length}</em>
          </button>
        ))}
        <span className="tc-ebar__spacer" />
        <button type="button" className={cx('tc-dtab', cols && 'is-active')} aria-pressed={cols} onClick={() => setCols((v) => !v)}>Xem dạng cột</button>
      </div>

      <section className="tc-card tc-dcompose">
        {replyTo ? <p className="tc-small">Trả lời bài của <b>{replyTo.author.name}</b>: “{replyTo.body.slice(0, 60)}” <button type="button" className="tc-link" onClick={() => setReplyTo(null)}>bỏ</button></p>
          : <p className="tc-small tc-muted">Đăng vào <b>{d.tabs.find((t) => t.id === tabId)?.name}</b> · {d.rooms.find((r) => r.id === roomId)?.name} (bài của GV hiện ngay)</p>}
        <textarea className="tc-input" rows={2} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="Viết gợi ý, câu hỏi thêm hoặc lời khen cho cả lớp…" data-testid="dc-body" />
        <div className="tc-row tc-wrap">
          {!replyTo ? <span className="tc-dcolors" role="group" aria-label="Màu thẻ">{CARD_COLORS.map((c) => <button key={c} type="button" aria-pressed={color === c} style={{ background: c }} aria-label={`Màu ${c}`} onClick={() => setColor(color === c ? null : c)} />)}</span> : null}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
          {!replyTo ? <Btn size="sm" icon="image" onClick={() => fileRef.current?.click()}>{files.length ? `${files.length} ảnh` : 'Thêm ảnh'}</Btn> : null}
          <span className="tc-ebar__spacer" />
          <Btn kind="primary" icon="upload" disabled={send.isPending || (!body.trim() && !files.length)} onClick={post} data-testid="dc-send">{send.isPending ? 'Đang đăng…' : 'Đăng'}</Btn>
        </div>
        <ErrorNote error={send.error} />
      </section>

      {posts.isLoading ? <Loading /> : cols ? (
        <div className="tc-dcols">
          {d.tabs.map((t) => (
            <section key={t.id} className="tc-dcol" style={{ ['--tab' as string]: t.color }}>
              <h3>{t.name}</h3>
              {cards(byTab[t.id] ?? [])}
            </section>
          ))}
        </div>
      ) : (byTab[tabId] ?? []).filter((p) => p.status !== 'removed').length ? (
        <div className="tc-dgrid">{cards(byTab[tabId] ?? [])}</div>
      ) : <Empty icon="pencil" title="Chưa có bài trong tab này">Bài học sinh đăng sẽ hiện ở đây ngay khi có.</Empty>}

      {edit && cls ? <DiscussEditor value={d} cls={cls} roster={roster} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} /> : null}
      {words ? <WordsDialog classId={d.classId} user={user} onClose={() => setWords(false)} /> : null}
      {show ? (
        <div className="tc-dshow" role="dialog" aria-label="Trình chiếu bảng thảo luận">
          <header className="tc-row tc-wrap">
            <h2>{d.title}</h2>
            <span className="tc-muted">{d.rooms.find((r) => r.id === roomId)?.name}{cols ? '' : ` · ${d.tabs.find((t) => t.id === tabId)?.name}`}</span>
            <span className="tc-ebar__spacer" />
            <label className="tc-row tc-small"><input type="checkbox" checked={show.hideNames} onChange={(e) => setShow({ hideNames: e.target.checked })} /> Ẩn tên</label>
            <Btn icon="close" onClick={() => setShow(null)}>Đóng</Btn>
          </header>
          {cols ? <div className="tc-dcols">{d.tabs.map((t) => <section key={t.id} className="tc-dcol" style={{ ['--tab' as string]: t.color }}><h3>{t.name}</h3>{cards(byTab[t.id] ?? [], true, show.hideNames)}</section>)}</div>
            : <div className="tc-dgrid">{cards(byTab[tabId] ?? [], true, show.hideNames)}</div>}
        </div>
      ) : null}
    </div>
  );
}

function WordsDialog({ classId, user, onClose }: { classId: string; user: Profile; onClose: () => void }) {
  const q = useDiscussionWords(classId);
  const add = useAddDiscussionWord();
  const del = useRemoveDiscussionWord();
  const [w, setW] = useState('');
  const list = q.data ?? [];
  return (
    <Dialog open title="Từ cần chặn" onClose={onClose}>
      <div className="tc-stack">
        <p className="tc-small tc-muted">Bài có các từ này (khớp nguyên từ, có dấu) sẽ <b>chờ GV duyệt</b> dù phòng đang để “hiện ngay”. Từ chung của trường do quản trị quản lí.</p>
        <div className="tc-row">
          <input className="tc-input tc-grow" value={w} onChange={(e) => setW(e.target.value)} placeholder="Thêm từ cho lớp này" onKeyDown={(e) => { if (e.key === 'Enter' && w.trim()) add.mutate({ classId, word: w }, { onSuccess: () => setW('') }); }} />
          <Btn kind="primary" disabled={!w.trim() || add.isPending} onClick={() => add.mutate({ classId, word: w }, { onSuccess: () => setW('') })}>Thêm</Btn>
        </div>
        <ErrorNote error={add.error ?? del.error} />
        <div className="tc-chips">
          {list.map((x) => (
            <span key={x.id} className="tc-chip">{x.word}{x.classId ? '' : ' (trường)'}
              {x.classId || user.role === 'admin' ? <button type="button" className="tc-chip__x" aria-label={`Bớt từ ${x.word}`} onClick={() => del.mutate(x.id)}>×</button> : null}
            </span>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
