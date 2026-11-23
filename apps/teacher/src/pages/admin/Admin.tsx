import { useEffect, useMemo, useState } from 'react';
import { TT27_TERM_LABEL, type AccountSlip, type Grade, type SchoolSettings, type Tt27TermId } from '@openedu/contracts';
import {
  accountSlipRows, csvFileName, downloadText, generateStudentAccounts, importSampleContent, parseNameList, toCsv, useCurrentUser, useDataSource, useItems,
  type ImportProgress, type ImportReport,
  useBulkCreateStudents, useClasses, useCreateTeacher, useResetPassword, useSaveClass, useSaveSchoolSettings, useSchoolSettings, useSchoolUsers,
} from '@openedu/data';
import { Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../../components/common';
import { AccountSlipCard } from './util';
import '../../styles/admin.css';

const GRADES: Grade[] = [1, 2, 3, 4, 5];

/* ======================= Lớp học ======================= */
export function AdminClasses() {
  const classes = useClasses();
  const teachers = useSchoolUsers({ role: 'teacher' });
  const save = useSaveClass();
  const [edit, setEdit] = useState<{ id?: string; name: string; grade: Grade; teacherId: string } | null>(null);
  const tName = (id?: string) => teachers.data?.find((t) => t.id === id)?.name;
  const list = [...(classes.data ?? [])].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'vi'));
  return (
    <div className="tc-page ad-page">
      <PageHead title="Lớp học" sub="Tạo lớp, đổi tên / khối, phân công giáo viên chủ nhiệm." actions={<Btn kind="primary" icon="plus" onClick={() => setEdit({ name: '', grade: 1, teacherId: '' })}>Thêm lớp</Btn>} />
      <ErrorNote error={classes.error} onRetry={() => void classes.refetch()} />
      {classes.isPending ? <Loading /> : !list.length ? <Empty icon="team" title="Chưa có lớp" /> : (
        <section className="tc-card tc-card--flush">
          <table className="tc-table ad-table">
            <thead><tr><th>Lớp</th><th>Khối</th><th>Giáo viên chủ nhiệm</th><th className="ad-num">Sĩ số</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>Khối {c.grade}</td>
                  <td>{tName(c.teacherId) ?? <span className="tc-chip tc-chip--warn">Chưa phân công</span>}</td>
                  <td className="ad-num">{c.studentIds.length}</td>
                  <td className="ad-actions"><Btn size="sm" icon="pencil" onClick={() => setEdit({ id: c.id, name: c.name, grade: c.grade, teacherId: c.teacherId ?? '' })}>Sửa</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <Dialog open={!!edit} onClose={() => { setEdit(null); save.reset(); }} title={edit?.id ? `Sửa lớp ${edit.name}` : 'Thêm lớp'}
        footer={<><Btn onClick={() => setEdit(null)}>Hủy</Btn><Btn kind="primary" disabled={!edit?.name.trim() || save.isPending} onClick={() => edit && save.mutate({ id: edit.id, name: edit.name, grade: edit.grade, teacherId: edit.teacherId || null }, { onSuccess: () => setEdit(null) })}>Lưu</Btn></>}>
        {edit ? (
          <div className="tc-stack">
            <ErrorNote error={save.error} />
            <Field label="Tên lớp" help="Ví dụ 4B, 1A1. Tên đăng nhập HS sẽ dùng tên lớp (an4b1)."><input className="tc-input" value={edit.name} maxLength={12} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Khối"><Seg label="Khối" value={edit.grade} onChange={(g) => setEdit({ ...edit, grade: g })} options={GRADES.map((g) => ({ value: g, label: `Lớp ${g}` }))} /></Field>
            <Field label="Giáo viên chủ nhiệm">
              <select className="tc-input" value={edit.teacherId} onChange={(e) => setEdit({ ...edit, teacherId: e.target.value })}>
                <option value="">— Chưa phân công —</option>
                {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.username})</option>)}
              </select>
            </Field>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ======================= Tài khoản ======================= */
export function SlipSheet({ slips, title, onBack }: { slips: AccountSlip[]; title: string; onBack: () => void }) {
  const school = useSchoolSettings().data;
  return (
    <div className="tc-page ad-print">
      <div className="tc-row tc-wrap tc-noprint">
        <Btn icon="back" onClick={onBack}>Quay lại</Btn>
        <Btn kind="primary" onClick={() => window.print()}>In phiếu ({slips.length})</Btn>
        <Btn icon="upload" onClick={() => downloadText(csvFileName(title), toCsv(accountSlipRows(slips)))}>Tải CSV</Btn>
        <span className="tc-alert tc-alert--info">Mật khẩu chỉ hiện một lần — in hoặc tải về ngay.</span>
      </div>
      <div className="ad-slips ad-slips--acc">{slips.map((s) => <AccountSlipCard key={s.userId} slip={s} schoolName={school?.schoolName} />)}</div>
    </div>
  );
}

export function AdminUsers() {
  const [tab, setTab] = useState<'student' | 'teacher'>('student');
  const classes = useClasses().data ?? [];
  const [classId, setClassId] = useState('');
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  const users = useSchoolUsers(tab === 'student' ? { role: 'student', classId: cls?.id } : { role: 'teacher' });
  const all = useSchoolUsers();
  const bulk = useBulkCreateStudents();
  const createT = useCreateTeacher();
  const reset = useResetPassword();
  const [slips, setSlips] = useState<{ list: AccountSlip[]; title: string } | null>(null);
  const [paste, setPaste] = useState('');
  const [tForm, setTForm] = useState<{ name: string; username: string } | null>(null);
  const names = useMemo(() => parseNameList(paste), [paste]);
  const preview = useMemo(() => (cls ? generateStudentAccounts(names, cls.name, (all.data ?? []).map((u) => u.username ?? ''), cls.studentIds.length + 1) : []), [names, cls, all.data]);

  if (slips) return <SlipSheet slips={slips.list} title={slips.title} onBack={() => setSlips(null)} />;

  return (
    <div className="tc-page ad-page">
      <PageHead title="Tài khoản" sub="Tạo tài khoản giáo viên, học sinh hàng loạt, in phiếu, cấp lại mật khẩu (giáo viên nhận mật khẩu tạm, phải đổi khi đăng nhập). Phụ huynh: cấp lại ở mục Liên kết phụ huynh." actions={<Seg label="Loại tài khoản" value={tab} onChange={setTab} options={[{ value: 'student', label: 'Học sinh' }, { value: 'teacher', label: 'Giáo viên' }]} />} />
      <ErrorNote error={bulk.error ?? createT.error ?? reset.error ?? users.error} />
      {tab === 'student' ? (
        <div className="ad-split">
          <section className="tc-card">
            <header className="tc-card__head"><h2 className="ad-h2">Tạo học sinh từ danh sách</h2></header>
            {!cls ? <p className="tc-muted">Tạo lớp trước ở mục Lớp học.</p> : (
              <div className="tc-stack">
                <Field label="Lớp"><select className="tc-input" value={cls.id} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>Lớp {c.name} ({c.studentIds.length} HS)</option>)}</select></Field>
                <Field label="Dán danh sách “Họ tên” (mỗi dòng một em)" help="Dán thẳng cột từ Excel / Word được — STT, dòng tiêu đề và cột thừa tự bỏ.">
                  <textarea className="tc-input ad-paste" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Nguyễn Minh An\nTrần Bảo Ngọc\nLê Đức Anh'} />
                </Field>
                {preview.length ? (
                  <div className="ad-preview">
                    <p className="tc-muted">{preview.length} em · tên đăng nhập dự kiến (mật khẩu sinh khi tạo):</p>
                    <div className="tc-chips">{preview.map((a) => <span key={a.username} className="tc-chip" title={a.name}>{a.name} → <strong>{a.username}</strong></span>)}</div>
                  </div>
                ) : null}
                <Btn kind="primary" icon="plus" disabled={!names.length || bulk.isPending} onClick={() => bulk.mutate({ classId: cls.id, names }, { onSuccess: (list) => { setPaste(''); setSlips({ list, title: `tai-khoan-${cls.name}` }); } })}>
                  {bulk.isPending ? 'Đang tạo…' : `Tạo ${names.length || ''} tài khoản & in phiếu`}
                </Btn>
              </div>
            )}
          </section>
          <section className="tc-card tc-card--flush">
            <header className="tc-card__head ad-pad"><h2 className="ad-h2">Học sinh lớp {cls?.name}</h2></header>
            {users.isPending ? <Loading /> : !(users.data ?? []).length ? <p className="tc-muted ad-pad ad-padb">Lớp chưa có học sinh — dán danh sách bên trái để tạo.</p> : (
              <table className="tc-table ad-table">
                <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th /></tr></thead>
                <tbody>
                  {(users.data ?? []).map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td><code className="ad-code">{u.username}</code></td>
                      <td className="ad-actions"><Btn size="sm" disabled={reset.isPending} onClick={() => reset.mutate(u.id, { onSuccess: (s) => setSlips({ list: [s], title: `mat-khau-${s.username}` }) })}>Đặt lại mật khẩu</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : (
        <section className="tc-card tc-card--flush">
          <header className="tc-card__head ad-pad"><h2 className="ad-h2">Giáo viên</h2><Btn kind="primary" icon="plus" onClick={() => setTForm({ name: '', username: '' })}>Thêm giáo viên</Btn></header>
          <table className="tc-table ad-table">
            <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Lớp chủ nhiệm</th><th /></tr></thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td><code className="ad-code">{u.username}</code></td>
                  <td>{(u.classIds ?? []).map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || <span className="tc-muted">–</span>}</td>
                  <td className="ad-actions"><Btn size="sm" disabled={reset.isPending} onClick={() => reset.mutate(u.id, { onSuccess: (s) => setSlips({ list: [s], title: `mat-khau-${s.username}` }) })}>Đặt lại mật khẩu</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <Dialog open={!!tForm} onClose={() => setTForm(null)} title="Thêm giáo viên"
        footer={<><Btn onClick={() => setTForm(null)}>Hủy</Btn><Btn kind="primary" disabled={!tForm?.name.trim() || createT.isPending} onClick={() => tForm && createT.mutate({ name: tForm.name, username: tForm.username || undefined }, { onSuccess: (s) => { setTForm(null); setSlips({ list: [s], title: `tai-khoan-${s.username}` }); } })}>Tạo & in phiếu</Btn></>}>
        {tForm ? (
          <div className="tc-stack">
            <ErrorNote error={createT.error} />
            <Field label="Họ và tên"><input className="tc-input" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="Nguyễn Thị Thu" /></Field>
            <Field label="Tên đăng nhập (tuỳ chọn)" help="Để trống: tự sinh từ tên (thunt). Mật khẩu tự sinh, hiện một lần trên phiếu."><input className="tc-input" value={tForm.username} onChange={(e) => setTForm({ ...tForm, username: e.target.value })} /></Field>
            <p className="tc-field__help">Phân công lớp ở mục Lớp học.</p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ======================= Năm học & kì ======================= */
export function AdminSettings() {
  const q = useSchoolSettings();
  const save = useSaveSchoolSettings();
  const [f, setF] = useState<SchoolSettings | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  if (!f) return <div className="tc-page"><Loading /></div>;
  const years = (() => { const y = Number(f.schoolYear.slice(0, 4)) || new Date().getFullYear(); return [y - 1, y, y + 1].map((x) => `${x}-${x + 1}`); })();
  return (
    <div className="tc-page ad-page ad-narrow">
      <PageHead title="Năm học & kì đánh giá" sub="Kì đang đánh giá dùng cho báo cáo “TT27 đã chốt” và mặc định khi xuất TT27." />
      <section className="tc-card tc-stack">
        <ErrorNote error={save.error} />
        <Field label="Tên trường (in trên phiếu)"><input className="tc-input" value={f.schoolName} onChange={(e) => { setF({ ...f, schoolName: e.target.value }); setOk(false); }} /></Field>
        <Field label="Năm học"><Seg label="Năm học" value={f.schoolYear} onChange={(v) => { setF({ ...f, schoolYear: v }); setOk(false); }} options={years.map((y) => ({ value: y, label: y }))} /></Field>
        <Field label="Kì đánh giá hiện tại"><Seg label="Kì" value={f.termId} onChange={(v: Tt27TermId) => { setF({ ...f, termId: v }); setOk(false); }} options={(Object.keys(TT27_TERM_LABEL) as Tt27TermId[]).map((t) => ({ value: t, label: TT27_TERM_LABEL[t] }))} /></Field>
        <Field label="Hạn mức AI chấm bài / giáo viên / ngày" help="Để hiển thị trên báo cáo. Supabase: đặt cùng giá trị cho secret AI_DAILY_LIMIT_GRADE của Edge Function ai-grade.">
          <input className="tc-input tc-input--num" type="number" min={0} max={2000} value={f.aiDailyQuota} onChange={(e) => { setF({ ...f, aiDailyQuota: Number(e.target.value) }); setOk(false); }} />
        </Field>
        <div className="tc-row"><Btn kind="primary" disabled={save.isPending} onClick={() => save.mutate(f, { onSuccess: () => setOk(true) })}>Lưu</Btn>{ok ? <span className="tc-chip tc-chip--ok">Đã lưu</span> : null}</div>
      </section>
      <SampleContent />
    </div>
  );
}

/* ======================= Kho nội dung mẫu ======================= */
export function SampleContent() {
  const ds = useDataSource();
  const me = useCurrentUser().data;
  const items = useItems({});
  const [prog, setProg] = useState<ImportProgress | null>(null);
  const [rep, setRep] = useState<ImportReport | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [ask, setAsk] = useState(false);
  const busy = !!prog && !rep && !err;
  const run = async () => {
    if (!me) return;
    setAsk(false); setRep(null); setErr(null); setProg({ done: 0, total: 1, label: 'Chuẩn bị' });
    try { setRep(await importSampleContent(ds, me.id, setProg)); void items.refetch(); } catch (e) { setErr(e); }
  };
  return (
    <section className="tc-card tc-stack">
      <header className="tc-card__head"><h2 className="ad-h2">Kho nội dung mẫu</h2></header>
      <p className="tc-muted">Nạp khoảng 120 câu hỏi mẫu (Toán, Tiếng Việt, Tự nhiên và Xã hội, Tiếng Anh lớp 1–5, đã gắn mã kĩ năng), 6 bài giảng mẫu và tiêu chí chấm bài viết vào Ngân hàng câu hỏi. Chạy lại không tạo bản trùng. Thầy cô sửa, xóa hoặc thêm câu của mình sau.</p>
      <p className="tc-small">Ngân hàng hiện có: <strong>{items.isLoading ? '…' : (items.data?.length ?? 0)}{(items.data?.length ?? 0) >= 500 ? '+' : ''}</strong> câu hỏi.</p>
      <ErrorNote error={err} />
      {busy && prog ? (
        <div role="status"><progress max={prog.total} value={prog.done} style={{ width: '100%' }} /><p className="tc-small tc-muted">{prog.label}: {prog.done}/{prog.total}. Đừng đóng trang.</p></div>
      ) : null}
      {rep ? (
        <div className={rep.failed.length ? 'tc-alert tc-alert--error' : 'tc-alert tc-alert--ok'}>
          <span>Đã nạp {rep.items} câu hỏi, {rep.lessons} bài giảng, {rep.rubrics} tiêu chí chấm.{rep.failed.length ? ` ${rep.failed.length} mục lỗi — mục đầu: ${rep.failed[0]!.id}: ${rep.failed[0]!.error}` : ''}</span>
        </div>
      ) : null}
      {ask ? (
        <div className="tc-row tc-wrap"><span>Nạp nội dung mẫu vào dữ liệu của trường?</span><Btn kind="primary" onClick={() => void run()}>Nạp</Btn><Btn onClick={() => setAsk(false)}>Thôi</Btn></div>
      ) : <div className="tc-row"><Btn icon="upload" disabled={busy || ds.mode === 'demo'} onClick={() => setAsk(true)}>{rep ? 'Nạp lại' : 'Nạp nội dung mẫu'}</Btn>{ds.mode === 'demo' ? <span className="tc-muted tc-small">Chế độ demo đã có sẵn nội dung mẫu.</span> : null}</div>}
    </section>
  );
}
