/**
 * Danh mục kĩ năng (yêu cầu cần đạt) — danh mục MỞ: thầy/cô thêm kĩ năng, sửa chữ, ẩn / hiện, khôi phục bản gốc,
 * xoá kĩ năng tự thêm. Áp dụng chung toàn trường (SQL 19); bản demo lưu trên trình duyệt.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  allSkills, builtinSkill, customSkillCode, SKILL_BY_CODE, STRAND_LABEL, SUBJECTS, subjectsForGrade,
  type Grade, type Profile, type Skill, type SubjectId,
} from '@openedu/contracts';
import { matchesSearch, useCatalogVersion, useDeleteSkill, useRestoreSkill, useSaveSkill, useSetSkillHidden, useSkillOverrides } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, PageHead } from '../components/common';
import { cx } from '../lib/format';
import { SubjectOptions } from '../components/SubjectOptions';
import { exportSkillsXlsx, SkillsImportDialog } from './SkillCatalogExcel';
import { useFocusGrade } from '../lib/focusGrade';

const GRADES: Grade[] = [1, 2, 3, 4, 5];
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default function SkillCatalog({ user }: { user: Profile }) {
  const ver = useCatalogVersion();
  const ov = useSkillOverrides();
  const [grade, setGrade] = useState<Grade>(useFocusGrade().grade);
  const [subject, setSubject] = useState<SubjectId>('toan');
  const [q, setQ] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [edit, setEdit] = useState<{ skill?: Skill } | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const hide = useSetSkillHidden();
  const restore = useRestoreSkill();
  const del = useDeleteSkill();

  const list = useMemo(() => {
    void ver;
    return allSkills().filter((s) => s.subject === subject && s.grade === grade && (showHidden || !s.hidden) && (!q.trim() || matchesSearch(`${s.code} ${s.short} ${s.text} ${s.topic}`, q)));
  }, [ver, subject, grade, showHidden, q]);
  const groups = useMemo(() => {
    const order: string[] = [];
    const by: Record<string, Skill[]> = {};
    for (const s of list) {
      const k = `${STRAND_LABEL[s.strand]} › ${s.topic}`;
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(s);
    }
    return order.map((k) => ({ key: k, skills: by[k]! }));
  }, [list]);
  const counts = useMemo(() => {
    void ver;
    const all = allSkills();
    return { custom: all.filter((s) => s.custom).length, edited: all.filter((s) => s.edited).length, hidden: all.filter((s) => s.hidden).length };
  }, [ver]);
  const changeGrade = (g: Grade) => { setGrade(g); if (!subjectsForGrade(g).includes(subject) && subject !== 'khac') setSubject(subjectsForGrade(g)[0] ?? 'toan'); };
  const err = hide.error ?? restore.error ?? del.error;

  return (
    <div className="tc-page tc-skillcat">
      <PageHead title="Danh mục kĩ năng" sub="Yêu cầu cần đạt dùng để gắn vào câu hỏi, tính mức thành thạo và vẽ bản đồ kiến thức. Thầy/cô thêm, sửa chữ, ẩn hoặc xoá được — áp dụng chung toàn trường; kĩ năng gốc luôn khôi phục được." actions={<>
        <Link className="tc-btn tc-btn--ghost" to="/kien-thuc"><span>Bản đồ kiến thức</span></Link>
        <Btn icon="upload" disabled={exporting} onClick={() => { setExporting(true); exportSkillsXlsx().then(() => setToast('Đã xuất toàn bộ danh mục kĩ năng ra Excel (mọi môn, lớp 1–5, kể cả kĩ năng đã ẩn).'), (e: unknown) => setToast(e instanceof Error ? e.message : String(e))).finally(() => setExporting(false)); }} data-testid="sk-export" title="Tải toàn bộ danh mục (mã, môn, lớp, chủ đề, tên, yêu cầu cần đạt) để tra mã khi soạn câu hỏi hoặc rà soát">Xuất Excel</Btn>
        <Btn icon="plus" onClick={() => setImporting(true)} data-testid="sk-import" title="Thêm nhiều kĩ năng, sửa chữ, ẩn / hiện bằng tệp Excel">Nhập từ Excel</Btn>
        <Btn kind="primary" icon="plus" onClick={() => setEdit({})} data-testid="sk-add">Thêm kĩ năng</Btn>
      </>} />
      <div className="tc-filters tc-card tc-card--flat">
        <select className="tc-input" aria-label="Lớp" value={grade} onChange={(e) => changeGrade(Number(e.target.value) as Grade)}>
          {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
        <select className="tc-input" aria-label="Môn" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)} data-testid="sk-subject">
          <SubjectOptions grade={grade} present={[subject]} />
        </select>
        <input className="tc-input tc-filters__search" placeholder="Tìm theo tên, mô tả, mã…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="tc-switch tc-small"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Hiện kĩ năng đã ẩn</label>
        <span className="tc-muted tc-small">{list.length} kĩ năng · toàn trường: {counts.custom} tự thêm, {counts.edited} đã sửa, {counts.hidden} đã ẩn</span>
      </div>
      {toast ? <div className="tc-alert tc-alert--ok" role="status"><span>{toast}</span><Btn size="sm" kind="ghost" icon="close" aria-label="Đóng thông báo" onClick={() => setToast('')} /></div> : null}
      <ErrorNote error={ov.error ?? err} />
      {!groups.length ? <Empty icon="map" title={`Chưa có kĩ năng ${SUBJECTS[subject]?.name ?? ''} lớp ${grade}`}>Bấm “Thêm kĩ năng” để tạo.</Empty> : groups.map((g) => (
        <section key={g.key} className="tc-card tc-skillcat__group">
          <h2 className="tc-h3">{g.key} <span className="tc-muted tc-small">{g.skills.length}</span></h2>
          <ul className="tc-skillcat__list">
            {g.skills.map((s) => (
              <li key={s.code} className={cx('tc-skillcat__row', s.hidden && 'is-hidden')} data-testid="sk-row">
                <div className="tc-grow">
                  <div className="tc-row tc-wrap">
                    <strong>{s.short}</strong>
                    {s.custom ? <span className="tc-chip tc-chip--ok">Thầy/cô thêm</span> : null}
                    {s.edited ? <span className="tc-chip tc-chip--warn">Đã sửa</span> : null}
                    {s.hidden ? <span className="tc-chip">Đã ẩn</span> : null}
                    {s.provisional && !s.custom ? <span className="tc-chip" title="Mô tả tóm lược — tổ chuyên môn đối chiếu chương trình">tạm</span> : null}
                  </div>
                  <p className="tc-small">{s.text}</p>
                  <code className="tc-small tc-muted">{s.code}</code>
                </div>
                <div className="tc-row tc-skillcat__acts">
                  <Btn size="sm" icon="pencil" onClick={() => setEdit({ skill: s })} aria-label={`Sửa ${s.short}`}>Sửa</Btn>
                  <Btn size="sm" kind="ghost" icon="eye" disabled={hide.isPending} onClick={() => hide.mutate({ code: s.code, hidden: !s.hidden }, { onSuccess: () => setToast(s.hidden ? `Đã hiện lại “${s.short}”.` : `Đã ẩn “${s.short}”.`) })} data-testid="sk-hide">{s.hidden ? 'Hiện lại' : 'Ẩn'}</Btn>
                  {s.edited ? <Btn size="sm" kind="ghost" icon="retry" disabled={restore.isPending} onClick={() => restore.mutate(s.code, { onSuccess: () => setToast(`Đã khôi phục bản gốc “${builtinSkill(s.code)?.short ?? s.short}”.`) })} data-testid="sk-restore">Khôi phục gốc</Btn> : null}
                  {s.custom ? <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá ${s.short}`} onClick={() => setAskDel(s.code)} data-testid="sk-delete" /> : null}
                </div>
                {askDel === s.code ? <ConfirmBar text={`Xoá kĩ năng “${s.short}”? Nếu đã có câu hỏi hoặc kết quả luyện tập, kĩ năng sẽ được ẩn để giữ lịch sử.`} busy={del.isPending} onCancel={() => setAskDel(null)} onConfirm={() => del.mutate(s.code, { onSuccess: (r) => { setAskDel(null); setToast(r === 'deleted' ? `Đã xoá “${s.short}”.` : `“${s.short}” đã có dữ liệu nên được ẩn thay vì xoá.`); } })} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {importing ? <SkillsImportDialog onClose={() => setImporting(false)} onDone={(m) => { setImporting(false); setToast(m); }} /> : null}
      {edit ? <SkillDialog me={user} skill={edit.skill} grade={grade} subject={subject} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); setToast(t); }} /> : null}
    </div>
  );
}

function SkillDialog({ me, skill, grade: g0, subject: s0, onClose, onSaved }: { me: Profile; skill?: Skill; grade: Grade; subject: SubjectId; onClose: () => void; onSaved: (msg: string) => void }) {
  const save = useSaveSkill();
  const [grade, setGrade] = useState<Grade>(skill?.grade ?? g0);
  const [subject, setSubject] = useState<SubjectId>(skill?.subject ?? s0);
  const [topic, setTopic] = useState(skill?.topic ?? '');
  const [short, setShort] = useState(skill?.short ?? '');
  const [text, setText] = useState(skill?.text ?? '');
  const isNew = !skill;
  const topics = useMemo(() => [...new Set(allSkills().filter((s) => s.subject === subject && s.grade === grade).map((s) => s.topic))], [subject, grade]);
  const code = skill?.code ?? (short.trim() ? customSkillCode(subject, grade, short) : '');
  const orig = skill ? builtinSkill(skill.code) : undefined;
  const bad = !topic.trim() || !short.trim() || !text.trim() || words(short) > 8;
  const submit = () => save.mutate(
    { code, ...(isNew ? { subject, grade } : {}), topic, short, text },
    { onSuccess: () => onSaved(isNew ? `Đã thêm kĩ năng “${short.trim()}” (${code}).` : `Đã lưu “${short.trim()}”.`) },
  );
  void me;
  return (
    <Dialog open title={isNew ? 'Thêm kĩ năng' : 'Sửa kĩ năng'} onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" disabled={bad || save.isPending || (isNew && !!SKILL_BY_CODE[code])} onClick={submit} data-testid="sk-save">{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
    </>}>
      <div className="tc-stack">
        {isNew ? (
          <div className="tc-grid2 tc-grid2--tight">
            <Field label="Lớp"><select className="tc-input" value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade)}>{GRADES.map((x) => <option key={x} value={x}>Lớp {x}</option>)}</select></Field>
            <Field label="Môn"><select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)}><SubjectOptions grade={grade} present={[subject]} /></select></Field>
          </div>
        ) : <p className="tc-small tc-muted">{SUBJECTS[skill.subject]?.name} · Lớp {skill.grade} · <code>{skill.code}</code>{skill.custom ? ' · do thầy/cô thêm' : ''}</p>}
        <Field label="Chủ đề / mạch nội dung">
          <input className="tc-input" list="sk-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="vd: Năng lượng" />
          <datalist id="sk-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label={`Tên ngắn (cho HS, phụ huynh — nên ≤ 6 từ; hiện ${words(short)} từ)`}><input className="tc-input" value={short} maxLength={80} onChange={(e) => setShort(e.target.value)} placeholder="vd: Tiết kiệm nước" aria-label="Tên ngắn" /></Field>
        <Field label="Mô tả (yêu cầu cần đạt)"><textarea className="tc-input" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="vd: Nêu được cách sử dụng nước tiết kiệm ở gia đình và nhà trường" aria-label="Mô tả" /></Field>
        {isNew && code ? <p className="tc-small tc-muted">Mã kĩ năng: <code>{code}</code> — dùng ở cột “Mã kĩ năng” khi nhập câu hỏi từ Word / Excel.</p> : null}
        {orig && (orig.short !== short.trim() || orig.text !== text.trim() || orig.topic !== topic.trim()) ? <p className="tc-small tc-muted">Bản gốc: <b>{orig.short}</b> — {orig.text}</p> : null}
        {words(short) > 8 ? <p className="tc-small tc-warn">Tên ngắn quá dài — rút gọn còn khoảng 6 từ.</p> : null}
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  );
}
