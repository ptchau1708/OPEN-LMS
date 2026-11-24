import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { discussionState, groupPosts, STATE_LABEL, useDiscussion, useDiscussionPosts } from '@openedu/data';
import { QrCode } from '@openedu/ui';
import { Loading } from '../../components/common';
import { learnerBase } from '../../lib/env';
import { cx } from '../../lib/format';
import { ChatPane } from './ChatPanes';
import { PostCard } from './DiscussBoard';

/**
 * /thao-luan/:id/tv — mở trên TV / máy chiếu (cửa sổ riêng, không có menu): chữ to, tự cập nhật, mã QR cho HS vào phòng,
 * tự chuyển tab mỗi 20 giây (tùy chọn), ẩn tên. Trò chuyện nhóm: mọi nhóm cùng lúc.
 */
export default function DiscussTv() {
  const { id = '' } = useParams();
  const dq = useDiscussion(id);
  const d = dq.data;
  const posts = useDiscussionPosts(id, { fast: true });
  const [room, setRoom] = useState('');
  const [tab, setTab] = useState('');
  const [cycle, setCycle] = useState(false);
  const [hideNames, setHideNames] = useState(false);
  const [cols, setCols] = useState(false);
  const all = posts.data ?? [];
  const roomId = d?.rooms.some((r) => r.id === room) ? room : d?.rooms[0]?.id ?? 'chung';
  const tabId = d?.tabs.some((t) => t.id === tab) ? tab : d?.tabs[0]?.id ?? '';
  const { byTab, replies } = useMemo(() => groupPosts(all, roomId), [all, roomId]);
  useEffect(() => {
    if (!cycle || !d || d.tabs.length < 2) return;
    const t = window.setInterval(() => setTab((cur) => {
      const i = d.tabs.findIndex((x) => x.id === (cur || d.tabs[0].id));
      return d.tabs[(i + 1) % d.tabs.length].id;
    }), 20_000);
    return () => window.clearInterval(t);
  }, [cycle, d]);
  useEffect(() => { document.title = d ? `${d.title} — TV` : 'Thảo luận — TV'; }, [d]);

  if (dq.isLoading) return <Loading />;
  if (!d) return <p className="tc-page">Không tìm thấy phòng thảo luận.</p>;
  const join = `${learnerBase()}/thao-luan/${d.id}`;
  const st = discussionState(d);
  const visible = (list: typeof all) => list.filter((p) => p.status === 'visible');
  const card = (p: (typeof all)[number]) => <PostCard key={p.id} p={p} replies={visible(replies[p.id] ?? [])} big hideName={hideNames} />;

  return (
    <div className="tc-app theme-pro tc-dtv" data-testid="dc-tv">
      <header className="tc-dtv__head">
        <div className="tc-dtv__title">
          <h1>{d.title}</h1>
          {d.prompt ? <p>{d.prompt}</p> : null}
          <span className={cx('tc-chip', st === 'open' ? 'tc-chip--ok' : 'tc-chip--warn')}>{STATE_LABEL[st]}{st === 'open' && d.closesAt ? ` · đóng lúc ${new Date(d.closesAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        </div>
        <div className="tc-dtv__qr"><QrCode value={join} size={120} title="Quét để vào phòng thảo luận" /><small>Quét để vào</small></div>
      </header>
      <nav className="tc-dtv__bar">
        {d.kind === 'board' && d.rooms.length > 1 ? d.rooms.map((r) => <button key={r.id} type="button" className={cx('tc-droom', r.id === roomId && 'is-active')} onClick={() => setRoom(r.id)}>{r.name}</button>) : null}
        {d.kind === 'board' ? d.tabs.map((t) => <button key={t.id} type="button" className={cx('tc-dtab', !cols && t.id === tabId && 'is-active')} style={{ ['--tab' as string]: t.color }} onClick={() => { setCols(false); setTab(t.id); }}>{t.name}</button>) : null}
        <span className="tc-ebar__spacer" />
        {d.kind === 'board' ? <>
          <label className="tc-row tc-small"><input type="checkbox" checked={cols} onChange={(e) => setCols(e.target.checked)} /> Dạng cột</label>
          <label className="tc-row tc-small"><input type="checkbox" checked={cycle} onChange={(e) => setCycle(e.target.checked)} /> Tự chuyển tab</label>
        </> : null}
        <label className="tc-row tc-small"><input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)} data-testid="tv-hide-names" /> Ẩn tên</label>
        <button type="button" className="tc-btn tc-btn--sm" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Toàn màn hình</button>
      </nav>
      {d.kind === 'chat' ? (
        <div className="tc-chatgrid is-tv">{d.rooms.map((r) => <ChatPane key={r.id} d={d} roomId={r.id} posts={all} big hideNames={hideNames} />)}</div>
      ) : cols ? (
        <div className="tc-dcols">{d.tabs.map((t) => <section key={t.id} className="tc-dcol" style={{ ['--tab' as string]: t.color }}><h3>{t.name}</h3>{visible(byTab[t.id] ?? []).map(card)}</section>)}</div>
      ) : (
        <div className="tc-dgrid">{visible(byTab[tabId] ?? []).map(card)}</div>
      )}
    </div>
  );
}
