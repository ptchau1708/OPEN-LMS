/**
 * Tạo bài luyện Ôn thi từ một tệp Word theo mẫu: đọc tệp → soát từng câu (đủ đáp án chưa) → đặt tên, thời gian,
 * mức đạt → lưu câu vào ngân hàng (giữ thứ tự trong tệp) → tạo bài luyện cho cả khối.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  defaultMinutes, defaultPassScore, ONTHI_STYLES, SUBJECTS, type Grade, type Item, type OnThiStyle, type SubjectId,
} from '@openedu/contracts';
import { onThiKeys, useDataSource, useOnThiService } from '@openedu/data';
import type { DraftItem } from '@openedu/data/import';
import { useQueryClient } from '@tanstack/react-query';
import { Btn, Dialog, ErrorNote, Field, Loading } from '../../components/common';
import { SubjectOptions } from '../../components/SubjectOptions';
import { GRADES } from '../../lib/focusGrade';
import { typeLabel } from '../../lib/format';
import { errText, loadImportLib, readFileBytes, type ImportLib } from '../itembank/lib';
import { STYLE_LABEL, downloadOnThiTemplate } from './OnThiHome';

interface Form { title: string; minutes: number; points: number; passScore: number; lockOrder: boolean; showBoard: boolean; revealAnswers: boolean }

export function WordImportDialog({ open, onClose, style: style0, grade: grade0, nextPosition, onCreated }: {
  open: boolean; onClose: () => void; style: OnThiStyle; grade: Grade; nextPosition: number; onCreated: (setId: string) => void;
}) {
  const ds = useDataSource();
  const svc = useOnThiService();
  const qc = useQueryClient();
  const [lib, setLib] = useState<ImportLib | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [style, setStyle] = useState<OnThiStyle>(style0);
  const [grade, setGrade] = useState<Grade>(grade0);
  const [subject, setSubject] = useState<SubjectId>(ONTHI_STYLES[style0].subject);
  const [fileName, setFileName] = useState('');
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStyle(style0); setGrade(grade0); setSubject(ONTHI_STYLES[style0].subject);
    setDrafts(null); setWarn([]); setErr(''); setForm(null); setFileName(''); setBusy(null);
    if (!lib) loadImportLib().then(setLib, setLoadErr);
    // chỉ đặt lại khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = useMemo(() => (drafts && lib ? drafts.filter((d) => lib.draftStatus(d) === 'ready') : []), [drafts, lib]);
  const grades = useMemo(() => [...new Set(ready.map((d) => d.item.grade))], [ready]);
  const subjects = useMemo(() => [...new Set(ready.map((d) => d.item.subject))], [ready]);
  if (!open) return null;

  const read = async (f: File) => {
    if (!lib) return;
    setErr(''); setDrafts(null); setWarn([]);
    try {
      if (!/\.docx$/i.test(f.name)) throw new Error('Thầy/cô chọn tệp Word đuôi .docx (soạn theo tệp mẫu) nhé.');
      const bytes = await readFileBytes(f);
      if (bytes.length > lib.DOCX_MAX_BYTES) throw new Error('Tệp quá lớn (tối đa 15 MB).');
      const t = lib.docxToText(bytes);
      const r = lib.parseQuestionText(t.text, { subject, grade }, 'docx');
      if (!r.drafts.length) throw new Error('Không thấy câu hỏi nào. Mỗi câu cần bắt đầu bằng "Câu 1:", "Câu 2:"… và có dòng "Dạng: …" như tệp mẫu.');
      const w: string[] = [];
      if (t.autoNumbered) w.push(`Tệp có ${t.autoNumbered} đoạn dùng đánh số tự động của Word — số câu / chữ A, B, C ở các đoạn đó có thể bị mất. Nên gõ số bằng tay.`);
      if (t.hasImages) w.push('Tệp có hình ảnh: hình chưa được đưa vào câu hỏi. Thầy/cô thêm hình ở Ngân hàng câu hỏi sau khi tạo bài.');
      setDrafts(r.drafts);
      setWarn(w);
      setFileName(f.name);
      const okN = r.drafts.filter((d) => lib.draftStatus(d) === 'ready').length;
      const points = ONTHI_STYLES[style].points;
      setForm({
        title: f.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || `Bài luyện ${nextPosition}`,
        minutes: defaultMinutes(style, okN), points, passScore: defaultPassScore(style, okN, points),
        lockOrder: false, showBoard: true, revealAnswers: true,
      });
    } catch (e) {
      setErr(errText(e));
    }
  };

  const create = async () => {
    if (!form || !ready.length) return;
    if (grades.length > 1) { setErr('Các câu trong tệp thuộc nhiều lớp khác nhau. Một bài luyện chỉ dành cho một khối.'); return; }
    if (subjects.length > 1) { setErr('Các câu trong tệp thuộc nhiều môn. Một bài luyện chỉ có một môn.'); return; }
    const g = grades[0] ?? grade;
    const subj = subjects[0] ?? subject;
    setErr('');
    try {
      const ids: string[] = new Array(ready.length);
      let next = 0;
      let done = 0;
      setBusy(`Đang lưu câu hỏi 0/${ready.length}…`);
      const worker = async () => {
        while (next < ready.length) {
          const i = next++;
          const it = ready[i].item;
          const tags = [...new Set([...(it.tags ?? []), `onthi:${style}`])];
          const saved = await ds.saveItem({ ...it, tags } as Item);
          ids[i] = saved.id;
          done++;
          setBusy(`Đang lưu câu hỏi ${done}/${ready.length}…`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setBusy('Đang tạo bài luyện…');
      const max = ids.length * form.points;
      const set = await svc.saveSet({
        style, title: form.title.trim(), grade: g, subject: subj, itemIds: ids, minutes: form.minutes, points: form.points,
        passScore: Math.min(max, Math.max(0, form.passScore)), lockOrder: form.lockOrder, position: nextPosition,
        showBoard: form.showBoard, revealAnswers: form.revealAnswers, status: 'published',
      });
      void qc.invalidateQueries({ queryKey: onThiKeys.all });
      void qc.invalidateQueries({ queryKey: ['items'] });
      setBusy(null);
      onCreated(set.id);
    } catch (e) {
      setBusy(null);
      setErr(errText(e));
    }
  };

  const max = form ? ready.length * form.points : 0;
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title="Tạo bài luyện từ tệp Word" wide
      footer={<>
        <span className="tc-small tc-muted ot-foot">{busy ?? (drafts ? `${ready.length}/${drafts.length} câu sẵn sàng.` : 'Mỗi tệp Word là một bài luyện.')}</span>
        <Btn onClick={onClose} disabled={!!busy}>Hủy</Btn>
        <Btn kind="primary" icon="check" disabled={!!busy || !ready.length || !form?.title.trim()} onClick={() => void create()} data-testid="ot-create">Tạo bài luyện ({ready.length} câu)</Btn>
      </>}>
      {!lib ? (loadErr ? <ErrorNote error={loadErr} onRetry={() => { setLoadErr(null); loadImportLib().then(setLib, setLoadErr); }} /> : <Loading />) : (
        <div className="ot-import">
          <div className="ot-import__row">
            <Field label="Kiểu bài luyện">
              <select className="tc-input" value={style} onChange={(e) => { const v = e.target.value as OnThiStyle; setStyle(v); setSubject(ONTHI_STYLES[v].subject); }} disabled={!!drafts}>
                <option value="tn">Ôn thi {STYLE_LABEL.tn}</option>
                <option value="vio">Ôn thi {STYLE_LABEL.vio}</option>
              </select>
            </Field>
            <Field label="Khối" help="Dùng khi tệp không ghi “Lớp:”.">
              <select className="tc-input" value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade)} disabled={!!drafts}>
                {GRADES.map((g) => <option key={g} value={g}>Khối {g}</option>)}
              </select>
            </Field>
            <Field label="Môn" help="Dùng khi tệp không ghi “Môn:”.">
              <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)} disabled={!!drafts}>
                <SubjectOptions grade={grade} present={[subject]} />
              </select>
            </Field>
          </div>
          {!drafts ? (
            <div className="ot-drop">
              <p>Chọn tệp Word (.docx) soạn theo <button type="button" className="tc-link" onClick={() => void downloadOnThiTemplate(style)}>tệp mẫu Ôn thi {STYLE_LABEL[style]}</button>. Câu hỏi giữ đúng thứ tự trong tệp.</p>
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Chọn tệp Word" data-testid="ot-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.currentTarget.value = ''; }} />
            </div>
          ) : (
            <>
              <p className="tc-small"><b>{fileName}</b> · {drafts.length} câu · <button type="button" className="tc-link" onClick={() => { setDrafts(null); setForm(null); setErr(''); }}>Chọn tệp khác</button></p>
              {warn.map((w) => <p key={w} className="tc-alert tc-alert--warn tc-small">{w}</p>)}
              <ol className="ot-qlist" data-testid="ot-qlist">
                {drafts.map((d, i) => {
                  const st = lib.draftStatus(d);
                  const why = st === 'ready' ? [] : lib.draftReasons(d);
                  return (
                    <li key={d.rowId} className={`ot-q ot-q--${st}`}>
                      <span className="ot-q__no">{i + 1}</span>
                      <span className="ot-q__main">
                        <span className="ot-q__type">{typeLabel(d.item.type)}</span>
                        <span className="ot-q__text">{d.item.prompt.text || '(chưa có đề)'}</span>
                        {why.length ? <span className="ot-q__why">{why.join(' · ')}</span> : null}
                      </span>
                      <span className={`tc-chip ${st === 'ready' ? 'tc-chip--ok' : 'tc-chip--warn'}`}>{st === 'ready' ? 'Sẵn sàng' : st === 'missing-answer' ? 'Thiếu đáp án' : 'Cần sửa'}</span>
                    </li>
                  );
                })}
              </ol>
              {ready.length < drafts.length ? <p className="tc-small tc-muted">Câu chưa sẵn sàng sẽ không vào bài luyện. Thầy/cô sửa trong tệp Word rồi chọn lại tệp.</p> : null}
              {grades.length > 1 || subjects.length > 1 ? <p className="tc-alert tc-alert--warn tc-small">Các câu thuộc nhiều {grades.length > 1 ? 'lớp' : 'môn'} ({grades.length > 1 ? grades.map((g) => `lớp ${g}`).join(', ') : subjects.map((s) => SUBJECTS[s]?.name ?? s).join(', ')}). Một bài luyện chỉ dành cho một khối, một môn.</p> : null}
              {form ? (
                <div className="ot-import__form">
                  <Field label="Tên bài luyện"><input className="tc-input" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="ot-title" /></Field>
                  <div className="ot-import__row">
                    <Field label="Thời gian (phút)"><input className="tc-input" type="number" min={1} max={180} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} /></Field>
                    <Field label="Điểm mỗi câu"><input className="tc-input" type="number" min={0.5} max={100} step={0.5} value={form.points} onChange={(e) => { const p = Math.max(0.5, Number(e.target.value) || 1); setForm({ ...form, points: p, passScore: defaultPassScore(style, ready.length, p) }); }} /></Field>
                    <Field label={`Mức đạt (tối đa ${max})`}><input className="tc-input" type="number" min={0} max={max} value={form.passScore} onChange={(e) => setForm({ ...form, passScore: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} data-testid="ot-pass" /></Field>
                  </div>
                  <label className="tc-check"><input type="checkbox" checked={form.lockOrder} onChange={(e) => setForm({ ...form, lockOrder: e.target.checked })} /> Khóa theo thứ tự: học sinh phải đạt bài trước mới mở bài này</label>
                  <label className="tc-check"><input type="checkbox" checked={form.showBoard} onChange={(e) => setForm({ ...form, showBoard: e.target.checked })} /> Hiện bảng xếp hạng (10 bạn đầu và vị trí của em)</label>
                  <label className="tc-check"><input type="checkbox" checked={form.revealAnswers} onChange={(e) => setForm({ ...form, revealAnswers: e.target.checked })} /> Cho xem đáp án và giải thích khi xem lại bài</label>
                </div>
              ) : null}
            </>
          )}
          {err ? <p className="tc-alert tc-alert--error" role="alert">{err}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
