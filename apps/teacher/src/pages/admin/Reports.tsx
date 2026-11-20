import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SUBJECTS, TT27_TERM_LABEL, type Grade, type Profile, type SubjectId, type Tt27TermId } from '@openedu/contracts';
import { csvFileName, downloadText, schoolReportCsv, toCsv, toTsv, tt27Rows, useClasses, useSchoolOverview, useSchoolSettings, useStudents, useTt27, vnWeekStart } from '@openedu/data';
import { Btn, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../../components/common';
import { Kpi, Meter, pct } from './util';
import '../../styles/admin.css';

type RangeKey = 'tuan' | '7' | '30';
const RANGE_LABEL: Record<RangeKey, string> = { tuan: 'Tuần này', '7': '7 ngày', '30': '30 ngày' };
const TT27_SUBJECTS = (g: Grade): SubjectId[] => (g <= 2 ? ['toan', 'tieng-viet', 'tnxh'] : g === 3 ? ['toan', 'tieng-viet', 'tieng-anh', 'tnxh'] : ['toan', 'tieng-viet', 'tieng-anh', 'khoa-hoc']);

function rangeOf(k: RangeKey): { from: string } {
  const now = Date.now();
  if (k === 'tuan') return { from: vnWeekStart(new Date()) };
  return { from: new Date(now - Number(k) * 86_400_000).toISOString() };
}

export default function Reports({ user }: { user: Profile }) {
  const [rk, setRk] = useState<RangeKey>('tuan');
  const range = useMemo(() => rangeOf(rk), [rk]);
  const q = useSchoolOverview(range);
  const settings = useSchoolSettings().data;
  const o = q.data;
  const admin = user.role === 'admin';

  const subjects = useMemo(() => [...new Set((o?.mastery ?? []).map((m) => m.subject))], [o]);
  const grades = useMemo(() => [...new Set((o?.mastery ?? []).map((m) => m.grade))].sort(), [o]);

  return (
    <div className="tc-page tc-page--wide ad-page">
      <PageHead
        title={admin ? 'Báo cáo trường' : 'Báo cáo lớp'}
        sub={<>{settings?.schoolName ? `${settings.schoolName} · ` : ''}Năm học {o?.schoolYear ?? settings?.schoolYear ?? ''} · {TT27_TERM_LABEL[o?.termId ?? settings?.termId ?? 'GK1']}{admin ? '' : ' · chỉ lớp thầy cô chủ nhiệm'}</>}
        actions={<>
          <Seg label="Khoảng thời gian" value={rk} onChange={setRk} options={(['tuan', '7', '30'] as RangeKey[]).map((k) => ({ value: k, label: RANGE_LABEL[k] }))} />
          <Btn icon="upload" disabled={!o} onClick={() => o && downloadText(csvFileName(`bao-cao-truong-${o.range.from.slice(0, 10)}`), schoolReportCsv(o))}>Xuất CSV</Btn>
        </>}
      />
      <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
      {q.isPending ? <Loading label="Đang tổng hợp báo cáo…" /> : !o ? null : o.rows.length === 0 ? <Empty icon="team" title="Chưa có lớp nào">Quản trị tạo lớp ở mục Quản trị → Lớp học.</Empty> : (
        <>
          <section className="ad-kpis" aria-label="Chỉ số chính">
            <Kpi label="Lớp · học sinh" value={`${o.classes} · ${o.students}`} sub={admin ? `${o.teachers} giáo viên chủ nhiệm` : undefined} />
            <Kpi label={`HS hoạt động (${RANGE_LABEL[rk].toLowerCase()})`} value={`${o.activeStudents}/${o.students}`} sub={pct(o.students ? o.activeStudents / o.students : null)} />
            <Kpi label="Bài giảng hoàn thành" value={o.lessonsCompleted} sub={`${o.answered} câu đã làm · đúng ${pct(o.correctRate)}`} />
            <Kpi label="Chuyên cần 30 ngày" value={pct(o.attendanceRate)} sub="có mặt + đi muộn" />
            <Kpi label={`TT27 đã chốt (${o.termId})`} value={pct(o.tt27FinalRate)} sub={`${o.rows.reduce((s, r) => s + r.tt27Final, 0)}/${o.students} học sinh`} />
            <Kpi label="AI chấm bài" value={`${o.ai.usedToday}/${o.ai.dailyQuota}`} sub={`hôm nay / hạn mức mỗi GV · ${o.ai.gradedInRange} bài trong khoảng`} />
          </section>

          <section className="tc-card">
            <header className="tc-card__head"><h2 className="ad-h2">So sánh các lớp</h2><Link className="tc-chip tc-chip--link" to="/bao-cao/ban-do-khoi">Bản đồ kĩ năng theo khối →</Link></header>
            <div className="tc-tablewrap">
              <table className="tc-table ad-table">
                <thead><tr><th>Lớp</th><th>Giáo viên</th><th className="ad-num">Sĩ số</th><th className="ad-num">Hoạt động</th><th className="ad-num">Bài xong</th><th className="ad-num">Câu · đúng</th><th>Thành thạo TB</th><th className="ad-num">Có lỗ hổng</th><th>Chuyên cần</th><th className="ad-num">TT27 chốt</th><th className="ad-num">Bài viết duyệt</th></tr></thead>
                <tbody>
                  {o.rows.map((r) => (
                    <tr key={r.classId}>
                      <td><Link to={`/lop/${r.classId}/ban-do-kien-thuc`}><strong>{r.name}</strong></Link></td>
                      <td>{r.teacherName ?? <span className="tc-muted">Chưa phân công</span>}</td>
                      <td className="ad-num">{r.students}</td>
                      <td className="ad-num">{r.activeStudents}</td>
                      <td className="ad-num">{r.lessonsCompleted}</td>
                      <td className="ad-num">{r.answered} · {pct(r.correctRate)}</td>
                      <td><Meter value={r.avgMastery} label="Trung bình p các kĩ năng đã làm ≥ 3 lần" /></td>
                      <td className="ad-num">{r.studentsWithGaps ? <span className="tc-chip tc-chip--warn">{r.studentsWithGaps} em</span> : '0'}</td>
                      <td><Meter value={r.attendanceRate} /></td>
                      <td className="ad-num">{r.tt27Final}/{r.students}</td>
                      <td className="ad-num">{r.worksApproved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="tc-grid2">
            <section className="tc-card">
              <header className="tc-card__head"><h2 className="ad-h2">Thành thạo trung bình theo khối & môn</h2></header>
              {o.mastery.length === 0 ? <p className="tc-muted">Chưa có dữ liệu luyện tập.</p> : (
                <div className="tc-tablewrap">
                  <table className="tc-table ad-table">
                    <thead><tr><th>Khối</th>{subjects.map((s) => <th key={s}>{SUBJECTS[s]?.name ?? s}</th>)}</tr></thead>
                    <tbody>
                      {grades.map((g) => (
                        <tr key={g}>
                          <td><strong>Lớp {g}</strong></td>
                          {subjects.map((s) => {
                            const m = o.mastery.find((x) => x.grade === g && x.subject === s);
                            return <td key={s}>{m ? <><Meter value={m.avgMastery} /><span className="ad-sub">{m.students} HS · vững {pct(m.secureRate)}</span></> : <span className="tc-muted">–</span>}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="tc-field__help">Thành thạo = tỉ lệ đúng có trọng số thời gian của các kĩ năng đã làm ít nhất 3 lần. “Vững”: kĩ năng đạt mức vững.</p>
            </section>
            <Tt27Export user={user} />
          </div>
        </>
      )}
    </div>
  );
}

function Tt27Export({ user }: { user: Profile }) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id).data ?? [];
  const settings = useSchoolSettings().data;
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState<Tt27TermId | ''>('');
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const term = (termId || settings?.termId || 'GK1') as Tt27TermId;
  const year = settings?.schoolYear;
  const students = useStudents(cls?.id).data ?? [];
  const evals = useTt27({ classId: cls?.id, termId: term, schoolYear: year }, !!cls && !!year);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = useMemo(() => (cls ? tt27Rows(students, evals.data ?? [], TT27_SUBJECTS(cls.grade)) : []), [cls, students, evals.data]);
  const done = (evals.data ?? []).filter((e) => e.status === 'final').length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(toTsv(rows)); setMsg('Đã sao chép. Mở phần mềm quản lí trường / Excel, chọn ô đầu tiên rồi dán (Ctrl+V).'); }
    catch { setMsg('Trình duyệt chưa cho sao chép. Thầy cô dùng nút “Tải CSV” nhé.'); }
  };
  return (
    <section className="tc-card">
      <header className="tc-card__head"><h2 className="ad-h2">Xuất nhận xét TT27</h2></header>
      {!cls ? <p className="tc-muted">Chưa có lớp.</p> : (
        <div className="tc-stack">
          <div className="ad-formrow">
            <Field label="Lớp"><select className="tc-input" value={cls.id} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>Lớp {c.name}</option>)}</select></Field>
            <Field label="Kì"><select className="tc-input" value={term} onChange={(e) => setTermId(e.target.value as Tt27TermId)}>{(Object.keys(TT27_TERM_LABEL) as Tt27TermId[]).map((t) => <option key={t} value={t}>{TT27_TERM_LABEL[t]}</option>)}</select></Field>
          </div>
          <p className="tc-muted">{students.length} học sinh · {done} đã chốt · {(evals.data ?? []).length - done} nháp. Cột: STT, Mã HS, Họ và tên, mỗi môn (Mức đạt T/H/C, Điểm KTĐK, Nhận xét), năng lực, phẩm chất (T/Đ/C), Nhận xét chung.</p>
          <div className="tc-row tc-wrap">
            <Btn kind="primary" icon="upload" disabled={!rows.length || evals.isPending} onClick={() => downloadText(csvFileName(`tt27-${cls.name}-${term}-${year}`), toCsv(rows))}>Tải CSV</Btn>
            <Btn icon="check" disabled={!rows.length || evals.isPending} onClick={() => void copy()}>Sao chép để dán</Btn>
          </div>
          {msg ? <p className="tc-alert tc-alert--info" role="status">{msg}</p> : null}
          {done < students.length ? <p className="tc-field__help">Bản nháp vẫn được xuất (cột Trạng thái) — thầy cô nên chốt ở trang Nhận xét TT27 trước khi nộp.</p> : null}
        </div>
      )}
    </section>
  );
}
