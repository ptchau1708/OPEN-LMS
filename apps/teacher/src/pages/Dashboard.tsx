import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ATTENDANCE_LABEL, MASTERY_LEVEL_LABEL, SUBJECTS, type AttendanceStatus, type ClassInfo, type MascotId, type MasteryLevel, type Profile, type SubmissionStatus } from '@openedu/contracts';
import { Icon, Mascot, type IconName } from '@openedu/ui';
import { useAssignments, useAttendance, useClassGarden, useClassHeatmap, useClassLeaderboard, useEvents, useExams, useLessons, useStudents, useSubmissions } from '@openedu/data';
import { useClasses } from '../lib/focusGrade';
import { Avatar, Empty, Loading, Seg, SubjectDot } from '../components/common';
import { cx, fmtDate, relTime } from '../lib/format';
import { useTodayWork, type ClassWork } from '../lib/todayWork';
import { C, tint } from '../lib/nav';

/** Biến màu cho một ô: --c (đậm) và --c-soft (nhạt). */
const cvars = (c?: string) => (c ? ({ ['--c' as string]: c, ['--c-soft' as string]: tint(c, 0.14) } as CSSProperties) : undefined);
import '../styles/dashboard.css';

/* ======================= tiện ích ======================= */
const DAY_MS = 86_400_000;
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LEVELS: MasteryLevel[] = ['vung', 'dang-hoc', 'can-on', 'chua-hoc'];
const LV_CLASS: Record<MasteryLevel, string> = { vung: 'vung', 'dang-hoc': 'dang', 'can-on': 'canon', 'chua-hoc': 'chua' };
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pctText = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
function greet(): string {
  const h = new Date().getHours();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

/* ======================= mảnh ghép giao diện ======================= */
export function Tile({ icon, label, value, sub, to, tone, color }: { icon: IconName; label: string; value: ReactNode; sub?: ReactNode; to?: string; tone?: 'warn' | 'ok'; color?: string }) {
  const body = (
    <>
      <span className="db-tile__icon"><Icon name={icon} size={18} /></span>
      <span className="db-tile__label">{label}</span>
      <strong className="db-tile__value">{value}</strong>
      {sub ? <small className="db-tile__sub">{sub}</small> : null}
    </>
  );
  const cls = cx('db-tile', tone && `db-tile--${tone}`, color && 'db-tile--color');
  return to ? <Link to={to} className={cls} style={cvars(color)}>{body}</Link> : <div className={cls} style={cvars(color)}>{body}</div>;
}

export function Card({ title, sub, link, children, wide }: { title: string; sub?: string; link?: { to: string; label: string }; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cx('tc-card db-card', wide && 'db-card--wide')}>
      <header className="tc-card__head db-card__head">
        <div><h2>{title}</h2>{sub ? <p className="tc-muted tc-small">{sub}</p> : null}</div>
        {link ? <Link to={link.to}>{link.label}</Link> : null}
      </header>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return <ul className="db-legend">{items.map((i) => <li key={i.label}><i className={i.cls} aria-hidden="true" />{i.label}</li>)}</ul>;
}

/** Thanh ngang chồng theo 4 mức thành thạo. */
export function LevelBar({ counts, label }: { counts: Record<MasteryLevel, number>; label: string }) {
  const total = LEVELS.reduce((s, l) => s + (counts[l] ?? 0), 0);
  const text = LEVELS.filter((l) => counts[l]).map((l) => `${MASTERY_LEVEL_LABEL[l]}: ${counts[l]}`).join(' · ');
  return (
    <div className="db-stack" role="img" aria-label={`${label} — ${text || 'chưa có dữ liệu'}`} title={text}>
      {total ? LEVELS.map((l) => (counts[l] ? <i key={l} className={`db-lv db-lv--${LV_CLASS[l]}`} style={{ flexGrow: counts[l] }} /> : null)) : <i className="db-lv db-lv--chua" style={{ flexGrow: 1 }} />}
    </div>
  );
}

function Ring({ value, label, center }: { value: number; label: string; center: ReactNode }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="db-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="db-ring__track" />
        <circle cx="50" cy="50" r={r} className="db-ring__fill" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <span className="db-ring__center">{center}</span>
    </div>
  );
}

/* ======================= biểu đồ hoạt động 14 ngày ======================= */
interface DayStat { date: Date; correct: number; wrong: number; other: number; users: number }

function ActivityChart({ days }: { days: DayStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.correct + d.wrong));
  const todayKey = localKey(new Date());
  const h = hover === null ? null : days[hover];
  const sum = days.reduce((a, d) => ({ c: a.c + d.correct, w: a.w + d.wrong }), { c: 0, w: 0 });
  return (
    <div className="db-act">
      <div className="db-act__top">
        <Legend items={[{ cls: 'db-lv db-lv--vung', label: 'Trả lời đúng' }, { cls: 'db-lv db-lv--canon', label: 'Chưa đúng' }]} />
        <p className="db-readout" aria-live="polite">
          {h ? <><strong>{WD[h.date.getDay()]} {h.date.getDate()}/{h.date.getMonth() + 1}</strong> · {h.correct} đúng · {h.wrong} chưa đúng · {h.users} em học</>
            : <>14 ngày: <strong>{sum.c + sum.w}</strong> câu trả lời · đúng {pctText(sum.c + sum.w ? sum.c / (sum.c + sum.w) : null)}</>}
        </p>
      </div>
      <div className="db-cols" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const total = d.correct + d.wrong;
          return (
            <button key={i} type="button" className={cx('db-col', localKey(d.date) === todayKey && 'is-today', hover === i && 'is-hover')}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${WD[d.date.getDay()]} ${d.date.getDate()}/${d.date.getMonth() + 1}: ${d.correct} đúng, ${d.wrong} chưa đúng, ${d.users} em học`}>
              <span className="db-col__bar" style={{ height: `${(total / max) * 100}%` }}>
                {d.wrong ? <i className="db-lv db-lv--canon" style={{ flexGrow: d.wrong }} /> : null}
                {d.correct ? <i className="db-lv db-lv--vung" style={{ flexGrow: d.correct }} /> : null}
              </span>
              <small>{WD[d.date.getDay()]}<br />{d.date.getDate()}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= bảng theo lớp ======================= */
const SUB_GROUPS: { key: string; label: string; statuses: SubmissionStatus[]; cls: string }[] = [
  { key: 'review', label: 'Chờ thầy/cô duyệt', statuses: ['graded', 'needs-review'], cls: 'db-bar--warn' },
  { key: 'grading', label: 'Máy đang chấm', statuses: ['submitted', 'grading'], cls: 'db-bar--info' },
  { key: 'done', label: 'Đã duyệt', statuses: ['approved'], cls: 'db-bar--ok' },
  { key: 'returned', label: 'Trả lại làm tiếp', statuses: ['returned'], cls: 'db-bar--muted' },
  { key: 'error', label: 'Lỗi khi chấm', statuses: ['error'], cls: 'db-bar--danger' },
];

function HBar({ label, value, max, cls, right, to }: { label: ReactNode; value: number; max: number; cls?: string; right?: ReactNode; to?: string }) {
  const row = (
    <>
      <span className="db-hbar__label">{label}</span>
      <span className="db-hbar__track"><i className={cx('db-bar', cls)} style={{ width: `${max ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0}%` }} /></span>
      <span className="db-hbar__val">{right ?? value}</span>
    </>
  );
  return to ? <Link to={to} className="db-hbar">{row}</Link> : <div className="db-hbar">{row}</div>;
}

function ClassBoard({ cls }: { cls: ClassInfo }) {
  const students = useStudents(cls.id);
  const events = useEvents({ limit: 2000 });
  const hm = useClassHeatmap(cls.id);
  const assignments = useAssignments({ classId: cls.id });
  const subs = useSubmissions({ classId: cls.id });
  const from30 = useMemo(() => localKey(new Date(Date.now() - 30 * DAY_MS)), []);
  const attendance = useAttendance(cls.id, { from: from30 });
  const board = useClassLeaderboard(cls.id);
  const garden = useClassGarden(cls.id);
  const exams = useExams({ classId: cls.id });

  const list = useMemo(() => students.data ?? [], [students.data]);
  const ids = useMemo(() => new Set(list.map((s) => s.id)), [list]);
  const n = list.length;

  /* --- hoạt động --- */
  const act = useMemo(() => {
    const today = dayStart(new Date());
    const days: DayStat[] = Array.from({ length: 14 }, (_, i) => ({ date: new Date(today.getTime() - (13 - i) * DAY_MS), correct: 0, wrong: 0, other: 0, users: 0 }));
    const usersPerDay = days.map(() => new Set<string>());
    const weekUsers = new Set<string>();
    const lastSeen = new Map<string, number>();
    const completedBy = new Map<string, Set<string>>();
    let wC = 0; let wW = 0; let offline = 0;
    for (const e of events.data ?? []) {
      if (!ids.has(e.userId)) continue;
      const t = new Date(e.at).getTime();
      if (t > (lastSeen.get(e.userId) ?? 0)) lastSeen.set(e.userId, t);
      if (e.verb === 'completed') {
        for (const k of [e.assignmentId, e.lessonId, e.objectId]) if (k) { if (!completedBy.has(k)) completedBy.set(k, new Set()); completedBy.get(k)!.add(e.userId); }
      }
      const idx = Math.floor((dayStart(new Date(t)).getTime() - days[0]!.date.getTime()) / DAY_MS);
      if (idx < 0 || idx > 13) continue;
      const d = days[idx]!;
      usersPerDay[idx]!.add(e.userId);
      const inWeek = idx >= 7;
      if (inWeek) { weekUsers.add(e.userId); if (e.offline) offline++; }
      if (e.verb === 'answered' && e.result?.correct === true) { d.correct++; if (inWeek) wC++; }
      else if (e.verb === 'answered' && e.result?.correct === false) { d.wrong++; if (inWeek) wW++; }
      else d.other++;
    }
    days.forEach((d, i) => { d.users = usersPerDay[i]!.size; });
    return { days, weekUsers, lastSeen, completedBy, weekAcc: wC + wW ? wC / (wC + wW) : null, weekAnswers: wC + wW, offline };
  }, [events.data, ids]);

  /* --- thành thạo --- */
  const mastery = useMemo(() => {
    const d = hm.data;
    const total: Record<MasteryLevel, number> = { vung: 0, 'dang-hoc': 0, 'can-on': 0, 'chua-hoc': 0 };
    if (!d) return { total, weakest: [], gaps: [] as { s: (typeof d extends undefined ? never : NonNullable<typeof d>)['students'][number]; n: number; names: string[] }[], has: false };
    const gradeSkills = d.skills.filter((k) => k.grade === d.grade);
    const skills = gradeSkills.length ? gradeSkills : d.skills;
    for (const s of d.students) for (const k of skills) total[d.cells[s.id]?.[k.code]?.level ?? 'chua-hoc']++;
    const weakest = d.skills
      .map((k) => ({ k, sum: d.skillSummary[k.code] }))
      .filter((x) => x.sum && (x.sum.counts['can-on'] > 0 || x.sum.counts['dang-hoc'] > 0))
      .sort((a, b) => b.sum!.counts['can-on'] - a.sum!.counts['can-on'] || (a.sum!.avgP ?? 1) - (b.sum!.avgP ?? 1))
      .slice(0, 5);
    const gaps = d.students.map((s) => {
      const g = d.skills.filter((k) => d.cells[s.id]?.[k.code]?.level === 'can-on');
      return { s, n: g.length, names: g.slice(0, 3).map((x) => x.short) };
    }).filter((r) => r.n).sort((a, b) => b.n - a.n).slice(0, 5);
    const has = total.vung + total['dang-hoc'] + total['can-on'] > 0;
    return { total, weakest, gaps, has };
  }, [hm.data]);

  /* --- chấm bài --- */
  const subStat = useMemo(() => {
    const by = SUB_GROUPS.map((g) => ({ ...g, n: (subs.data ?? []).filter((s) => g.statuses.includes(s.status)).length }));
    return { by, max: Math.max(1, ...by.map((b) => b.n)), review: by[0]!.n, total: (subs.data ?? []).length };
  }, [subs.data]);

  /* --- chuyên cần --- */
  const att = useMemo(() => {
    const recs = [...(attendance.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
    const rows = recs.map((r) => {
      const c: Record<AttendanceStatus, number> = { 'co-mat': 0, muon: 0, 'vang-co-phep': 0, 'vang-khong-phep': 0 };
      Object.values(r.entries).forEach((s) => { c[s]++; });
      const total = Object.values(c).reduce((a, b) => a + b, 0);
      return { date: r.date, c, total, rate: total ? (c['co-mat'] + c.muon) / total : null };
    });
    const today = rows.find((r) => r.date === localKey(new Date()));
    const all = rows.reduce((a, r) => ({ p: a.p + r.c['co-mat'] + r.c.muon, t: a.t + r.total }), { p: 0, t: 0 });
    return { rows, today, rate: all.t ? all.p / all.t : null };
  }, [attendance.data]);

  /* --- giao bài --- */
  const asg = useMemo(() => (assignments.data ?? []).slice().sort((a, b) => b.openAt.localeCompare(a.openAt)).slice(0, 5).map((a) => {
    const target = a.studentIds.length ? a.studentIds.filter((id) => ids.has(id)) : [...ids];
    const done = new Set([...(act.completedBy.get(a.id) ?? []), ...(act.completedBy.get(a.targetId) ?? [])]);
    const late = !!a.dueAt && new Date(a.dueAt).getTime() < Date.now();
    return { a, total: target.length, done: target.filter((id) => done.has(id)).length, late };
  }), [assignments.data, ids, act.completedBy]);

  const inactive = useMemo(() => list.filter((s) => !act.weekUsers.has(s.id)).map((s) => ({ s, last: act.lastSeen.get(s.id) })).sort((a, b) => (a.last ?? 0) - (b.last ?? 0)), [list, act]);
  const rank = board.data ? (board.data.mode === 'team' && board.data.teams.length ? board.data.teams : board.data.students).slice().filter((r) => r.points > 0).sort((a, b) => b.points - a.points).slice(0, 5) : [];
  const rankMax = Math.max(1, ...rank.map((r) => r.points));
  const examList = (exams.data ?? []).slice().sort((a, b) => b.openAt.localeCompare(a.openAt)).slice(0, 4);
  const examState = (e: { status: string; openAt: string; closeAt: string }) => {
    const now = Date.now();
    if (e.status !== 'published') return { t: 'Nháp', c: '' };
    if (now < new Date(e.openAt).getTime()) return { t: 'Sắp mở', c: 'tc-chip--info' };
    if (now <= new Date(e.closeAt).getTime()) return { t: 'Đang mở', c: 'tc-chip--ok' };
    return { t: 'Đã đóng', c: '' };
  };

  if (students.isLoading) return <Loading />;

  return (
    <>
      {/* ---------- chỉ số chính ---------- */}
      <section className="db-tiles" aria-label={`Chỉ số chính lớp ${cls.name}`}>
        <Tile color={C.sky} icon="team" label="Sĩ số" value={n} sub={cls.teams.length ? `${cls.teams.length} tổ` : 'Chưa chia tổ'} to={`/lop?c=${cls.id}`} />
        <Tile color={C.teal} icon="clock" label="Học trong 7 ngày" value={<>{act.weekUsers.size}<em>/{n}</em></>} sub={n ? `${n - act.weekUsers.size} em chưa học` : 'Chưa có học sinh'} tone={n && act.weekUsers.size < n / 2 ? 'warn' : undefined} />
        <Tile color={C.green} icon="check" label="Trả lời đúng" value={pctText(act.weekAcc)} sub={`${act.weekAnswers} câu trong 7 ngày`} />
        <Tile color={C.amber} icon="eye" label="Bài chờ duyệt" value={subStat.review} sub={subStat.review ? 'Bấm để chấm' : 'Không còn bài chờ'} to="/cham-bai" tone={subStat.review ? 'warn' : undefined} />
        <Tile color={C.violet} icon="passport" label="Chuyên cần" value={pctText(att.rate)} sub={att.today ? `Hôm nay vắng ${att.today.c['vang-co-phep'] + att.today.c['vang-khong-phep']} em` : 'Hôm nay chưa điểm danh'} to="/diem-danh" />
        <Tile color={C.orange} icon="star" label="Sao cả lớp tuần này" value={garden.data?.classStars ?? '—'} sub={garden.data ? `Mục tiêu ${garden.data.goal.targetStars} sao` : undefined} to="/vuon-lop" />
      </section>

      <div className="db-grid">
        {/* ---------- hoạt động ---------- */}
        <Card wide title="Hoạt động học tập 14 ngày" sub="Số câu trả lời mỗi ngày của học sinh trong lớp. Rê chuột vào cột để xem chi tiết.">
          {events.isLoading ? <Loading /> : <ActivityChart days={act.days} />}
          {act.offline ? <p className="tc-muted tc-small">Trong 7 ngày có {act.offline} hoạt động làm khi mất mạng, đã đồng bộ sau.</p> : null}
        </Card>

        {/* ---------- thành thạo ---------- */}
        <Card title="Mức thành thạo kiến thức" sub={`Toán lớp ${cls.grade} — mỗi ô là một em × một kĩ năng`} link={{ to: `/lop/${cls.id}/ban-do-kien-thuc`, label: 'Bản đồ kiến thức' }}>
          {hm.isLoading ? <Loading /> : !mastery.has ? <p className="tc-muted">Chưa có dữ liệu. Khi học sinh làm bài, biểu đồ sẽ hiện mức thành thạo từng kĩ năng.</p> : (
            <>
              <LevelBar counts={mastery.total} label="Phân bố mức thành thạo cả lớp" />
              <Legend items={LEVELS.map((l) => ({ cls: `db-lv db-lv--${LV_CLASS[l]}`, label: `${MASTERY_LEVEL_LABEL[l]} ${mastery.total[l]}` }))} />
              <h3 className="db-h3">Kĩ năng cả lớp còn yếu nhất</h3>
              {!mastery.weakest.length ? <p className="tc-muted tc-small">Chưa có kĩ năng nào cần ôn.</p> : (
                <ul className="db-skills">
                  {mastery.weakest.map(({ k, sum }) => (
                    <li key={k.code}>
                      <span className="db-skills__name" title={k.topic}>{k.short}</span>
                      <LevelBar counts={sum!.counts} label={k.short} />
                      <span className="db-skills__n" title="Số em cần ôn">{sum!.counts['can-on']} em</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {/* ---------- cần chú ý ---------- */}
        <Card title="Học sinh cần chú ý" sub="Em có nhiều kĩ năng cần ôn và em chưa học trong 7 ngày">
          <h3 className="db-h3 db-h3--first">Nhiều lỗ hổng kiến thức</h3>
          {!mastery.gaps.length ? <p className="tc-muted tc-small">Chưa em nào có lỗ hổng.</p> : (
            <ul className="tc-attn">
              {mastery.gaps.map(({ s, n: g, names }) => (
                <li key={s.id}>
                  <Link to={`/hoc-sinh/${s.id}`} className="tc-attn__row">
                    <Avatar mascot={s.avatarMascot as MascotId} color={s.avatarColor} size={28} />
                    <span className="tc-attn__name"><strong>{s.name}</strong><small className="tc-muted">{names.join(' · ')}</small></span>
                    <span className="tc-gapcount" title={`${g} kĩ năng cần ôn`}>{g}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3 className="db-h3">Chưa học trong 7 ngày ({inactive.length})</h3>
          {!n ? <p className="tc-muted tc-small">Lớp chưa có học sinh.</p> : !inactive.length ? <p className="tc-muted tc-small">Cả lớp đều đã học tuần này.</p> : (
            <div className="tc-chips">
              {inactive.slice(0, 12).map(({ s, last }) => (
                <Link key={s.id} to={`/hoc-sinh/${s.id}`} className="tc-chip tc-chip--student" title={last ? `Học lần cuối ${relTime(new Date(last).toISOString())}` : 'Chưa học lần nào'}>
                  <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={18} />{s.name}
                </Link>
              ))}
              {inactive.length > 12 ? <span className="tc-muted tc-small">+{inactive.length - 12} em</span> : null}
            </div>
          )}
        </Card>

        {/* ---------- giao bài ---------- */}
        <Card title="Bài đã giao" sub="Số em hoàn thành trên số em được giao" link={{ to: '/giao-bai', label: 'Giao bài' }}>
          {assignments.isLoading ? <Loading /> : !asg.length ? <p className="tc-muted">Chưa giao bài nào cho lớp này.</p> : (
            <div className="db-hbars">
              {asg.map(({ a, total, done, late }) => (
                <HBar key={a.id} max={total} value={done} cls={done >= total && total ? 'db-bar--ok' : late ? 'db-bar--warn' : undefined}
                  label={<><strong>{a.title}</strong><small className="tc-muted">{a.dueAt ? `${late ? 'Đã hết hạn' : 'Hạn'} ${fmtDate(a.dueAt)}` : 'Không hạn'}</small></>}
                  right={<>{done}<em>/{total}</em></>} />
              ))}
            </div>
          )}
        </Card>

        {/* ---------- chấm bài ---------- */}
        <Card title="Bài viết & chấm bài" sub={`${subStat.total} bài nộp của lớp`} link={{ to: '/cham-bai', label: 'Chấm bài' }}>
          {subs.isLoading ? <Loading /> : !subStat.total ? <p className="tc-muted">Chưa có bài nộp. Giao bài viết ở mục Bài viết để học sinh chụp ảnh hoặc gõ bài làm.</p> : (
            <div className="db-hbars db-hbars--compact">
              {subStat.by.filter((b) => b.n || b.key !== 'error').map((b) => <HBar key={b.key} label={b.label} value={b.n} max={subStat.max} cls={b.cls} to={b.key === 'review' && b.n ? '/cham-bai' : undefined} />)}
            </div>
          )}
        </Card>

        {/* ---------- chuyên cần ---------- */}
        <Card title="Chuyên cần" sub="10 buổi điểm danh gần nhất" link={{ to: '/diem-danh', label: 'Điểm danh' }}>
          {attendance.isLoading ? <Loading /> : !att.rows.length ? <p className="tc-muted">Chưa điểm danh buổi nào trong 30 ngày qua.</p> : (
            <>
              <div className="db-att" role="img" aria-label={`Tỉ lệ có mặt: ${att.rows.map((r) => `${r.date.slice(8)}/${r.date.slice(5, 7)} ${pctText(r.rate)}`).join(', ')}`}>
                {att.rows.map((r) => {
                  const absent = r.c['vang-co-phep'] + r.c['vang-khong-phep'];
                  const tip = (Object.keys(r.c) as AttendanceStatus[]).filter((k) => r.c[k]).map((k) => `${ATTENDANCE_LABEL[k]}: ${r.c[k]}`).join(' · ');
                  return (
                    <div key={r.date} className="db-att__col" title={`${r.date.slice(8)}/${r.date.slice(5, 7)} — ${tip}`}>
                      <span className="db-att__bar">
                        {absent ? <i className="db-lv db-lv--canon" style={{ flexGrow: absent }} /> : null}
                        {r.c.muon ? <i className="db-lv db-lv--dang" style={{ flexGrow: r.c.muon }} /> : null}
                        {r.c['co-mat'] ? <i className="db-lv db-lv--vung" style={{ flexGrow: r.c['co-mat'] }} /> : null}
                      </span>
                      <small>{r.date.slice(8)}/{r.date.slice(5, 7)}</small>
                    </div>
                  );
                })}
              </div>
              <Legend items={[{ cls: 'db-lv db-lv--vung', label: 'Có mặt' }, { cls: 'db-lv db-lv--dang', label: 'Đi muộn' }, { cls: 'db-lv db-lv--canon', label: 'Vắng' }]} />
            </>
          )}
        </Card>

        {/* ---------- thi đua ---------- */}
        <Card title="Thi đua tuần này" sub={board.data?.mode === 'team' && board.data.teams.length ? 'Điểm theo tổ' : 'Năm em dẫn đầu'} link={{ to: '/thi-dua', label: 'Thi đua' }}>
          {board.isLoading ? <Loading /> : !rank.length ? <p className="tc-muted">Tuần này chưa ghi điểm thi đua.</p> : (
            <div className="db-hbars db-hbars--compact">
              {rank.map((r, i) => <HBar key={r.id} label={<><span className="db-rank">{i + 1}</span>{r.name}</>} value={Math.max(0, r.points)} max={rankMax} right={`${r.points} điểm`} />)}
            </div>
          )}
        </Card>

        {/* ---------- vườn lớp ---------- */}
        <Card title="Vườn lớp" sub="Sao cả lớp góp trong tuần để trồng cây" link={{ to: '/vuon-lop', label: 'Vườn lớp & huy hiệu' }}>
          {garden.isLoading ? <Loading /> : !garden.data ? <p className="tc-muted">Chưa có dữ liệu vườn lớp.</p> : (
            <div className="db-garden">
              <Ring value={garden.data.progress} label={`Vườn lớp đạt ${Math.round(garden.data.progress * 100)}% mục tiêu tuần`} center={<><strong>{Math.round(garden.data.progress * 100)}%</strong><small>mục tiêu</small></>} />
              <div>
                <p><strong>{garden.data.classStars}</strong> / {garden.data.goal.targetStars} sao</p>
                <p className="tc-muted tc-small">{garden.data.progress >= 1 ? 'Cả lớp đã đạt mục tiêu tuần này!' : `Còn ${Math.max(0, garden.data.goal.targetStars - garden.data.classStars)} sao nữa là cây ra quả.`}</p>
                <p className="tc-muted tc-small">{garden.data.plots.filter((p) => p.stars > 0).length}/{garden.data.plots.length} {garden.data.teamMode ? 'tổ' : 'em'} đã góp sao</p>
              </div>
            </div>
          )}
        </Card>

        {/* ---------- kiểm tra ---------- */}
        <Card title="Đề kiểm tra" link={{ to: '/de-kiem-tra', label: 'Đề kiểm tra' }}>
          {exams.isLoading ? <Loading /> : !examList.length ? <p className="tc-muted">Chưa có đề kiểm tra cho lớp này.</p> : (
            <ul className="db-exams">
              {examList.map((e) => {
                const st = examState(e);
                return (
                  <li key={e.id}>
                    <Link to={e.status === 'published' ? `/de-kiem-tra/${e.id}/ket-qua` : `/de-kiem-tra/${e.id}/sua`}>
                      <span><strong>{e.title}</strong><small className="tc-muted">{(SUBJECTS[e.subject] ?? SUBJECTS.khac).name} · {e.durationMin} phút · mở {fmtDate(e.openAt)}</small></span>
                      <span className={cx('tc-chip', st.c)}>{st.t}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

/* ======================= việc hôm nay ======================= */
interface Todo { key: string; icon: IconName; color: string; n: number; label: string; doneLabel: string; to: string; per: (c: ClassWork) => number; value?: ReactNode }

function TodayPanel() {
  const w = useTodayWork();
  const t = w.total;
  const many = w.classes.length > 1;
  const todos: Todo[] = [
    { key: 'review', icon: 'eye', color: C.amber, n: t.review, label: 'bài viết chờ chấm hoặc duyệt', doneLabel: 'Chấm bài', to: '/cham-bai', per: (c) => c.review },
    { key: 'att', icon: 'clock', color: C.teal, n: t.attendanceTodo, label: many ? 'lớp chưa điểm danh hôm nay' : 'Chưa điểm danh hôm nay', doneLabel: 'Điểm danh', to: '/diem-danh', per: (c) => (c.attendanceTodo ? 1 : 0), value: many ? undefined : <Icon name="clock" size={22} /> },
    { key: 'msg', icon: 'chat', color: C.pink, n: t.parentUnread, label: 'tin nhắn phụ huynh chưa đọc', doneLabel: 'Tin nhắn phụ huynh', to: '/phu-huynh?the=tin-nhan', per: (c) => c.parentUnread },
    { key: 'queue', icon: 'parent', color: C.violet, n: t.parentQueue, label: 'mục chờ duyệt để gửi phụ huynh', doneLabel: 'Duyệt gửi phụ huynh', to: '/phu-huynh?the=cho-duyet', per: (c) => c.parentQueue },
    { key: 'due', icon: 'check', color: C.green, n: t.dueSoon, label: 'bài giao hết hạn trong 2 ngày', doneLabel: 'Bài sắp hết hạn', to: '/bao-cao-bai-giao', per: (c) => c.dueSoon },
  ];
  const open = todos.filter((x) => x.n > 0);
  const done = todos.filter((x) => x.n === 0);
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return (
    <section className="db-today" aria-labelledby="db-today-h" data-testid="today-work">
      <header className="db-today__head">
        <h2 id="db-today-h">Việc hôm nay</h2>
        <span className="tc-muted">{today}</span>
        <span className="tc-spacer" />
        {w.loading && !open.length ? <span className="tc-muted tc-small">Đang xem…</span> : open.length ? <span className="db-today__count">{open.length} việc cần làm</span> : null}
      </header>
      {open.length ? (
        <div className="db-today__grid">
          {open.map((x) => (
            <Link key={x.key} to={x.to} className={cx('db-todo', `db-todo--${x.key}`)} style={cvars(x.color)} data-testid={`todo-${x.key}`}>
              <span className="db-todo__icon" aria-hidden="true"><Icon name={x.icon} size={18} /></span>
              <span className="db-todo__main">
                {x.value ?? <strong className="db-todo__n">{x.n}</strong>}
                <span className="db-todo__label">{x.label}</span>
                {many ? <small className="db-todo__per">{w.classes.filter((c) => x.per(c) > 0).map((c) => `${c.className}${x.key === 'att' ? '' : `: ${x.per(c)}`}`).join(' · ')}</small> : null}
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      ) : !w.loading ? (
        <p className="db-today__clear"><Icon name="check" size={18} /> Hôm nay chưa có việc gấp. Thầy/cô có thể soạn bài mới hoặc mở lớp trực tiếp.</p>
      ) : null}
      {open.length && done.length ? (
        <p className="db-today__done"><Icon name="check" size={14} /> Đã ổn: {done.map((x) => x.doneLabel).join(' · ')}</p>
      ) : null}
    </section>
  );
}

/* ======================= trang ======================= */
export function Dashboard({ user }: { user: Profile }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const lessons = useLessons(user.role === 'admin' ? {} : { ownerId: user.id });
  const list = classes.data ?? [];
  const cls = list.find((c) => c.id === params.get('c')) ?? list[0];

  return (
    <div className="tc-page db-page">
      <header className="tc-hello">
        <div>
          <h1>{greet()}, {user.name}!</h1>
          <p className="tc-muted">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <Mascot id={user.avatarMascot} mood="wave" size={72} />
      </header>

      <TodayPanel />

      <section className="tc-actions">
        <button type="button" className="tc-action" style={cvars(C.indigo)} onClick={() => nav('/bai-giang?tao=1')}><Icon name="plus" size={22} /><span><strong>Soạn bài giảng mới</strong><small>Slide, hoạt động, trò chơi</small></span></button>
        <button type="button" className="tc-action" style={cvars(C.red)} onClick={() => nav('/truc-tiep')}><Icon name="tv" size={22} /><span><strong>Mở lớp trực tiếp</strong><small>Trình chiếu lên TV, HS trả lời trên máy</small></span></button>
        <button type="button" className="tc-action" style={cvars(C.green)} onClick={() => nav('/giao-bai')}><Icon name="check" size={22} /><span><strong>Giao bài</strong><small>Tự học ở nhà, có hạn nộp</small></span></button>
      </section>

      {classes.isLoading ? <Loading /> : !cls ? (
        <section className="tc-card"><Empty icon="team" title="Chưa có lớp">{user.role === 'admin' ? <>Tạo lớp ở <Link to="/quan-tri/lop">Quản trị → Quản lí lớp</Link>.</> : 'Nhờ quản trị trường phân công lớp cho thầy/cô.'}</Empty></section>
      ) : (
        <>
          <div className="db-classbar">
            <h2>Lớp {cls.name}</h2>
            {list.length > 1 ? <Seg label="Chọn lớp" value={cls.id} onChange={(v) => setParams({ c: v })} options={list.map((c) => ({ value: c.id, label: c.name }))} /> : null}
          </div>
          <ClassBoard key={cls.id} cls={cls} />
        </>
      )}

      <section className="tc-card">
        <header className="tc-card__head"><h2>Bài giảng gần đây</h2><Link to="/bai-giang">Tất cả bài giảng</Link></header>
        {lessons.isLoading ? <Loading /> : !lessons.data?.length ? <Empty title="Chưa có bài giảng">Bấm “Soạn bài giảng mới” để bắt đầu.</Empty> : (
          <ul className="tc-recent">
            {lessons.data.slice(0, 5).map((l) => {
              const s = SUBJECTS[l.subject] ?? SUBJECTS.khac;
              return (
                <li key={l.id}>
                  <Link to={`/bai-giang/${l.id}`} className="tc-recent__row">
                    <SubjectDot colorVar={s.colorVar} />
                    <span className="tc-recent__title">{l.title}</span>
                    <span className="tc-muted tc-small">{s.name} · Lớp {l.grade} · {l.slides.length} slide</span>
                    <span className={`tc-chip ${l.status === 'published' ? 'tc-chip--ok' : ''}`}>{l.status === 'published' ? 'Đã xuất bản' : 'Nháp'}</span>
                    <span className="tc-muted tc-small">{relTime(l.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
