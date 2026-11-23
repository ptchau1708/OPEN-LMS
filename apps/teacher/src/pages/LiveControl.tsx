import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Item, LiveTeam, Profile } from '@openedu/contracts';
import { Icon, Mascot, QrCode } from '@openedu/ui';
import { LiveResultsBar, computeLiveStats, lessonMascot, resolveSlideItem } from '@openedu/lesson-player';
import { lessonItemIds, useAward, useClass, useItemsByIds, useLesson, useLiveChannel, usePackages } from '@openedu/data';
import { Avatar, Btn, ConfirmBar, ErrorNote, Loading, Seg } from '../components/common';
import { SlideThumb } from '../components/SlideThumb';
import { cx, layoutMeta } from '../lib/format';
import { learnerUrl, presentUrl } from '../lib/env';
import { defaultTeams, teamsFor, useTeamsStore } from '../lib/teams';
import { GameControl } from './live/GameControl';

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, [on]);
  return now;
}

export default function LiveControl({ user }: { user: Profile }) {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const view = useLiveChannel(sessionId, 'teacher');
  const { channel, state, responses, participants, status, error } = view;
  const lessonQ = useLesson(state && !state.lesson ? state.lessonId : undefined);
  const lesson = state?.lesson ?? lessonQ.data ?? null;
  const fetched = useItemsByIds(state?.items ? undefined : lessonItemIds(lesson));
  const items: Record<string, Item> = useMemo(() => ({ ...(fetched.data ?? {}), ...(state?.items ?? {}) }), [fetched.data, state?.items]);
  const pk = usePackages();
  const packages = useMemo(() => Object.fromEntries((pk.data ?? []).map((p) => [p.id, p])), [pk.data]);
  const cls = useClass(params.get('lop') ?? user.classId);
  const localTeams = useTeamsStore((s) => s.byClass);
  const award = useAward();

  const [timer, setTimer] = useState(30);
  const [sheet, setSheet] = useState<null | 'teams' | 'stars' | 'join'>(null);
  const [target, setTarget] = useState<{ kind: 'team' | 'student'; id: string } | null>(null);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendErr, setSendErr] = useState<unknown>(null);
  const [toast, setToast] = useState('');
  const teamMap = useRef<Record<string, string>>({});

  const send = (cmd: Parameters<NonNullable<typeof channel>['send']>[0]) => {
    if (!channel) return Promise.resolve();
    setSendErr(null);
    return channel.send(cmd).catch((e: unknown) => setSendErr(e));
  };
  const now = useNow(!!state?.timerEndsAt);

  // HS vào sau khi đã chia đội theo tổ: tự xếp vào tổ.
  useEffect(() => {
    if (!state || !channel) return;
    for (const p of state.participants) {
      const t = teamMap.current[p.userId];
      if (t && p.teamId !== t && state.teams.some((x) => x.id === t)) void channel.send({ type: 'assign-team', userId: p.userId, teamId: t });
    }
  }, [state, channel]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(t); }, [toast]);

  if (!sessionId) return null;
  if (!state) {
    return (
      <div className="tc-page tc-live">
        {status === 'error' ? <ErrorNote error={new Error(error ?? 'Không kết nối được lớp học trực tiếp.')} /> : <Loading label={error ?? 'Đang kết nối lớp học…'} />}
        <p className="tc-muted tc-small">Chế độ demo cần máy chủ lớp học đang chạy (<code>pnpm relay</code>). <Link to="/truc-tiep">Mở lớp khác</Link></p>
      </div>
    );
  }

  if (state.game || params.get('choi')) return <GameControl user={user} view={view} lesson={lesson} items={items} cls={cls.data ?? undefined} />;

  const slides = lesson?.slides ?? [];
  const slide = slides[state.slideIndex];
  const item = slide?.layout === 'activity' ? resolveSlideItem(slide, items) : undefined;
  const itemResponses = item ? responses.filter((r) => r.itemId === item.id) : [];
  const stats = item ? computeLiveStats(item, itemResponses) : null;
  const online = participants.length ? participants : state.participants;
  const answeredIds = new Set(itemResponses.map((r) => r.userId));
  const left = state.timerEndsAt ? Math.max(0, Math.ceil((new Date(state.timerEndsAt).getTime() - now) / 1000)) : null;
  const tvUrl = presentUrl(state.sessionId);
  const joinUrl = learnerUrl(state.pin);
  const ended = state.phase === 'ended';
  const go = (i: number) => void send({ type: 'go', slideIndex: i });

  const applyTeams = (teams: LiveTeam[], map: Record<string, string>) => {
    teamMap.current = map;
    void (async () => {
      await send({ type: 'set-teams', teams });
      for (const p of state.participants) if (map[p.userId]) await send({ type: 'assign-team', userId: p.userId, teamId: map[p.userId] });
    })();
    setSheet(null);
    setToast(`Đã chia ${teams.length} đội`);
  };
  const fromClass = () => {
    const t = teamsFor(cls.data, localTeams).filter((x) => x.studentIds.length);
    const map: Record<string, string> = {};
    t.forEach((x) => x.studentIds.forEach((id) => (map[id] = x.id)));
    applyTeams(t.map((x) => ({ id: x.id, name: x.name, color: x.color, stars: state.teams.find((o) => o.id === x.id)?.stars ?? 0 })), map);
  };
  const quickSplit = (n: number) => {
    const t = defaultTeams(n, `live-${n}`);
    const map: Record<string, string> = {};
    online.forEach((p, i) => (map[p.userId] = t[i % n].id));
    applyTeams(t.map((x) => ({ id: x.id, name: x.name, color: x.color, stars: 0 })), map);
  };
  const giveStars = (n: number) => {
    if (!target) return;
    void send({ type: 'award', target, stars: n });
    if (target.kind === 'student') award.mutate({ userId: target.id, stars: n, coins: n, xp: n * 10, reason: 'Thầy cô thưởng trong lớp học trực tiếp', sourceType: 'live', sourceId: state.sessionId });
    const name = target.kind === 'team' ? state.teams.find((t) => t.id === target.id)?.name : online.find((p) => p.userId === target.id)?.name;
    setToast(`+${n} sao cho ${name ?? ''}`);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(tvUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setToast('Không sao chép được — giữ ngón tay lên link để chép.'); }
  };

  return (
    <div className="tc-live">
      <header className="tc-live__head">
        <div className="tc-live__pin">
          <small>Mã vào lớp</small>
          <strong aria-label={`Mã ${state.pin.split('').join(' ')}`}>{state.pin.slice(0, 3)}<i /> {state.pin.slice(3)}</strong>
        </div>
        <div className="tc-live__links">
          <span className={cx('tc-conn', `is-${status}`)}><i />{status === 'open' ? 'Đã kết nối' : status === 'connecting' ? 'Đang nối…' : status === 'error' ? 'Lỗi kết nối' : 'Đã đóng'}</span>
          <div className="tc-row">
            <a className="tc-btn tc-btn--default tc-btn--sm" href={tvUrl} target="_blank" rel="noreferrer"><Icon name="tv" size={16} /><span>Mở trên TV</span></a>
            <Btn size="sm" onClick={() => void copy()}>{copied ? 'Đã chép' : 'Chép link'}</Btn>
            <Btn size="sm" icon="qr" onClick={() => setSheet(sheet === 'join' ? null : 'join')}>QR</Btn>
          </div>
        </div>
      </header>
      {error && status !== 'open' ? <ErrorNote error={new Error(error)} /> : null}
      <ErrorNote error={sendErr} />

      {sheet === 'join' ? (
        <section className="tc-card tc-joincard">
          <QrCode value={joinUrl} size={168} title="Mã QR cho học sinh vào lớp" />
          <div><strong>Học sinh quét mã để vào lớp</strong><p className="tc-muted tc-small">hoặc mở Góc học tập → “Vào lớp” và nhập mã <b>{state.pin}</b></p><code className="tc-small">{joinUrl}</code></div>
        </section>
      ) : null}

      <section className="tc-card tc-live__people">
        <div className="tc-row"><Icon name="team" size={18} /><strong>{online.length}</strong><span className="tc-muted">học sinh đang trong lớp</span></div>
        <div className="tc-avatars">
          {online.slice(0, 40).map((p) => {
            const team = state.teams.find((t) => t.id === p.teamId);
            return <span key={p.userId} className="tc-avatars__one" style={team ? { boxShadow: `0 0 0 2px ${team.color}` } : undefined}><Avatar mascot={p.mascot} color={p.color} size={30} title={`${p.name}${team ? ` · ${team.name}` : ''}${state.studentStars[p.userId] ? ` · ${state.studentStars[p.userId]}★` : ''}`} /></span>;
          })}
          {!online.length ? <span className="tc-muted tc-small">Chờ học sinh vào…</span> : null}
        </div>
        {state.teams.length ? (
          <div className="tc-teamscore">{state.teams.map((t) => <span key={t.id} style={{ borderColor: t.color }}><i style={{ background: t.color }} />{t.name} <b>{t.stars}★</b></span>)}</div>
        ) : null}
      </section>

      {ended ? (
        <section className="tc-card tc-stack tc-center">
          <Mascot id={lesson ? lessonMascot(lesson) : 'nghe'} mood="cheer" size={96} />
          <h2>Đã kết thúc buổi học</h2>
          <p className="tc-muted">{online.length} học sinh tham gia{state.teams.length ? ` · ${state.teams.map((t) => `${t.name}: ${t.stars}★`).join(' · ')}` : ''}</p>
          <div className="tc-row tc-wrap"><Btn kind="primary" onClick={() => nav('/truc-tiep')}>Mở lớp khác</Btn><Btn onClick={() => nav('/')}>Về Tổng quan</Btn></div>
        </section>
      ) : (
        <div className="tc-live__grid">
          <section className="tc-card tc-live__now">
            <header className="tc-row tc-wrap">
              <span className="tc-chip">{state.phase === 'lobby' ? 'Phòng chờ' : `Slide ${state.slideIndex + 1}/${slides.length}`}</span>
              {slide ? <span className="tc-muted tc-small">{layoutMeta(slide.layout).label}</span> : null}
              {state.locked ? <span className="tc-chip tc-chip--warn"><Icon name="lock" size={12} /> Đang khóa màn hình HS</span> : null}
            </header>
            <h2 className="tc-live__title">{slide?.title || (lesson?.title ?? '')}</h2>
            {slide ? <div className="tc-live__thumb"><SlideThumb slide={slide} items={items} packages={packages} mascot={lesson ? lessonMascot(lesson) : undefined} width={320} /></div> : null}
            {slide?.teacherNotes ? <div className="tc-live__notes"><Icon name="pencil" size={16} /><p>{slide.teacherNotes}</p></div> : null}
            <ol className="tc-live__strip" aria-label="Chuyển nhanh tới slide">
              {slides.map((s, i) => (
                <li key={s.id}><button type="button" className={cx(i === state.slideIndex && state.phase !== 'lobby' && 'is-on')} onClick={() => go(i)} title={s.title}>{i + 1}</button></li>
              ))}
            </ol>
          </section>

          <section className="tc-live__controls">
            {state.phase === 'lobby' ? (
              <Btn kind="primary" size="lg" icon="play" className="tc-bigbtn" onClick={() => go(0)}>Bắt đầu bài giảng</Btn>
            ) : null}

            {item ? (
              <div className="tc-card tc-stack">
                <div className="tc-row tc-wrap">
                  <strong>Hoạt động</strong>
                  {left !== null && state.phase === 'activity-open' ? <span className={cx('tc-timer', left <= 5 && 'is-low')}>{left}s</span> : null}
                  <span className="tc-muted tc-small">{state.phase === 'activity-open' ? 'Đang mở' : state.phase === 'activity-closed' ? 'Đã đóng' : state.phase === 'reveal' ? 'Đã hiện đáp án' : 'Chưa mở'}</span>
                </div>
                {state.phase !== 'activity-open' ? (
                  <>
                    <Seg label="Thời gian" size="lg" value={timer} onChange={setTimer} options={[{ value: 0, label: 'Không giờ' }, { value: 15, label: '15 giây' }, { value: 30, label: '30 giây' }, { value: 60, label: '60 giây' }]} />
                    <Btn kind="primary" size="lg" className="tc-bigbtn" onClick={() => void send({ type: 'open', itemId: item.id, ...(timer ? { seconds: timer } : {}) })}>{state.phase === 'slide' ? 'Mở hoạt động' : 'Mở lại'}</Btn>
                  </>
                ) : <Btn size="lg" className="tc-bigbtn" onClick={() => void send({ type: 'close' })}>Đóng</Btn>}
                <Btn size="lg" className="tc-bigbtn" disabled={state.phase === 'reveal' || state.phase === 'slide'} onClick={() => void send({ type: 'reveal' })}>Hiện đáp án</Btn>

                <div className="tc-live__results">
                  <div className="tc-stats tc-stats--sm">
                    <div><strong>{stats?.answered ?? 0}/{online.length}</strong><span>đã trả lời</span></div>
                    {stats?.graded ? <div><strong>{stats.correct}</strong><span>đúng</span></div> : null}
                  </div>
                  {itemResponses.length ? <KidResults item={item} responses={itemResponses} total={online.length} reveal={state.phase === 'reveal'} /> : null}
                  {online.length && state.phase !== 'slide' ? (
                    <p className="tc-small tc-muted">Chưa trả lời: {online.filter((p) => !answeredIds.has(p.userId)).map((p) => p.name).join(', ') || 'không còn ai'}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="tc-card tc-stack">
              <label className="tc-switch tc-switch--big"><input type="checkbox" checked={state.locked} onChange={(e) => void send({ type: 'lock', locked: e.target.checked })} /> Khóa màn hình HS <small className="tc-muted">“Nhìn lên bảng nhé!”</small></label>
              <div className="tc-row">
                <Btn icon="team" className="tc-grow" onClick={() => setSheet(sheet === 'teams' ? null : 'teams')} aria-expanded={sheet === 'teams'}>Chia đội</Btn>
                <Btn icon="star" className="tc-grow" onClick={() => setSheet(sheet === 'stars' ? null : 'stars')} aria-expanded={sheet === 'stars'}>Thưởng sao</Btn>
              </div>
              {sheet === 'teams' ? (
                <div className="tc-subpanel">
                  <Btn kind="primary" disabled={!teamsFor(cls.data, localTeams).some((t) => t.studentIds.length)} onClick={fromClass}>Theo tổ của lớp {cls.data?.name ?? ''}</Btn>
                  <span className="tc-muted tc-small">Chia nhanh các bạn đang trong lớp:</span>
                  <div className="tc-row">{[2, 3, 4].map((n) => <Btn key={n} className="tc-grow" onClick={() => quickSplit(n)}>{n} đội</Btn>)}</div>
                  {state.teams.length ? <Btn kind="ghost" onClick={() => { teamMap.current = {}; void send({ type: 'set-teams', teams: [] }); setSheet(null); }}>Bỏ chia đội</Btn> : null}
                </div>
              ) : null}
              {sheet === 'stars' ? (
                <div className="tc-subpanel">
                  {state.teams.length ? (
                    <div className="tc-targets">{state.teams.map((t) => <button key={t.id} type="button" aria-pressed={target?.kind === 'team' && target.id === t.id} onClick={() => setTarget({ kind: 'team', id: t.id })} style={{ borderColor: t.color }}><i style={{ background: t.color }} />{t.name} · {t.stars}★</button>)}</div>
                  ) : null}
                  <div className="tc-targets">{online.map((p) => <button key={p.userId} type="button" aria-pressed={target?.kind === 'student' && target.id === p.userId} onClick={() => setTarget({ kind: 'student', id: p.userId })}><Avatar mascot={p.mascot} color={p.color} size={22} />{p.name}{state.studentStars[p.userId] ? ` · ${state.studentStars[p.userId]}★` : ''}</button>)}</div>
                  {!online.length && !state.teams.length ? <span className="tc-muted tc-small">Chưa có học sinh hay đội nào.</span> : null}
                  <div className="tc-row">{[1, 2, 3].map((n) => <Btn key={n} kind="primary" className="tc-grow" disabled={!target} onClick={() => giveStars(n)}>+{n} ★</Btn>)}</div>
                </div>
              ) : null}
            </div>

            <div className="tc-card">
              {ending ? <ConfirmBar text="Kết thúc buổi học cho cả lớp?" confirmLabel="Kết thúc" onCancel={() => setEnding(false)} onConfirm={() => { setEnding(false); void send({ type: 'end' }); }} /> : <Btn kind="danger" className="tc-grow tc-w100" icon="stop" onClick={() => setEnding(true)}>Kết thúc</Btn>}
            </div>
          </section>
        </div>
      )}

      {!ended ? (
        <nav className="tc-live__nav" aria-label="Chuyển slide">
          <Btn size="lg" icon="back" disabled={state.phase === 'lobby' || state.slideIndex <= 0} onClick={() => go(state.slideIndex - 1)}>Trước</Btn>
          <span className="tc-live__pos">{state.phase === 'lobby' ? '—' : `${state.slideIndex + 1}/${slides.length}`}</span>
          <Btn size="lg" kind="primary" disabled={state.phase !== 'lobby' && state.slideIndex >= slides.length - 1} onClick={() => go(state.phase === 'lobby' ? 0 : state.slideIndex + 1)}>Tiếp <Icon name="next" size={20} /></Btn>
        </nav>
      ) : null}
      {toast ? <div className="tc-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function KidResults(props: { item: Item; responses: Parameters<typeof LiveResultsBar>[0]['responses']; total: number; reveal: boolean }) {
  return <div className="k-shell k-shell--plain tc-kidresults"><LiveResultsBar item={props.item} responses={props.responses} total={props.total} reveal={props.reveal} size="md" /></div>;
}
