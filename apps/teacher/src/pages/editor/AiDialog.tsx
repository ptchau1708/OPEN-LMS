import { useState } from 'react';
import { fitSubjectToGrade, type Grade, type Lesson, type SubjectId } from '@openedu/contracts';
import { useDataSource } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field, Seg } from '../../components/common';
import { aiDraft, type DraftResult } from '../../lib/aiDraft';
import { SubjectOptions } from '../../components/SubjectOptions';

export function AiDialog({ open, onClose, lesson, onApply }: { open: boolean; onClose: () => void; lesson: Lesson; onApply: (r: DraftResult, mode: 'replace' | 'append') => Promise<void> }) {
  const ds = useDataSource();
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState<Grade>(lesson.grade);
  const [subject, setSubject] = useState<SubjectId>(lesson.subject);
  const [mode, setMode] = useState<'append' | 'replace'>(lesson.slides.length <= 1 ? 'replace' : 'append');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<DraftResult | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await aiDraft(ds, text, grade, subject, topic || lesson.title);
      await onApply(r, mode);
      setDone(r);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setDone(null); onClose(); };

  return (
    <Dialog open={open} onClose={close} title="AI tạo bài từ SGK" wide footer={done ? <Btn kind="primary" onClick={close}>Xong</Btn> : <><Btn onClick={close}>Hủy</Btn><Btn kind="primary" onClick={run} disabled={busy || text.trim().length < 20}>{busy ? 'Đang soạn…' : 'Tạo bản nháp'}</Btn></>}>
      {ds.mode === 'demo' ? (
        <div className="tc-alert tc-alert--info">
          <span><strong>Chế độ demo:</strong> bản nháp được soạn ngay trên máy bằng quy tắc đơn giản (slide tiêu đề, mỗi đoạn một slide ảnh + chữ, cứ 2 đoạn một câu hỏi trắc nghiệm giữ chỗ, slide tổng kết). Tạo bài bằng AI thật cần kết nối Supabase (Edge Function <code>ai-gateway</code>, tác vụ <code>lesson_outline</code>).</span>
        </div>
      ) : null}
      {done ? (
        <div className="tc-alert tc-alert--ok">
          <span>Đã thêm <strong>{done.slides.length} slide</strong> và <strong>{done.items.length} câu hỏi giữ chỗ</strong> (đã lưu vào ngân hàng){done.source === 'local' ? ' — soạn trên máy' : ' — do AI soạn'}. Hãy xem lại chữ, ảnh và đáp án trước khi dạy.{done.note === 'no-client' ? ' (Nguồn dữ liệu không mở Supabase client nên dùng cách soạn trên máy.)' : ''}</span>
        </div>
      ) : (
        <div className="tc-stack">
          <Field label="Tên bài / chủ đề"><input className="tc-input" value={topic} placeholder={lesson.title} onChange={(e) => setTopic(e.target.value)} /></Field>
          <Field label="Nội dung SGK (dán vào đây)" help="Các đoạn cách nhau một dòng trống.">
            <textarea className="tc-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ví dụ:\nCon vật sống ở nhiều nơi khác nhau.\n\nCá, tôm, cua sống dưới nước…\n\nTrâu, bò, gà sống trên cạn…'} />
          </Field>
          <div className="tc-row tc-wrap">
            <Field label="Môn"><select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)}><SubjectOptions grade={grade} present={[subject]} /></select></Field>
            <div className="tc-field"><span className="tc-field__label">Lớp</span><Seg label="Lớp" value={grade} onChange={(g) => { setGrade(g); setSubject((s) => fitSubjectToGrade(s, g)); }} options={[1, 2, 3, 4, 5].map((g) => ({ value: g as Grade, label: String(g) }))} /></div>
            <div className="tc-field"><span className="tc-field__label">Đưa vào bài</span><Seg label="Cách thêm" value={mode} onChange={setMode} options={[{ value: 'append', label: 'Thêm vào cuối' }, { value: 'replace', label: 'Thay toàn bộ slide' }]} /></div>
          </div>
          <ErrorNote error={err} />
        </div>
      )}
    </Dialog>
  );
}
