import { ParentDiscuss } from './parent/ParentDiscuss';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import type { Lesson, ParentSummary, Profile, ShareKind, StudentProfile, TimelineKind } from '@openedu/contracts';
import { TT27_LEVEL_LABEL } from '@openedu/contracts';
import { dayKey, qk, useAssignments, useChildren, useClass, useDataSource, useLessons, useParentInbox, useParentSummary, useStudentProfile, useRewards, useSignOut, useWallet } from '@openedu/data';
import { Button, Icon, Mascot } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { Avatar, EmptyState, ErrorState, LoadingScreen, NumberPad } from '../components/Common';
import { useUi } from '../lib/store';
import { dayLabel, dueLabel, timeLabel, useMe } from '../lib/util';
import '../styles/parent.css';
import '../styles/parent5.css';
import { ParentWeek } from './parent/ParentWeek';
import { ParentInbox } from './parent/ParentInbox';
import { NotifyBell } from '../components/NotifyBell';
import '../styles/notify.css';

export default function Parent() {
  const me = useMe();
  const open = useUi((s) => s.parentGateOpen);
  const setGate = useUi((s) => s.setParentGate);
  const isParent = me.role === 'parent';
  if (!isParent && !open) return <ParentGate onPass={() => setGate(true)} />;
  return isParent ? <ParentAccount parent={me} /> : <ParentView child={me} onExitLabel="Thoát chế độ phụ huynh" />;
}

function ParentGate({ onPass }: { onPass: () => void }) {
  const nav = useNavigate();
  const make = () => { const a = 6 + Math.floor(Math.random() * 4); const b = 5 + Math.floor(Math.random() * 5); return { a, b }; };
  const [q, setQ] = useState(make);
  const [v, setV] = useState('');
  const [wrong, setWrong] = useState(false);
  const ok = () => {
    if (Number(v) === q.a + q.b) onPass();
    else { setWrong(true); setV(''); setQ(make()); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setV((x) => (x.length < 2 ? x + e.key : x));
      else if (e.key === 'Backspace') setV((x) => x.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="ln-gate">
      <div className="ln-gate__card">
        <Icon name="parent" size={44} />
        <h1 className="ln-gate__title">Dành cho bố mẹ</h1>
        <p className="ln-gate__text">Để mở chế độ phụ huynh, xin trả lời phép tính:</p>
        <p className="ln-gate__q" aria-live="polite">{q.a} + {q.b} = <span className="ln-gate__ans">{v || '?'}</span></p>
        {wrong && <p className="ln-gate__wrong">Chưa đúng, mời thử phép tính mới.</p>}
        <NumberPad onDigit={(d) => setV((x) => (x.length < 2 ? x + d : x))} onBack={() => setV((x) => x.slice(0, -1))} onOk={ok} okLabel="Mở" okDisabled={!v} />
        <Button variant="ghost" block onClick={() => nav('/toi')}>Quay lại</Button>
      </div>
    </div>
  );
}

function ParentAccount({ parent }: { parent: Profile }) {
  const kids = useChildren(parent.id);
  const [sel, setSel] = useState<string | null>(null);
  if (kids.isPending) return <LoadingScreen label="Đang tải" />;
  if (kids.isError) return <ErrorState message="Chưa tải được thông tin của con." onRetry={() => void kids.refetch()} />;
  const list = kids.data ?? [];
  if (!list.length) return <div className="ln-parent"><EmptyState title="Chưa liên kết với con" text="Bố mẹ nhập mã liên kết 8 kí tự trên phiếu thầy cô gửi về (hoặc quét mã QR trên phiếu)." action={<Link className="k-btn k-btn--primary k-btn--lg" to="/phu-huynh/lien-ket"><span className="k-btn__label">Nhập mã liên kết</span></Link>} /><SignOutRow /></div>;
  const child = list.find((k) => k.id === sel) ?? list[0];
  return <ParentView child={child} siblings={list} onPick={setSel} parent={parent} />;
}

function SignOutRow() {
  const out = useSignOut();
  const nav = useNavigate();
  return <div className="ln-pp-exit"><Button variant="secondary" onClick={() => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true }) })}>Đăng xuất</Button></div>;
}

const TL_ICON: Record<TimelineKind, IconName> = { lesson: 'book', practice: 'pencil', arena: 'tower', live: 'tv', reward: 'star', remediation: 'check', work: 'pencil', behavior: 'star' };

function ParentView({ child, siblings, onPick, parent, onExitLabel }: { child: Profile; siblings?: Profile[]; onPick?: (id: string) => void; parent?: Profile; onExitLabel?: string }) {
  const nav = useNavigate();
  const ds = useDataSource();
  const setGate = useUi((s) => s.setParentGate);
  const out = useSignOut();
  const wallet = useWallet(child.id).data;
  const cls = useClass(child.classId).data;
  const rewards = useRewards(child.id, 300);
  const sumQ = useParentSummary(child.id);
  const profQ = useStudentProfile(child.id);
  const sum = sumQ.data;
  const prof = profQ.data;
  const lessonsQ = useLessons();
  const assigns = useAssignments({ studentId: child.id });
  const lessonIds = (assigns.data ?? []).filter((a) => a.targetType === 'lesson').map((a) => a.targetId);
  const progress = useQueries({ queries: lessonIds.map((id) => ({ queryKey: qk.progress(child.id, id), queryFn: () => ds.getProgress(child.id, id) })) });
  // Tài khoản phụ huynh: thông báo của cô + mục cô cho xem (SQL 23). Chế độ phụ huynh trên máy của con: không có.
  const inbox = useParentInbox(child.id, !!parent);
  const modes = inbox.data?.modes;
  const show = (k: ShareKind) => !modes || modes[k] !== 'off';

  const lessons = useMemo(() => {
    const m: Record<string, Lesson> = {};
    (lessonsQ.data ?? []).forEach((l) => (m[l.id] = l));
    return m;
  }, [lessonsQ.data]);

  const week = useMemo(() => {
    const days: { key: string; label: string; stars: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime()); d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: i === 0 ? 'Nay' : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()], stars: 0 });
    }
    (rewards.data ?? []).forEach((r) => { const x = days.find((d) => d.key === dayKey(r.at)); if (x) x.stars += r.stars; });
    return { days, stars: days.reduce((s, d) => s + d.stars, 0) };
  }, [rewards.data]);
  const w = sum?.week;
  const upcoming = (prof?.remediation ?? []).slice().sort((x, y) => x.dueAt.localeCompare(y.dueAt)).slice(0, 4);
  const maxStars = Math.max(1, ...week.days.map((d) => d.stars));

  const exit = () => {
    if (parent) out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true }) });
    else { setGate(false); nav('/toi'); }
  };

  return (
    <div className="ln-parent">
      <header className="ln-pp-head">
        <div className="ln-pp-head__brand"><Icon name="parent" size={26} /> Chế độ phụ huynh</div>
        <div className="ln-row">
          {parent && <NotifyBell className="ln-bell--pp" />}
          {parent && <Link className="k-btn k-btn--ghost" to="/doi-mat-khau" data-testid="parent-change-pw"><span className="k-btn__label">Đổi mật khẩu</span></Link>}
          <Button variant="secondary" onClick={exit}>{onExitLabel ?? 'Đăng xuất'}</Button>
        </div>
      </header>

      {parent && siblings && (
        <div className="ln-pp-kids" role="tablist" aria-label="Chọn con">
          {siblings.length > 1 && siblings.map((k) => <button key={k.id} type="button" role="tab" aria-selected={k.id === child.id} className={`ln-pp-kid${k.id === child.id ? ' is-on' : ''}`} onClick={() => onPick?.(k.id)}>{k.name}</button>)}
          <Link className="ln-pp-add" to="/phu-huynh/lien-ket"><Icon name="plus" size={18} /> Thêm con</Link>
        </div>
      )}

      <section className="ln-pp-child">
        <Avatar mascot={child.avatarMascot} color={child.avatarColor} size={72} />
        <div>
          <h1 className="ln-pp-name">{child.name}</h1>
          <p className="ln-pp-muted">{cls ? `Lớp ${cls.name}` : child.grade ? `Lớp ${child.grade}` : ''} · Cấp {wallet?.level ?? 1} · {wallet?.stars ?? 0} sao tích lũy</p>
        </div>
      </section>

      {parent && inbox.data ? <ParentInbox child={child} box={inbox.data} /> : null}
      {parent && inbox.isError ? <section className="ln-pp-card"><p className="ln-pp-muted">{(inbox.error as Error).message}</p></section> : null}

      {sumQ.isError ? (
        <section className="ln-pp-card"><p className="ln-pp-muted">Chưa tải được tóm tắt. <button type="button" className="ln-link" onClick={() => void sumQ.refetch()}>Thử lại</button></p></section>
      ) : (
        <>
          {sum && show('study') && <section className="ln-pp-headline"><p className="ln-pp-headline__lead">{sum.headline}</p>{otherSentences(sum).length > 0 && <ul className="ln-pp-sents">{otherSentences(sum).map((t, i) => <li key={i}>{t}</li>)}</ul>}</section>}
          {sum && <SchoolCard sum={sum} prof={prof} />}
          <ParentWeek child={child} showDigest={show('study')} />
          {show('discuss') ? <ParentDiscuss child={child} /> : null}
          {show('study') ? <>
          <h2 className="ln-pp-h ln-pp-h--sec">Tuần này của con</h2>
          <section className="ln-pp-grid">
            <div className="ln-pp-stat"><span className="ln-pp-stat__n">{w ? w.stars : week.stars}</span><span>sao trong tuần</span></div>
            <div className="ln-pp-stat"><span className="ln-pp-stat__n">{w ? w.lessonsCompleted : '–'}</span><span>bài đã hoàn thành</span></div>
            <div className="ln-pp-stat"><span className="ln-pp-stat__n">{w ? w.answered : '–'}</span><span>{w && w.correctRate != null ? `câu đã làm · đúng ${Math.round(w.correctRate * 100)}%` : 'câu đã làm'}</span></div>
            <div className="ln-pp-stat"><span className="ln-pp-stat__n">{w ? `${w.daysActive}/7` : '–'}</span><span>ngày có học · chuỗi {wallet?.streakDays ?? 0} ngày</span></div>
          </section>
          </> : null}
        </>
      )}

      {sum && show('skills') && sum.gaps.length > 0 && (
        <section className="ln-pp-card ln-pp-care">
          <h2 className="ln-pp-h">Điều bố mẹ có thể cùng con luyện</h2>
          {sum.gaps.map((g) => (
            <div key={g.skillCode} className="ln-pp-gap">
              <p className="ln-pp-gap__s">{g.sentence}</p>
              <p className="ln-pp-gap__k">Gợi ý ở nhà</p>
              <ul className="ln-pp-tips">{g.suggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      <div className="ln-pp-two">
        {show('skills') ? <section className="ln-pp-card">
          <h2 className="ln-pp-h">Con đã vững</h2>
          {sum && sum.strengths.length ? <div className="ln-pp-chips">{sum.strengths.map((t) => <span key={t} className="ln-pp-chip"><Icon name="check" size={16} /> {t}</span>)}</div>
            : <p className="ln-pp-muted">{sumQ.isPending ? 'Đang tải…' : 'Con đang tích lũy dần — cứ khuyến khích con học đều mỗi ngày.'}</p>}
        </section> : null}
        {show('assignments') ? <section className="ln-pp-card">
          <h2 className="ln-pp-h">Lịch ôn sắp tới</h2>
          {upcoming.length ? (
            <ul className="ln-pp-list">{upcoming.map((r) => {
              const due = new Date(r.dueAt).getTime() <= Date.now();
              return (
                <li key={r.id} className="ln-pp-row">
                  <span className={`ln-pp-dot${due ? ' is-mid' : ''}`} />
                  <span className="ln-pp-row__main"><strong>{r.title}</strong><span className="ln-pp-muted">{r.itemIds.length} câu · khoảng {r.minutes} phút{r.reviewStage > 0 ? ` · ôn lại lần ${r.reviewStage}/3` : ''}</span></span>
                  <span className="ln-pp-status">{due ? 'Hôm nay' : dayLabel(r.dueAt)}</span>
                </li>
              );
            })}</ul>
          ) : <p className="ln-pp-muted">{profQ.isPending ? 'Đang tải…' : 'Chưa có bài ôn nào được hẹn.'}</p>}
        </section> : null}
      </div>

      {show('study') ? <section className="ln-pp-card">
        <h2 className="ln-pp-h">Sao mỗi ngày</h2>
        <div className="ln-pp-bars" role="img" aria-label={`Sao 7 ngày qua: ${week.days.map((d) => `${d.label} ${d.stars}`).join(', ')}`}>
          {week.days.map((d) => (
            <div key={d.key} className="ln-pp-bar">
              <span className="ln-pp-bar__v">{d.stars || ''}</span>
              <span className="ln-pp-bar__col"><i style={{ height: `${(d.stars / maxStars) * 100}%` }} /></span>
              <span className="ln-pp-bar__l">{d.label}</span>
            </div>
          ))}
        </div>
      </section> : null}

      <div className="ln-pp-two">
        {show('assignments') ? <section className="ln-pp-card">
          <h2 className="ln-pp-h">Bài được giao</h2>
          {assigns.isPending ? <p className="ln-pp-muted">Đang tải…</p> : (assigns.data ?? []).length === 0 ? <p className="ln-pp-muted">Hiện chưa có bài được giao.</p> : (
            <ul className="ln-pp-list">
              {(assigns.data ?? []).map((a) => {
                const i = lessonIds.indexOf(a.targetId);
                const p = i >= 0 ? progress[i]?.data : null;
                const l = lessons[a.targetId];
                const ratio = p?.completedAt ? 1 : l && p ? Math.min(1, p.completedSlides.length / Math.max(1, l.slides.length)) : 0;
                const due = a.dueAt ? dueLabel(a.dueAt) : null;
                const status = ratio >= 1 ? 'Đã xong' : ratio > 0 ? `Đang học ${Math.round(ratio * 100)}%` : 'Chưa bắt đầu';
                return (
                  <li key={a.id} className="ln-pp-row">
                    <span className={`ln-pp-dot${ratio >= 1 ? ' is-ok' : ratio > 0 ? ' is-mid' : ''}`} />
                    <span className="ln-pp-row__main"><strong>{a.title}</strong><span className="ln-pp-muted">{a.dueAt ? `Hạn: ${dayLabel(a.dueAt)}${due && ratio < 1 ? ` (${due.text.toLowerCase()})` : ''}` : 'Không có hạn'}</span></span>
                    <span className={`ln-pp-status${ratio >= 1 ? ' is-ok' : due?.late ? ' is-late' : ''}`}>{status}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section> : null}

        {show('study') ? <section className="ln-pp-card">
          <h2 className="ln-pp-h">Hoạt động gần đây</h2>
          {profQ.isError ? <p className="ln-pp-muted">Chưa tải được hoạt động. <button type="button" className="ln-link" onClick={() => void profQ.refetch()}>Thử lại</button></p> :
            !prof ? <p className="ln-pp-muted">Đang tải…</p> : prof.timeline.length === 0 ? <p className="ln-pp-muted">Chưa có hoạt động nào.</p> : (
              <ul className="ln-pp-list">
                {prof.timeline.slice(0, 8).map((e, i) => (
                  <li key={e.at + i} className="ln-pp-row">
                    <span className="ln-pp-ic"><Icon name={TL_ICON[e.kind] ?? 'star'} size={18} /></span>
                    <span className="ln-pp-row__main"><strong>{e.title}</strong>{e.detail && <span className="ln-pp-muted">{e.detail}</span>}</span>
                    <span className="ln-pp-time ln-pp-time--r">{dayLabel(e.at)}<br />{timeLabel(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
        </section> : null}
      </div>

      <p className="ln-pp-foot"><Mascot id="nghe" size={36} title="" /> Khen con mỗi ngày một chút — con sẽ thích học hơn!</p>
    </div>
  );
}

/** Câu bài làm / thi đua / chuyên cần đã hiện trong thẻ "Ở lớp" (khớp mẫu câu trong data/profile.ts). */
const SCHOOL_PREFIX = ['Bài “', 'Tuần này con được khen', 'Chuyên cần 30 ngày'];
function otherSentences(sum: ParentSummary): string[] {
  return sum.sentences.filter((t) => t !== sum.headline && !SCHOOL_PREFIX.some((p) => t.indexOf(p) === 0));
}

function SchoolCard({ sum, prof }: { sum: ParentSummary; prof?: StudentProfile }) {
  const w = sum.work;
  const b = prof?.behavior;
  const a = prof?.attendance;
  if (!w && !b && !a) return null;
  const late = a ? a.late : 0;
  return (
    <section className="ln-pp-card ln-pp-school">
      <h2 className="ln-pp-h">Ở lớp</h2>
      {w && (
        <div className="ln-pp-work">
          <div className="ln-pp-work__top">
            <span className="ln-pp-ic"><Icon name="pencil" size={18} /></span>
            <span className="ln-pp-row__main"><strong>Bài viết mới nhất: {w.title}</strong><span className="ln-pp-muted">{dayLabel(w.at)}</span></span>
            <span className={`ln-pp-lvl ln-pp-lvl--${w.level}`}>{TT27_LEVEL_LABEL[w.level]}</span>
          </div>
          <p className="ln-pp-work__s">{w.sentence}</p>
          {w.tip && <p className="ln-pp-work__tip"><Icon name="hint" size={18} /> <span><strong>Gợi ý ở nhà:</strong> {w.tip}</span></p>}
        </div>
      )}
      <ul className="ln-pp-list">
        {b && (
          <li className="ln-pp-row">
            <span className="ln-pp-ic"><Icon name="star" size={18} /></span>
            <span className="ln-pp-row__main"><strong>Nề nếp tuần này: {b.weekPoints >= 0 ? '+' : ''}{b.weekPoints} điểm thi đua</strong>
              <span className="ln-pp-muted">{b.weekPositive} lần được khen{b.topPositive[0] ? ` · hay “${b.topPositive[0].toLowerCase()}”` : ''}{b.weekNeedsWork ? ` · ${b.weekNeedsWork} lần nhắc nhở${b.topNeedsWork[0] ? ` (${b.topNeedsWork[0].toLowerCase()})` : ''}` : ''}</span></span>
          </li>
        )}
        {a && a.days > 0 && (
          <li className="ln-pp-row">
            <span className="ln-pp-ic"><Icon name="clock" size={18} /></span>
            <span className="ln-pp-row__main"><strong>Chuyên cần 30 ngày: đi học {a.present + late}/{a.days} buổi</strong>
              <span className="ln-pp-muted">{late || a.excused || a.unexcused ? [late ? `muộn ${late}` : '', a.excused ? `vắng có phép ${a.excused}` : '', a.unexcused ? `vắng không phép ${a.unexcused}` : ''].filter(Boolean).join(' · ') : 'Con đi học đầy đủ, đúng giờ.'}</span></span>
          </li>
        )}
      </ul>
    </section>
  );
}
