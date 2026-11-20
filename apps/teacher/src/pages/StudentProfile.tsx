import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ATTENDANCE_LABEL, MASCOT_BY_ID, MASTERY_LEVEL_LABEL, SKILL_BY_CODE, SUBJECTS, TT27_COMPETENCY_LABEL, TT27_QUALITY_LABEL, TT27_TERM_LABEL, type Profile, type StudentProfile as StudentProfileData, type SubjectId, type TimelineKind, type Tt27Competency, type Tt27Quality } from '@openedu/contracts';
import { fmtScore } from '@openedu/data';
import { LevelBadge, MockBadge } from '../lib/assess';
import { Icon, Mascot } from '@openedu/ui';
import { useParentSummary, useStudentProfile } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Loading, Seg } from '../components/common';
import { cx, fmtDate, fmtDateTime, relTime } from '../lib/format';
import { LevelBar, LevelLegend, LevelSwatch, pct } from '../lib/mastery';
import { useRemediate } from '../lib/remediate';
import { DuelStatsBlock } from '../components/DuelStats';
import { ExternalActivitiesCard } from '../components/ExternalActivities';
import { ProfileDash } from './ProfileDash';

const KIND_LABEL: Record<TimelineKind, string> = { lesson: 'Bài giảng', practice: 'Luyện tập', arena: 'Leo tháp', live: 'Lớp trực tiếp', reward: 'Phần thưởng', remediation: 'Ôn tập', work: 'Bài làm', behavior: 'Thi đua' };
const KIND_ICON: Record<TimelineKind, 'book' | 'pencil' | 'tower' | 'tv' | 'gift' | 'retry'> = { lesson: 'book', practice: 'pencil', arena: 'tower', live: 'tv', reward: 'gift', remediation: 'retry', work: 'pencil', behavior: 'gift' };
const STATUS_LABEL = { 'chua-bat-dau': 'Chưa bắt đầu', 'dang-hoc': 'Đang học', 'hoan-thanh': 'Hoàn thành' } as const;

export default function StudentProfile({ user }: { user: Profile }) {
  const { studentId = '' } = useParams();
  const nav = useNavigate();
  const q = useStudentProfile(studentId);
  const [parent, setParent] = useState(false);
  const summary = useParentSummary(parent ? studentId : undefined);
  const [kind, setKind] = useState<TimelineKind | 'all'>('all');
  const r = useRemediate(user);
  const p = q.data;
  const timeline = useMemo(() => (p?.timeline ?? []).filter((t) => kind === 'all' || t.kind === kind), [p, kind]);
  const kinds = useMemo(() => Array.from(new Set((p?.timeline ?? []).map((t) => t.kind))), [p]);

  if (q.isLoading) return <Loading />;
  if (q.error || !p) return <div className="tc-page"><ErrorNote error={q.error ?? new Error('Không tìm thấy học sinh.')} onRetry={() => void q.refetch()} /></div>;
  const s = p.student;
  const companion = MASCOT_BY_ID[p.passport.companion];

  return (
    <div className="tc-page tc-profile">
      <div className="tc-row tc-wrap tc-noprint">
        <Btn kind="ghost" icon="back" size="sm" onClick={() => nav(p.class ? `/hoc-sinh?c=${p.class.id}` : '/hoc-sinh')}>Danh sách học sinh</Btn>
        <span className="tc-ebar__spacer" />
        <label className="tc-switch"><input type="checkbox" checked={parent} onChange={(e) => setParent(e.target.checked)} /> Xem như phụ huynh</label>
        <Btn size="sm" icon="upload" onClick={() => window.print()}>In cho họp phụ huynh</Btn>
      </div>

      <header className="tc-card tc-phead">
        <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={72} />
        <div className="tc-phead__main">
          <h1>{s.name}</h1>
          <p className="tc-muted">
            {p.class ? <>Lớp {p.class.name}{p.class.teacherName ? ` · GVCN ${p.class.teacherName}` : ''}{p.class.team ? <> · <span className="tc-teamtag" style={{ background: p.class.team.color }}>{p.class.team.name}</span></> : null}</> : 'Chưa vào lớp'}
            {s.username ? ` · ${s.username}` : ''}
            {s.externalCode ? ` · Mã HS ${s.externalCode}` : ''}{p.class ? <> · <Link to={`/xuat-nhap?lop=${p.class.id}&tab=codes`}>{s.externalCode ? 'sửa mã' : 'thêm mã HS'}</Link></> : null}
          </p>
        </div>
        <dl className="tc-pstats">
          <div><dt>Cấp</dt><dd>{p.wallet.level}</dd></div>
          <div><dt>Sao</dt><dd><Icon name="star" size={16} /> {p.wallet.stars}</dd></div>
          <div><dt>Chuỗi ngày</dt><dd><Icon name="flame" size={16} /> {p.wallet.streakDays}</dd></div>
          <div className="tc-pstats__mascot"><dt>Bạn đồng hành</dt><dd><Mascot id={p.passport.companion} size={30} /> {companion?.name}</dd></div>
        </dl>
      </header>

      {!parent ? <ProfileDash p={p} /> : null}

      {parent ? (
        <section className="tc-card tc-parentview" aria-live="polite">
          <header className="tc-card__head"><h2><Icon name="parent" size={18} /> Phụ huynh sẽ thấy</h2><span className="tc-muted tc-small">Lời lẽ đơn giản, không thuật ngữ</span></header>
          {summary.isLoading ? <Loading /> : summary.data ? (
            <>
              <p className="tc-parentview__head">{summary.data.headline}</p>
              {summary.data.sentences.filter((x) => x !== summary.data!.headline && !summary.data!.gaps.some((g) => g.sentence === x)).map((x, i) => <p key={i}>{x}</p>)}
              {summary.data.gaps.map((g) => (
                <div key={g.skillCode} className="tc-parentgap"><p>{g.sentence}</p><ul>{g.suggestions.map((x) => <li key={x}>{x}</li>)}</ul></div>
              ))}
              <p className="tc-muted tc-small">Tuần này: {summary.data.week.daysActive} ngày học · {summary.data.week.answered} câu{summary.data.week.correctRate !== null ? ` · đúng ${pct(summary.data.week.correctRate)}` : ''} · {summary.data.week.stars} sao · {summary.data.week.lessonsCompleted} bài xong</p>
            </>
          ) : <ErrorNote error={summary.error} />}
        </section>
      ) : null}

      <div className="tc-grid2">
        <section className="tc-card">
          <header className="tc-card__head"><h2>Mức thành thạo</h2><LevelLegend /></header>
          <ul className="tc-subjbars">
            {p.mastery.bySubject.map((m) => {
              const counts = { ...m.counts, 'chua-hoc': Math.max(m.counts['chua-hoc'] ?? 0, m.total - (m.counts.vung + m.counts['dang-hoc'] + m.counts['can-on'])) };
              return (
                <li key={m.subject}>
                  <span className="tc-subjbars__name">{SUBJECTS[m.subject]?.name ?? m.subject}</span>
                  <LevelBar counts={counts} total={m.total || undefined} />
                  <span className="tc-small tc-muted">{m.counts.vung} vững · {m.counts['dang-hoc']} đang học · <b className="tc-warn">{m.counts['can-on']} cần ôn</b> / {m.total}</span>
                </li>
              );
            })}
          </ul>
          {p.class ? <p className="tc-small tc-noprint"><Link to={`/lop/${p.class.id}/ban-do-kien-thuc`}>Xem bản đồ kiến thức của lớp</Link></p> : null}
        </section>

        <section className="tc-card">
          <header className="tc-card__head"><h2>Điểm mạnh</h2></header>
          {!p.strengths.length ? <p className="tc-muted tc-small">Chưa có kĩ năng nào ở mức vững.</p> : (
            <ul className="tc-strengths">{p.strengths.map((x) => <li key={x.skillCode}><LevelSwatch level="vung" /><span>{x.short}</span><small className="tc-muted">{pct(x.p)}</small></li>)}</ul>
          )}
          <h3 className="tc-h3">Lớp học trực tiếp</h3>
          <div className="tc-stats tc-stats--3">
            <div><strong>{p.live.sessions}</strong><span>buổi tham gia</span></div>
            <div><strong>{p.live.answered}</strong><span>câu trả lời</span></div>
            <div><strong>{p.live.answered ? pct(p.live.correct / p.live.answered) : '—'}</strong><span>trả lời đúng</span></div>
          </div>
          {p.live.lastAt ? <p className="tc-muted tc-small">Lần gần nhất: {relTime(p.live.lastAt)}</p> : null}
          <DuelStatsBlock studentId={studentId} />
        </section>
      </div>

      <section className="tc-card">
        <header className="tc-card__head"><h2>Lỗ hổng cần quan tâm</h2><span className="tc-muted tc-small">Ưu tiên cao trước</span></header>
        {!p.gaps.length ? <Empty icon="check" title="Không có lỗ hổng nào">Em đang học đều các kĩ năng đã làm.</Empty> : (
          <ul className="tc-gaps">
            {p.gaps.map((g) => {
              const set = p.remediation.find((x) => x.skillCode === g.skillCode || x.rootSkill === g.rootSkill);
              const key = `gap:${g.skillCode}`;
              return (
                <li key={g.skillCode}>
                  <div className="tc-gaps__top">
                    <LevelSwatch level={g.level} />
                    <strong>{SKILL_BY_CODE[g.skillCode]?.short ?? g.skillCode}</strong>
                    <span className="tc-muted tc-small">{MASTERY_LEVEL_LABEL[g.level]} · đúng {pct(g.p)} · {g.attempts} lần</span>
                  </div>
                  {g.rootChain.length > 1 ? (
                    <p className="tc-small"><span className="tc-muted">Gốc rễ: </span>{g.rootChain.map((c, i) => <span key={c}>{i ? ' ← ' : ''}<span className={cx(c === g.rootSkill && 'tc-rootname')}>{SKILL_BY_CODE[c]?.short ?? c}</span></span>)}</p>
                  ) : null}
                  {g.topMisconceptions.length ? <ul className="tc-miscs">{g.topMisconceptions.slice(0, 2).map((m) => <li key={m.code}><strong>{m.count}×</strong> {m.text}</li>)}</ul> : null}
                  <div className="tc-row tc-wrap tc-small">
                    {set ? <span className="tc-chip">{set.kind === 'review' ? 'Ôn lại' : 'Bộ ôn'} · chặng {set.reviewStage}/3 · {new Date(set.dueAt).getTime() <= Date.now() ? 'đến hạn' : `hẹn ${fmtDate(set.dueAt)}`}</span> : <span className="tc-chip">Chưa có bộ ôn</span>}
                    {set && p.class ? <Btn size="sm" className="tc-noprint" disabled={!!r.busy} onClick={() => void r.run({ key, title: set.title, note: set.reason, itemIds: set.itemIds, studentIds: [s.id], classId: p.class!.id, subject: set.subject, grade: p.class!.grade }, 'assign')}>Giao bộ ôn</Btn> : null}
                    {r.done[key] ? <span className="tc-ok">{r.done[key]}</span> : null}
                  </div>
                  <ErrorNote error={r.errorFor(key)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <WorkSection p={p} />
      <div className="tc-grid2">
        <BehaviorSection p={p} />
        <AttendanceSection p={p} />
      </div>
      <Tt27Section p={p} />
      <ExternalActivitiesCard studentId={studentId} />
      <section className="tc-card">
        <header className="tc-card__head"><h2>Bài giảng và bài được giao</h2></header>
        {!p.lessons.length ? <p className="tc-muted tc-small">Chưa có bài nào.</p> : (
          <div className="tc-tablewrap">
            <table className="tc-table">
              <thead><tr><th>Bài</th><th>Môn</th><th>Trạng thái</th><th>Tiến độ</th><th>Sao</th><th>Hạn</th></tr></thead>
              <tbody>
                {p.lessons.map((l) => (
                  <tr key={`${l.assignmentId ?? ''}${l.lessonId}`}>
                    <td>{l.title}</td>
                    <td>{SUBJECTS[l.subject]?.name}</td>
                    <td><span className={cx('tc-chip', l.status === 'hoan-thanh' && 'tc-chip--ok', l.status === 'dang-hoc' && 'tc-chip--warn')}>{STATUS_LABEL[l.status]}</span></td>
                    <td><span className="tc-progress" role="img" aria-label={pct(l.progress)}><i style={{ width: pct(l.progress) }} /></span> <small>{pct(l.progress)}</small></td>
                    <td>{l.starsEarned}</td>
                    <td className="tc-small">{l.completedAt ? `Xong ${fmtDate(l.completedAt)}` : l.dueAt ? fmtDateTime(l.dueAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tc-card">
        <header className="tc-card__head">
          <h2>Dòng thời gian</h2>
          <Seg label="Lọc hoạt động" value={kind} onChange={setKind} options={[{ value: 'all' as const, label: 'Tất cả' }, ...kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
        </header>
        {!timeline.length ? <p className="tc-muted tc-small">Chưa có hoạt động.</p> : (
          <ol className="tc-timeline">
            {timeline.map((t, i) => (
              <li key={`${t.at}${i}`} className={`tc-timeline--${t.kind}`}>
                <span className="tc-timeline__icon"><Icon name={KIND_ICON[t.kind]} size={15} /></span>
                <span className="tc-timeline__main"><strong>{t.title}</strong>{t.detail ? <small className="tc-muted"> · {t.detail}</small> : null}{t.offline ? <span className="tc-chip tc-chip--offline" title="Em làm khi mất mạng; kết quả được đồng bộ sau">làm khi mất mạng</span> : null}</span>
                {t.stars ? <span className="tc-small"><Icon name="star" size={13} /> {t.stars}</span> : null}
                <small className="tc-muted tc-timeline__at">{KIND_LABEL[t.kind]} · {fmtDateTime(t.at)}</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="tc-muted tc-small tc-printonly">Hồ sơ tạo lúc {fmtDateTime(p.generatedAt)} — OPEN-EDU.</p>
    </div>
  );
}

const TREND = { 'tien-bo': 'Đang tiến bộ', 'on-dinh': 'Ổn định', giam: 'Cần quan tâm' } as const;

function WorkSection({ p }: { p: StudentProfileData }) {
  const w = p.work;
  return (
    <section className="tc-card">
      <header className="tc-card__head">
        <h2>Bài viết</h2>
        <span className="tc-row tc-wrap tc-small">
          {(['T', 'H', 'C'] as const).map((l) => <span key={l} className="tc-row"><LevelBadge level={l} /> {w.counts[l]}</span>)}
          {w.trend ? <span className={cx('tc-chip', w.trend === 'tien-bo' && 'tc-chip--ok', w.trend === 'giam' && 'tc-chip--warn')}>{TREND[w.trend]}</span> : null}
          {w.pending ? <Link className="tc-noprint" to={`/cham-bai?lop=${p.class?.id ?? ''}`}>{w.pending} bài chờ duyệt</Link> : null}
        </span>
      </header>
      {!w.latest.length ? <p className="tc-muted tc-small">Chưa có bài viết nào được duyệt.</p> : (
        <ul className="tc-worklist">
          {w.latest.map((e) => (
            <li key={e.submissionId}>
              <Link to={`/cham-bai/${e.submissionId}?lop=${p.class?.id ?? ''}&tab=da-duyet`} className="tc-worklist__thumb" aria-label={`Mở bài ${e.title}`}>
                {e.thumbnail ? <img src={e.thumbnail} alt="" /> : <Icon name="pencil" size={20} />}
              </Link>
              <div className="tc-worklist__main">
                <div className="tc-row tc-wrap"><LevelBadge level={e.level} /><strong>{e.title}</strong><span className="tc-small tc-muted">{SUBJECTS[e.subject]?.name} · {fmtScore(e.total)}/{e.max} · {fmtDate(e.at)}</span>{e.edited ? <span className="tc-chip">GV đã sửa</span> : null}{e.mock ? <MockBadge /> : null}</div>
                <p className="tc-small">{e.comment}</p>
                {e.teacherComment ? <p className="tc-small tc-muted tc-noprint">Ghi chú GV: {e.teacherComment}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BehaviorSection({ p }: { p: StudentProfileData }) {
  const b = p.behavior;
  return (
    <section className="tc-card">
      <header className="tc-card__head"><h2>Thi đua</h2><span className="tc-small tc-muted">7 ngày qua</span></header>
      {!b ? <p className="tc-muted tc-small">Lớp chưa ghi thi đua.</p> : (
        <>
          <div className="tc-stats tc-stats--3">
            <div><strong>{b.weekPoints > 0 ? `+${b.weekPoints}` : b.weekPoints}</strong><span>điểm tuần</span></div>
            <div><strong>{b.weekPositive}</strong><span>lần được khen</span></div>
            <div><strong>{b.weekNeedsWork}</strong><span>lần nhắc nhở</span></div>
          </div>
          {b.topPositive.length ? <p className="tc-small"><span className="tc-muted">Hay được khen: </span>{b.topPositive.join(', ')}</p> : null}
          {b.topNeedsWork.length ? <p className="tc-small"><span className="tc-muted">Cần cố gắng: </span>{b.topNeedsWork.join(', ')}</p> : null}
          <ul className="tc-bhrecent">{b.recent.slice(0, 5).map((r, i) => <li key={i}><span>{r.icon}</span><span className="tc-grow">{r.label}</span><b className={r.points < 0 ? 'tc-warn' : 'tc-ok'}>{r.points > 0 ? `+${r.points}` : r.points}</b><small className="tc-muted">{fmtDate(r.at)}</small></li>)}</ul>
        </>
      )}
    </section>
  );
}

function AttendanceSection({ p }: { p: StudentProfileData }) {
  const a = p.attendance;
  return (
    <section className="tc-card">
      <header className="tc-card__head"><h2>Chuyên cần</h2><span className="tc-small tc-muted">30 ngày gần nhất</span></header>
      {!a ? <p className="tc-muted tc-small">Chưa có điểm danh.</p> : (
        <>
          <div className="tc-stats">
            <div><strong>{a.rate === null ? '—' : pct(a.rate)}</strong><span>có mặt ({a.present}/{a.days})</span></div>
            <div><strong>{a.late}</strong><span>đi muộn</span></div>
            <div><strong>{a.excused}</strong><span>vắng có phép</span></div>
            <div><strong className={a.unexcused ? 'tc-warn' : ''}>{a.unexcused}</strong><span>vắng không phép</span></div>
          </div>
          {a.recentAbsences.length ? <p className="tc-small"><span className="tc-muted">Gần đây: </span>{a.recentAbsences.map((x) => `${fmtDate(x.date)} (${ATTENDANCE_LABEL[x.status].toLowerCase()})`).join(' · ')}</p> : <p className="tc-small tc-ok">Đi học đầy đủ.</p>}
        </>
      )}
    </section>
  );
}

function Tt27Section({ p }: { p: StudentProfileData }) {
  const t = p.tt27;
  return (
    <section className="tc-card">
      <header className="tc-card__head">
        <h2>Nhận xét TT27{t ? ` — ${TT27_TERM_LABEL[t.termId]} ${t.schoolYear}` : ''}</h2>
        {t ? <span className={cx('tc-chip', t.status === 'final' && 'tc-chip--ok')}>{t.status === 'final' ? 'Chính thức' : 'Nháp'}</span> : null}
      </header>
      {!t ? <p className="tc-muted tc-small">Chưa có nhận xét định kì. <Link className="tc-noprint" to={`/tt27?lop=${p.class?.id ?? ''}`}>Soạn nhận xét</Link></p> : (
        <>
          <ul className="tc-tt27subj">
            {(Object.keys(t.subjects) as SubjectId[]).map((k) => {
              const r = t.subjects[k]!;
              return <li key={k}><LevelBadge level={r.level} /><strong>{SUBJECTS[k]?.name}</strong>{r.score !== undefined ? <span className="tc-small tc-muted">KTĐK {fmtScore(r.score)}</span> : null}<p className="tc-small">{r.comment}</p></li>;
            })}
          </ul>
          <p className="tc-small"><span className="tc-muted">Phẩm chất: </span>{(Object.keys(t.qualities) as Tt27Quality[]).map((k) => `${TT27_QUALITY_LABEL[k]} ${t.qualities[k]}`).join(' · ')}</p>
          {Object.keys(t.competencies).length ? <p className="tc-small"><span className="tc-muted">Năng lực: </span>{(Object.keys(t.competencies) as Tt27Competency[]).map((k) => `${TT27_COMPETENCY_LABEL[k]} ${t.competencies[k]}`).join(' · ')}</p> : null}
          {t.generalComment ? <p>{t.generalComment}</p> : null}
        </>
      )}
    </section>
  );
}
