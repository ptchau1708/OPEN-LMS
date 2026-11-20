import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { SUBJECTS, TT27_TERM_LABEL, type Exam, type ExamSlot, type ExamVariant, type Item } from '@openedu/contracts';
import { paperPoints, useClass, useExam, useItemsByIds, useSchoolSettings } from '@openedu/data';
import { Btn, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { ExamTabs, LevelTag, PrintBody, fmtPoints, keyText } from './shared';

type View = 'A' | 'B' | 'key' | 'all';

function Paper({ exam, v, items, school, className }: { exam: Exam; v: ExamVariant; items: Record<string, Item>; school: string; className: string }) {
  const slots = exam.paper[v].filter((s) => s.itemId).map((s, i) => ({ ...s, no: i + 1 }));
  const tn = slots.filter((s) => s.qtype === 'tn');
  const tl = slots.filter((s) => s.qtype === 'tl');
  const part = (title: string, list: ExamSlot[]) => list.length ? (
    <section className="ex-part">
      <h3>{title} <span>({fmtPoints(paperPoints(list))} điểm)</span></h3>
      {list.map((s) => {
        const it = items[s.itemId!];
        return (
          <div key={s.id} className="ex-q">
            <p className="ex-q__stem"><b>Câu {s.no}.</b> <i>({fmtPoints(s.points)} đ)</i> {it?.prompt.text ?? '…'}</p>
            {it?.prompt.image ? <img className="ex-q__img" src={it.prompt.image} alt="" /> : null}
            {it ? <PrintBody item={it} /> : null}
          </div>
        );
      })}
    </section>
  ) : null;
  return (
    <article className="ex-sheet">
      <header className="ex-sheet__head">
        <div><b>{school.toUpperCase()}</b><br />Lớp: {className}<br />Họ và tên: ……………………………</div>
        <div className="ex-c">
          <b>{exam.title.toUpperCase()}</b><br />Môn {SUBJECTS[exam.subject]?.name ?? exam.subject}{exam.termId ? ` · ${TT27_TERM_LABEL[exam.termId]}` : ''}<br />
          Thời gian làm bài: {exam.durationMin} phút <span className="ex-variant">Đề {v}</span>
        </div>
      </header>
      <table className="ex-scorebox"><tbody><tr><td>Điểm</td><td>Nhận xét của giáo viên</td></tr><tr><td /><td /></tr></tbody></table>
      {part('Phần I. Trắc nghiệm', tn)}
      {part('Phần II. Tự luận', tl)}
      <p className="ex-end">— Hết —</p>
    </article>
  );
}

function AnswerKey({ exam, v, items }: { exam: Exam; v: ExamVariant; items: Record<string, Item> }) {
  const slots = exam.paper[v].filter((s) => s.itemId).map((s, i) => ({ ...s, no: i + 1 }));
  return (
    <article className="ex-sheet ex-sheet--key">
      <h2>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM — ĐỀ {v}</h2>
      <p className="ex-c">{exam.title} · Tổng {fmtPoints(paperPoints(slots))} điểm · Điểm KTĐK làm tròn thành số nguyên (0,5 làm tròn lên), không cho điểm 0.</p>
      <table className="ex-keytable">
        <thead><tr><th>Câu</th><th>Mức</th><th>Đáp án</th><th>Điểm</th><th>Hướng dẫn</th></tr></thead>
        <tbody>
          {slots.map((s) => {
            const it = items[s.itemId!];
            return <tr key={s.id}><td>{s.no}</td><td><LevelTag level={s.level} /></td><td><b>{it ? keyText(it) : ''}</b></td><td>{fmtPoints(s.points)}</td><td className="ex-small">{s.qtype === 'tl' ? it?.explanation ?? '' : ''}</td></tr>;
          })}
        </tbody>
      </table>
    </article>
  );
}

export default function ExamPrint() {
  const { examId } = useParams();
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('xem') as View) || 'A';
  const eq = useExam(examId);
  const exam = eq.data ?? null;
  const ids = useMemo(() => (exam ? [...exam.paper.A, ...exam.paper.B].map((s) => s.itemId).filter((x): x is string => !!x) : []), [exam]);
  const items = useItemsByIds(ids);
  const cls = useClass(exam?.classId);
  const school = useSchoolSettings();
  if (eq.isLoading || items.isLoading) return <div className="tc-page"><Loading /></div>;
  if (!exam) return <div className="tc-page"><ErrorNote error={eq.error ?? new Error('Không tìm thấy đề.')} /></div>;
  const map = items.data ?? {};
  const name = school.data?.schoolName ?? 'Trường Tiểu học';
  const cn = cls.data?.name ?? '……';
  const views: ExamVariant[] = view === 'B' ? ['B'] : view === 'A' || view === 'key' ? ['A'] : ['A', 'B'];
  return (
    <div className="tc-page ex-page ex-printpage">
      <div className="ex-noprint">
        <PageHead title="Bản in" sub="Khổ A4. Trình duyệt: In → Lưu PDF hoặc chọn máy in. Đề in giữ thứ tự gốc (không xáo)."
          actions={<Btn kind="primary" icon="upload" onClick={() => window.print()}>In</Btn>} />
        <ExamTabs exam={exam} />
        <div className="ex-pad0"><Seg label="Phần in" value={view} onChange={(v) => setSp({ xem: v }, { replace: true })} options={[{ value: 'A', label: 'Đề A' }, { value: 'B', label: 'Đề B' }, { value: 'key', label: 'Đáp án A + B' }, { value: 'all', label: 'Cả bộ (A, B, đáp án)' }]} /></div>
      </div>
      <div className="ex-sheets">
        {view !== 'key' ? views.map((v) => <Paper key={v} exam={exam} v={v} items={map} school={name} className={cn} />) : null}
        {view === 'key' || view === 'all' ? (['A', 'B'] as const).map((v) => <AnswerKey key={`k${v}`} exam={exam} v={v} items={map} />) : null}
      </div>
    </div>
  );
}
