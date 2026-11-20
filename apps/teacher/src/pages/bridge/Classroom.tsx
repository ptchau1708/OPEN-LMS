import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AccountSlip } from '@openedu/contracts';
import { bridge, useDataSource } from '@openedu/data';
import { Btn, ErrorNote, Loading } from '../../components/common';
import { SlipSheet } from '../admin/Admin';
import { QuickExport } from './QuickExport';
import { learnerLink } from './ShareClassroom';
import { MatchChip, StudentSelect, type BridgeData } from './shared';

const gc = bridge.gc;
type Token = { token: string; expiresAt: number; scopes: string[] };

function useGoogle() {
  const [tok, setTok] = useState<Token | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const api = (t: Token): bridge.gc.ClassroomApi => ({ token: t.token, fetch: (u, i) => fetch(u, i) });
  /** Có token đủ quyền còn hạn thì dùng; không thì xin (phải gọi trong lần bấm). */
  const ensure = async (scopes: readonly string[]): Promise<bridge.gc.ClassroomApi> => {
    if (tok && tok.expiresAt > Date.now() && scopes.every((s) => tok.scopes.includes(s))) return api(tok);
    const t = await bridge.requestGoogleToken([...new Set([...(tok?.scopes ?? []), ...scopes])]);
    setTok(t);
    return api(t);
  };
  const run = async <T,>(scopes: readonly string[], fn: (a: bridge.gc.ClassroomApi) => Promise<T>): Promise<T | undefined> => {
    setErr(''); setBusy(true);
    try { return await fn(await ensure(scopes)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); if (/hết hạn/.test(String(e))) setTok(null); return undefined; } finally { setBusy(false); }
  };
  return { connected: !!tok && tok.expiresAt > Date.now(), run, err, busy, signOut: () => setTok(null) };
}

function SetupSteps() {
  return (
    <section className="tc-card br-step" data-testid="br-gc-setup">
      <h2>Kết nối Google Classroom chưa được bật</h2>
      <p className="tc-small">Nhập danh sách từ Classroom và đẩy điểm sang Classroom cần trường tạo một “OAuth Client ID” của Google (miễn phí, làm một lần). Nút “Chia sẻ lên Classroom” ở danh sách bài giảng, giao bài, đề kiểm tra thì dùng được ngay, không cần bước này.</p>
      <ol className="br-howto">
        <li>Vào <b>console.cloud.google.com</b> bằng tài khoản Google Workspace của trường → tạo dự án (vd “OPEN-EDU”).</li>
        <li><b>APIs &amp; Services → Library</b>: bật <b>Google Classroom API</b>.</li>
        <li><b>OAuth consent screen</b>: chọn <i>Internal</i> (chỉ tài khoản trong trường), điền tên ứng dụng, email hỗ trợ; thêm các phạm vi classroom.courses.readonly, classroom.rosters.readonly, classroom.profile.emails, classroom.coursework.students.</li>
        <li><b>Credentials → Create credentials → OAuth client ID</b>, loại <i>Web application</i>; ở <b>Authorized JavaScript origins</b> thêm địa chỉ trang giáo viên (vd https://gv.truong.edu.vn). Không cần “redirect URI”.</li>
        <li>Đặt biến <code>VITE_GOOGLE_CLIENT_ID=&lt;client id&gt;</code> khi dựng app giáo viên rồi dựng lại (biến này không bí mật).</li>
      </ol>
      <p className="tc-small tc-muted">Chi tiết: docs/CAU_NOI_VNEDU_CLASSROOM.md. Phần này <b>chưa thử với Google thật</b>.</p>
    </section>
  );
}

function RosterFromClassroom({ data, g, onChanged }: { data: BridgeData; g: ReturnType<typeof useGoogle>; onChanged: () => void }) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const [courses, setCourses] = useState<bridge.gc.GcCourse[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [students, setStudents] = useState<bridge.gc.GcStudent[] | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [slips, setSlips] = useState<AccountSlip[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const rows = useMemo(() => (students ?? []).map((s, i) => ({ row: i, code: '', name: s.fullName })), [students]);
  const auto = useMemo(() => bridge.matchRows(rows, bridge.toMatchStudents(data)), [rows, data]);
  const matches = auto.map((m) => (m.row in picks ? (picks[m.row] && picks[m.row] !== 'new' ? { ...m, status: 'manual' as const, studentId: picks[m.row] } : { ...m, studentId: undefined }) : m));
  const taken = new Set(matches.map((m) => m.studentId).filter((x): x is string => !!x));
  const toCreate = matches.filter((m) => !m.studentId && (picks[m.row] === 'new'));

  const saveIds = async () => {
    if (!students) return;
    setSaving(true); setErr(null);
    try {
      const b = bridge.getBridgeSource(ds);
      const n = await b.setExternalIds(data.cls.id, matches.filter((m) => m.studentId).map((m) => ({ studentId: m.studentId as string, googleId: students[m.row].userId, googleEmail: students[m.row].email ?? '' })));
      let made: AccountSlip[] = [];
      if (toCreate.length) made = await b.createStudents(data.cls.id, toCreate.map((m) => ({ name: students[m.row].fullName, googleId: students[m.row].userId, googleEmail: students[m.row].email })));
      setMsg(`Đã lưu tài khoản Google cho ${n} em${made.length ? `, tạo ${made.length} tài khoản mới` : ''}.`);
      if (made.length) setSlips(made);
      void qc.invalidateQueries({ queryKey: ['students'] });
      onChanged();
    } catch (e) { setErr(e); } finally { setSaving(false); }
  };

  if (slips) return <SlipSheet slips={slips} title={`Tài khoản lớp ${data.cls.name}`} onBack={() => setSlips(null)} />;
  return (
    <section className="tc-card br-step">
      <header className="tc-card__head"><h2>Nhập danh sách từ Classroom</h2></header>
      <div className="tc-row tc-wrap">
        <Btn icon="team" disabled={g.busy} onClick={() => void g.run(gc.CLASSROOM_SCOPES.roster, async (a) => { const c = await gc.listCourses(a); setCourses(c); if (c[0]) setCourseId(c[0].id); })}>{courses ? 'Tải lại các lớp' : 'Kết nối Google & xem các lớp của tôi'}</Btn>
        {courses ? (courses.length ? (
          <>
            <select className="tc-input tc-input--sm" aria-label="Lớp trên Classroom" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` · ${c.section}` : ''}</option>)}</select>
            <Btn disabled={g.busy || !courseId} onClick={() => void g.run(gc.CLASSROOM_SCOPES.roster, async (a) => { setStudents(await gc.listCourseStudents(a, courseId)); setPicks({}); setMsg(''); })}>Xem học sinh</Btn>
          </>
        ) : <span className="tc-small tc-muted">Tài khoản này chưa là giáo viên của lớp nào trên Classroom.</span>) : null}
      </div>
      {students ? (
        <>
          <div className="tc-tablewrap br-scroll">
            <table className="tc-table br-table">
              <thead><tr><th>Họ tên (Classroom)</th><th>Email</th><th>Kết quả</th><th>Học sinh lớp {data.cls.name}</th></tr></thead>
              <tbody>{matches.map((m) => (
                <tr key={m.row}><td>{students[m.row].fullName}</td><td>{students[m.row].email ?? '—'}</td><td><MatchChip status={m.status} /></td>
                  <td><span className="tc-row"><StudentSelect label="Ghép học sinh" students={data.students} value={m.studentId ?? ''} candidates={m.candidates} taken={taken} emptyLabel={picks[m.row] === 'new' ? 'Tạo tài khoản mới' : '— Bỏ qua —'} onChange={(id) => setPicks((p) => ({ ...p, [m.row]: id }))} />
                    {!m.studentId && picks[m.row] !== 'new' ? <Btn size="sm" onClick={() => setPicks((p) => ({ ...p, [m.row]: 'new' }))}>Tạo mới</Btn> : null}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="tc-row tc-wrap br-actions">
            <Btn kind="primary" icon="check" disabled={saving} onClick={() => void saveIds()}>{saving ? 'Đang lưu…' : `Lưu ghép (${taken.size} em)${toCreate.length ? ` + tạo ${toCreate.length} em` : ''}`}</Btn>
            <span className="tc-small tc-muted">OPEN-EDU chỉ lưu id và email Google để ghép điểm; không đọc gì khác.</span>
          </div>
        </>
      ) : null}
      <ErrorNote error={err} />
      {msg ? <div className="tc-alert tc-alert--ok" role="status"><span>{msg}</span></div> : null}
    </section>
  );
}

function GradePush({ data, g }: { data: BridgeData; g: ReturnType<typeof useGoogle> }) {
  const ds = useDataSource();
  const published = data.exams.filter((e) => e.status === 'published' && data.reports[e.id]);
  const [source, setSource] = useState(published[0] ? `exam:${published[0].id}` : 'work-avg');
  const [courses, setCourses] = useState<bridge.gc.GcCourse[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [works, setWorks] = useState<bridge.gc.GcCourseWork[] | null>(null);
  const [workId, setWorkId] = useState('');
  const [mode, setMode] = useState<'draft' | 'assigned'>('draft');
  const [results, setResults] = useState<bridge.gc.GradePushResult[] | null>(null);
  const [ids, setIds] = useState<Record<string, bridge.GoogleIdentity> | null>(null);
  const exam = source.startsWith('exam:') ? published.find((e) => `exam:${e.id}` === source) : undefined;
  const title = exam ? exam.title : 'Điểm trung bình bài viết';
  const grades = data.students.map((s) => ({ s, v: bridge.fieldValue(data, source, s.id) }));
  const loadIds = async () => { const m = await bridge.getBridgeSource(ds).listGoogleIds(data.cls.id); setIds(m); return m; };
  const toPush = (m: Record<string, bridge.GoogleIdentity>) => grades.filter((x) => typeof x.v === 'number' && m[x.s.id]).map((x) => ({ googleUserId: m[x.s.id].googleId, grade: x.v as number, label: x.s.name }));
  const noId = ids ? data.students.filter((s) => !ids[s.id]).length : null;

  return (
    <section className="tc-card br-step">
      <header className="tc-card__head"><h2>Đẩy điểm sang Classroom</h2></header>
      <p className="tc-small tc-muted">Google chỉ cho ứng dụng sửa điểm ở bài tập do chính ứng dụng đó tạo. Vì vậy OPEN-EDU tạo bài tập mới trên Classroom (kèm link tới bài trong OPEN-EDU, điểm tối đa 10) rồi điền điểm. Cần nhập danh sách từ Classroom trước để biết em nào là ai.</p>
      <div className="br-form">
        <label className="tc-field"><span className="tc-field__label">Điểm lấy từ</span>
          <select className="tc-input" value={source} onChange={(e) => { setSource(e.target.value); setResults(null); }}>
            {published.map((e) => <option key={e.id} value={`exam:${e.id}`}>Đề: {e.title}</option>)}
            <option value="work-avg">Điểm trung bình bài viết đã duyệt</option>
          </select>
        </label>
        <div className="tc-row tc-wrap">
          <Btn disabled={g.busy} onClick={() => void g.run(gc.CLASSROOM_SCOPES.grades, async (a) => { const c = await gc.listCourses(a); setCourses(c); if (c[0]) setCourseId(c[0].id); await loadIds(); })}>{courses ? 'Tải lại' : 'Kết nối Google & chọn lớp'}</Btn>
          {courses?.length ? <select className="tc-input tc-input--sm" aria-label="Lớp trên Classroom" value={courseId} onChange={(e) => { setCourseId(e.target.value); setWorks(null); setWorkId(''); }}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : null}
          {courseId ? <Btn disabled={g.busy} onClick={() => void g.run(gc.CLASSROOM_SCOPES.grades, async (a) => { const w = await gc.listCourseWork(a, courseId, true); setWorks(w); setWorkId(''); })}>Bài tập OPEN-EDU đã tạo</Btn> : null}
          {works ? <select className="tc-input tc-input--sm" aria-label="Bài tập trên Classroom" value={workId} onChange={(e) => setWorkId(e.target.value)}><option value="">+ Tạo bài tập mới “{title}”</option>{works.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</select> : null}
        </div>
        <label className="tc-row tc-small br-check"><input type="checkbox" checked={mode === 'assigned'} onChange={(e) => setMode(e.target.checked ? 'assigned' : 'draft')} /> Điền luôn điểm chính thức (bỏ chọn = chỉ điểm nháp, thầy cô bấm “Trả bài” trong Classroom để HS thấy)</label>
        {noId !== null && noId > 0 ? <div className="tc-alert tc-alert--info"><span>{noId} em chưa ghép với tài khoản Google — sẽ bị bỏ qua.</span></div> : null}
        <div className="tc-row tc-wrap">
          <Btn kind="primary" icon="upload" disabled={g.busy || !courseId} onClick={() => void g.run(gc.CLASSROOM_SCOPES.grades, async (a) => {
            const m = ids ?? await loadIds();
            let wid = workId;
            if (!wid) {
              const w = await gc.createCourseWork(a, courseId, { title, maxPoints: 10, description: 'Điểm từ OPEN-EDU (thang 10).', ...(exam ? { linkUrl: learnerLink('exam', exam.id) } : {}) });
              wid = w.id;
              setWorks((ws) => [w, ...(ws ?? [])]);
              setWorkId(w.id);
            }
            setResults(await gc.pushGrades(a, courseId, wid, toPush(m), mode));
          })}>{g.busy ? 'Đang làm…' : 'Đẩy điểm'}</Btn>
          <span className="tc-small tc-muted">{grades.filter((x) => typeof x.v === 'number').length}/{data.students.length} em có điểm.</span>
        </div>
      </div>
      {results ? (
        <div className="tc-tablewrap"><table className="tc-table br-table"><thead><tr><th>Học sinh</th><th>Điểm</th><th>Kết quả</th></tr></thead>
          <tbody>{results.map((r) => <tr key={r.googleUserId}><td>{r.label}</td><td>{r.grade ?? ''}</td><td>{r.ok ? <span className="tc-chip tc-chip--ok">Đã điền</span> : <span className="tc-chip tc-chip--warn" title={r.error}>{r.error}</span>}</td></tr>)}</tbody></table></div>
      ) : null}
    </section>
  );
}

export function ClassroomTab({ data, onChanged }: { data: BridgeData; onChanged: () => void }) {
  const g = useGoogle();
  const enabled = !!bridge.googleClientId();
  return (
    <div className="br-stack">
      <section className="tc-card br-step">
        <h2>Chia sẻ bài lên Classroom</h2>
        <p className="tc-small">Ở trang <b>Bài giảng</b>, <b>Giao bài</b>, <b>Bài viết</b> và <b>Đề kiểm tra</b> có nút “Classroom”: bấm vào, Google mở trang chia sẻ để thầy cô đăng link bài lên lớp Classroom (thông báo, bài tập hoặc tài liệu). Học sinh bấm link sẽ mở thẳng bài trong OPEN-EDU. Không cần cài đặt gì.</p>
      </section>
      {enabled ? (
        <>
          {g.err ? <div className="tc-alert tc-alert--error" role="alert"><span>{g.err}</span></div> : null}
          {g.busy ? <Loading label="Đang làm việc với Google…" /> : null}
          <RosterFromClassroom data={data} g={g} onChanged={onChanged} />
          <GradePush data={data} g={g} />
          <p className="tc-small tc-muted">Đăng nhập Google chỉ giữ trong trang này (hết hạn sau khoảng 1 giờ), không lưu xuống máy. Tính năng <b>chưa thử với Google thật</b> — nếu gặp lỗi, ghi lại lời báo và gửi cho người quản trị.</p>
        </>
      ) : <SetupSteps />}
      <section className="tc-card br-step">
        <header className="tc-card__head"><h2>Bảng điểm theo bố cục Classroom / Google Sheets</h2></header>
        <p className="tc-small">Google Classroom <b>không có</b> chức năng nhập điểm từ tệp. Bảng này (Mã HS, Họ tên, Email Google, mỗi đề một cột điểm thang 10, dòng 2 là điểm tối đa) để thầy cô lưu, mở bằng Google Sheets, hoặc đối chiếu khi nhập tay. Muốn điểm tự vào Classroom thì dùng “Đẩy điểm” ở trên.</p>
        <QuickExport data={data} only="classroom" />
      </section>
    </div>
  );
}
