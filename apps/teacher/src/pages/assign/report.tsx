/**
 * Báo cáo bài giao + giao lại (docs/BAO_CAO_BAI_GIAO.md).
 * - useAssignmentReports: kết quả máy chấm của các lần giao (learning_events có assignment_id).
 * - AssignmentDetail: điểm từng em, câu sai nhiều, nộp muộn, so sánh các lượt, giao lại, xuất Excel.
 * - RetryDialog: giao lại cùng bài (lượt mới, làm lại từ đầu) cho cả lớp / em chưa đạt / em tự chọn.
 * - AssignReportPage (/bao-cao-bai-giao): báo cáo theo đợt ngày / tuần / tháng / học kì, xuất Excel.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Assignment, Item, LatePolicy, Lesson, Profile } from '@openedu/contracts';
import {
  bridge, buildAssignmentReport, inPeriod, needsRetry, PERIOD_LABEL, periodRange, roundsOf,
  useAssignments, useCreateAssignment, useDataSource, useItemsByIds, useLessons, useStudents,
  type AssignmentReport, type ReportPeriod, type StudentResult,
} from '@openedu/data';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../../components/common';
import { ClassPicker, useClassPick } from '../../lib/assess';
import { cx, fmtDateTime, shorten, toLocalInput } from '../../lib/format';

/** Xuất Excel (mã ghi Excel nằm trong gói cầu nối dữ liệu). */
async function saveXlsx(name: string, build: (m: typeof bridge) => Uint8Array) {
  bridge.downloadBytes(name, build(bridge));
}

/** Kết quả của nhiều lần giao một lúc (một truy vấn). */
export function useAssignmentReports(assignments: Assignment[], students: Pick<Profile, 'id' | 'name'>[], lessons: Lesson[]) {
  const ds = useDataSource();
  const ids = assignments.map((a) => a.id).sort();
  const ev = useQuery({
    queryKey: ['assign-report-events', ids],
    queryFn: () => ds.listEvents({ assignmentIds: ids, limit: 50_000 }),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
  const byLesson = useMemo(() => Object.fromEntries(lessons.map((l) => [l.id, l])), [lessons]);
  const reports = useMemo(() => {
    const m: Record<string, AssignmentReport> = {};
    if (!ev.data) return m;
    for (const a of assignments) m[a.id] = buildAssignmentReport({ assignment: a, lesson: byLesson[a.targetId], students, events: ev.data });
    return m;
  }, [assignments, students, byLesson, ev.data]);
  return { reports, isLoading: ev.isLoading, error: ev.error, refetch: ev.refetch };
}

const STATUS: Record<StudentResult['status'], string> = { 'chua-lam': 'Chưa làm', 'dang-lam': 'Đang làm', 'hoan-thanh': 'Hoàn thành' };
export const roundLabel = (a: Assignment) => ((a.round ?? 1) > 1 ? `Lượt ${a.round}` : 'Lượt 1');

/** Chip trạng thái từng em trên thẻ bài đã giao. */
export function StudentChip({ s, profile }: { s: StudentResult; profile?: Profile }) {
  const cls = s.status === 'hoan-thanh' ? (s.late ? 'tc-chip--warn' : 'tc-chip--ok') : s.overdue ? 'tc-chip--bad' : s.status === 'dang-lam' ? 'tc-chip--warn' : '';
  const label = s.status === 'hoan-thanh' ? `${s.percent ?? 0}%${s.late ? ' · muộn' : ''}` : s.status === 'dang-lam' ? `${s.answered}/${s.total} câu` : s.overdue ? 'Quá hạn' : 'Chưa làm';
  return (
    <span className={cx('tc-chip tc-chip--student', cls)} title={`${s.name}: ${STATUS[s.status]}`}>
      {profile ? <Avatar mascot={profile.avatarMascot} color={profile.avatarColor} size={20} /> : null}
      {s.name} · {label}
    </span>
  );
}

/* --------------------------------- giao lại --------------------------------- */
export function RetryDialog({ base, rounds, report, students, me, onClose, onDone }: {
  base: Assignment; rounds: Assignment[]; report?: AssignmentReport; students: Profile[]; me: Profile; onClose: () => void; onDone: (a: Assignment) => void;
}) {
  const create = useCreateAssignment();
  const weak = report ? needsRetry(report) : [];
  const [who, setWho] = useState<'all' | 'weak' | 'some'>(weak.length && weak.length < students.length ? 'weak' : 'all');
  const [picked, setPicked] = useState<string[]>(weak);
  const [openAt, setOpenAt] = useState(() => toLocalInput(new Date()));
  const [dueAt, setDueAt] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(20, 0, 0, 0); return toLocalInput(d); });
  const [late, setLate] = useState<LatePolicy>(base.latePolicy ?? 'allow');
  const nextRound = Math.max(...rounds.map((r) => r.round ?? 1), 1) + 1;
  const root = rounds[0] ?? base;
  const [title, setTitle] = useState(root.title.replace(/\s*\(lượt \d+\)$/i, ''));
  const ids = who === 'all' ? [] : who === 'weak' ? weak : picked;
  const bad = (who !== 'all' && !ids.length) || !dueAt || new Date(dueAt) < new Date(openAt);
  const submit = () => create.mutate({
    targetType: base.targetType, targetId: base.targetId, title: title.trim() || root.title, classId: base.classId, studentIds: ids,
    openAt: new Date(openAt).toISOString(), dueAt: new Date(dueAt).toISOString(), createdBy: me.id,
    latePolicy: late, parentId: root.id, round: nextRound,
  }, { onSuccess: onDone });
  return (
    <Dialog open title={`Giao lại “${root.title}” — lượt ${nextRound}`} onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" icon="check" disabled={bad || create.isPending} onClick={submit} data-testid="retry-go">{create.isPending ? 'Đang giao…' : `Giao lượt ${nextRound}`}</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-muted tc-small">Học sinh làm lại <strong>từ đầu</strong> (lượt mới). Kết quả các lượt trước vẫn giữ để so sánh.</p>
        <Field label="Tên hiển thị cho HS"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="tc-field">
          <span className="tc-field__label">Giao cho</span>
          <Seg label="Giao cho" value={who} onChange={(v) => { setWho(v); if (v === 'some' && !picked.length) setPicked(weak); }} options={[
            { value: 'all', label: 'Cả lớp' },
            { value: 'weak', label: `Em chưa đạt (${weak.length})` },
            { value: 'some', label: 'Chọn từng em' },
          ]} />
          {who === 'weak' ? <p className="tc-small tc-muted">Chưa xong hoặc dưới 80%: {weak.map((id) => students.find((s) => s.id === id)?.name).filter(Boolean).join(', ') || 'không có em nào'}.</p> : null}
          {who === 'some' ? (
            <div className="tc-pickstudents">
              {students.map((s) => (
                <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}>
                  <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={26} /> {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="tc-grid2 tc-grid2--tight">
          <Field label="Mở lúc"><input className="tc-input" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} /></Field>
          <Field label="Hạn nộp"><input className="tc-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
        </div>
        <LateField value={late} onChange={setLate} />
        <ErrorNote error={create.error} />
      </div>
    </Dialog>
  );
}

export function LateField({ value, onChange }: { value: LatePolicy; onChange: (v: LatePolicy) => void }) {
  return (
    <div className="tc-field">
      <span className="tc-field__label">Khi quá hạn nộp</span>
      <Seg label="Khi quá hạn nộp" value={value} onChange={onChange} options={[{ value: 'allow', label: 'Cho nộp muộn (ghi “muộn”)' }, { value: 'lock', label: 'Khóa bài' }]} />
    </div>
  );
}

/* ------------------------------- chi tiết một lần giao ------------------------------- */
export function AssignmentDetail({ a, all, me, className, onClose }: { a: Assignment; all: Assignment[]; me: Profile; className: string; onClose: () => void }) {
  const rounds = roundsOf(a, all);
  const [cur, setCur] = useState(a.id);
  const [retry, setRetry] = useState(false);
  const students = useStudents(a.classId);
  const lessons = useLessons();
  const rep = useAssignmentReports(rounds, students.data ?? [], lessons.data ?? []);
  const lesson = (lessons.data ?? []).find((l) => l.id === a.targetId);
  const itemIds = rep.reports[cur]?.questions.map((q) => q.itemId) ?? [];
  const items = useItemsByIds(itemIds);
  const label = (id: string) => shorten(((items.data as Record<string, Item> | undefined)?.[id]?.prompt.text) ?? id, 90);
  const r = rep.reports[cur];
  const ca = rounds.find((x) => x.id === cur) ?? a;
  const exportXlsx = () => {
    const list = rounds.map((x) => rep.reports[x.id]).filter((x): x is AssignmentReport => !!x);
    void saveXlsx(`bao-cao-${(rounds[0] ?? a).title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xlsx`, (m) => m.reportXlsx({ title: `Báo cáo “${(rounds[0] ?? a).title}”`, className, reports: list, itemLabel: label }));
  };
  return (
    <Dialog open wide title={`Báo cáo: ${(rounds[0] ?? a).title}`} onClose={onClose} footer={<>
      <Btn icon="upload" disabled={!r} onClick={exportXlsx}>Xuất Excel</Btn>
      <span className="tc-ebar__spacer" />
      <Btn onClick={onClose}>Đóng</Btn>
      <Btn kind="primary" icon="plus" onClick={() => setRetry(true)} data-testid="detail-retry">Giao lại</Btn>
    </>}>
      <div className="tc-stack" data-testid="assign-detail">
        {rounds.length > 1 ? (
          <div className="tc-stack">
            <Seg label="Lượt" value={cur} onChange={setCur} options={rounds.map((x) => ({ value: x.id, label: roundLabel(x) }))} />
            <table className="tc-table tc-table--compact">
              <thead><tr><th>Lượt</th><th>Mở</th><th>Hạn</th><th>Số em</th><th>Hoàn thành</th><th>Điểm TB</th></tr></thead>
              <tbody>{rounds.map((x) => { const s = rep.reports[x.id]?.summary; return <tr key={x.id} className={cx(x.id === cur && 'is-active')}><td>{roundLabel(x)}</td><td>{fmtDateTime(x.openAt)}</td><td>{x.dueAt ? fmtDateTime(x.dueAt) : '—'}</td><td>{s?.assigned ?? '…'}</td><td>{s ? `${s.completed}/${s.assigned}` : '…'}</td><td>{s?.avgPercent ?? '—'}{s?.avgPercent != null ? '%' : ''}</td></tr>; })}</tbody>
            </table>
          </div>
        ) : null}
        <ErrorNote error={rep.error} onRetry={() => void rep.refetch()} />
        {rep.isLoading || students.isLoading ? <Loading /> : !r ? <Empty icon="check" title="Chưa có dữ liệu" /> : (
          <>
            <p className="tc-small tc-muted">Mở {fmtDateTime(ca.openAt)}{ca.dueAt ? ` · Hạn ${fmtDateTime(ca.dueAt)} · ${ca.latePolicy === 'lock' ? 'khóa bài khi quá hạn' : 'cho nộp muộn'}` : ''}{lesson ? ` · ${r.total} câu` : ''}</p>
            <div className="tc-chips">
              <span className="tc-chip">{r.summary.assigned} em được giao</span>
              <span className="tc-chip tc-chip--ok">{r.summary.completed} hoàn thành</span>
              <span className="tc-chip">{r.summary.started - r.summary.completed} đang làm</span>
              <span className="tc-chip tc-chip--warn">{r.summary.late} nộp muộn</span>
              <span className="tc-chip tc-chip--bad">{r.summary.overdue} quá hạn chưa xong</span>
              <span className="tc-chip">Điểm TB {r.summary.avgPercent ?? '—'}{r.summary.avgPercent != null ? '%' : ''}</span>
            </div>
            <div className="tc-grid2">
              <section>
                <h3 className="tc-h3">Từng học sinh</h3>
                <table className="tc-table tc-table--compact" data-testid="detail-students">
                  <thead><tr><th>Học sinh</th><th>Trạng thái</th><th>Điểm</th><th>Đúng ngay</th><th>Xong lúc</th></tr></thead>
                  <tbody>{[...r.students].sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1)).map((s) => (
                    <tr key={s.studentId}>
                      <td>{s.name}</td>
                      <td>{s.overdue ? <span className="tc-bad">Quá hạn</span> : STATUS[s.status]}{s.late ? <span className="tc-warn"> · muộn</span> : null}</td>
                      <td>{s.percent !== null ? `${s.percent}%` : '—'} <span className="tc-muted tc-small">({s.answered}/{s.total})</span></td>
                      <td>{s.answered ? `${s.firstTry}/${s.total}` : '—'}</td>
                      <td className="tc-small">{s.finishedAt ? fmtDateTime(s.finishedAt) : ''}{s.minutes ? <span className="tc-muted"> · {s.minutes}′</span> : null}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </section>
              <section>
                <h3 className="tc-h3">Câu hỏi (sai nhiều lên trước)</h3>
                <ol className="tc-qstats" data-testid="detail-questions">
                  {[...r.questions].sort((x, y) => (x.percent ?? 101) - (y.percent ?? 101)).map((q) => (
                    <li key={q.itemId}>
                      <span className="tc-qstats__bar" style={{ ['--p' as string]: `${q.percent ?? 0}%` }} aria-hidden="true" />
                      <span><strong>Câu {q.index + 1}.</strong> {label(q.itemId)}</span>
                      <span className={cx('tc-small', (q.percent ?? 100) < 50 ? 'tc-bad' : 'tc-muted')}>{q.percent !== null ? `${q.correct}/${q.answered} em đúng (${q.percent}%)` : 'Chưa em nào làm'}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </div>
      {retry && students.data ? <RetryDialog base={a} rounds={rounds} report={rep.reports[rounds[rounds.length - 1]!.id]} students={students.data} me={me} onClose={() => setRetry(false)} onDone={(n) => { setRetry(false); setCur(n.id); }} /> : null}
    </Dialog>
  );
}

/* ------------------------------- báo cáo theo đợt ------------------------------- */
export default function AssignReportPage({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const [period, setPeriod] = useState<ReportPeriod>('tuan');
  const [day, setDay] = useState(() => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
  const range = useMemo(() => periodRange(period, new Date(`${day}T12:00:00+07:00`)), [period, day]);
  const all = useAssignments({ classId: classId || undefined });
  const inRange = useMemo(() => (all.data ?? []).filter((a) => inPeriod(a, range)).sort((x, y) => x.openAt.localeCompare(y.openAt)), [all.data, range]);
  const students = useStudents(classId || undefined);
  const lessons = useLessons();
  const rep = useAssignmentReports(inRange, students.data ?? [], lessons.data ?? []);
  const [detail, setDetail] = useState<Assignment | null>(null);
  const reports = inRange.map((a) => rep.reports[a.id]).filter((x): x is AssignmentReport => !!x);
  const avg = (() => { const v = reports.map((r) => r.summary.avgPercent).filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })();
  const exportXlsx = () => { if (cls) void saveXlsx(`bao-cao-bai-giao-${cls.name}-${period}-${day}.xlsx`, (m) => m.reportXlsx({ title: `Báo cáo bài giao — ${range.label}`, className: cls.name, reports })); };

  if (classes.isLoading) return <Loading />;
  return (
    <div className="tc-page tc-page--wide">
      <PageHead title="Báo cáo bài giao" sub="Kết quả máy chấm của các bài đã giao, theo đợt. Bấm một bài để xem từng em, câu sai nhiều và giao lại." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Btn icon="upload" disabled={!reports.length} onClick={exportXlsx} data-testid="report-export">Xuất Excel</Btn>
      </>} />
      <div className="tc-toolbar">
        <Seg label="Đợt" value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as ReportPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
        <input className="tc-input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Ngày trong đợt" />
        <strong data-testid="report-range">{range.label}</strong>
        <span className="tc-ebar__spacer" />
        {reports.length ? <span className="tc-small tc-muted">{reports.length} bài · điểm TB {avg ?? '—'}{avg !== null ? '%' : ''}</span> : null}
      </div>
      <ErrorNote error={all.error ?? rep.error} onRetry={() => void rep.refetch()} />
      {all.isLoading || rep.isLoading ? <Loading /> : !inRange.length ? <Empty icon="check" title="Không có bài nào mở trong đợt này">Chọn đợt khác hoặc giao bài ở mục Giao bài.</Empty> : (
        <section className="tc-card tc-card--flush">
          <div className="tc-tablewrap">
            <table className="tc-table" data-testid="report-table">
              <thead><tr><th>Bài giao</th><th>Mở</th><th>Hạn</th><th>Hoàn thành</th><th>Muộn</th><th>Quá hạn</th><th>Điểm TB</th><th /></tr></thead>
              <tbody>{inRange.map((a) => { const r = rep.reports[a.id]; return (
                <tr key={a.id}>
                  <td><strong>{a.title}</strong>{(a.round ?? 1) > 1 ? <span className="tc-chip tc-small"> {roundLabel(a)}</span> : null}</td>
                  <td className="tc-small">{fmtDateTime(a.openAt)}</td>
                  <td className="tc-small">{a.dueAt ? fmtDateTime(a.dueAt) : '—'}{a.latePolicy === 'lock' ? ' 🔒' : ''}</td>
                  <td>{r ? `${r.summary.completed}/${r.summary.assigned}` : '…'}</td>
                  <td>{r?.summary.late ?? '…'}</td>
                  <td>{r?.summary.overdue ?? '…'}</td>
                  <td>{r?.summary.avgPercent != null ? `${r.summary.avgPercent}%` : '—'}</td>
                  <td><Btn size="sm" onClick={() => setDetail(a)}>Xem</Btn></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        </section>
      )}
      {detail && cls ? <AssignmentDetail a={detail} all={all.data ?? []} me={user} className={cls.name} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
