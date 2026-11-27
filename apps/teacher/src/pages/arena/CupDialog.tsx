/** Mở giải đấu loại trực tiếp (GV). Có thể mở từ Ngân hàng câu hỏi với các câu đã chọn. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { fitSubjectToGrade, SUBJECTS, type ArenaScope, type ClassInfo, type CupEntry, type CupPace, type CupSeeding, type SubjectId } from '@openedu/contracts';
import { roundsFor, useArenaSettings, useCreateCup } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field, Seg } from '../../components/common';
import { SubjectOptions } from '../../components/SubjectOptions';
import { GroupField } from './shared';
import { useFocusGrade } from '../../lib/focusGrade';

type Src = 'auto' | 'picked' | 'pool';
const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 1440];
const minText = (m: number) => (m >= 1440 ? 'cả ngày' : m >= 60 ? `${m / 60} giờ` : `${m} phút`);

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CupDialog({ classes, classId: initClass, itemIds, onClose }: { classes: ClassInfo[]; classId?: string; itemIds?: string[]; onClose: () => void }) {
  const nav = useNavigate();
  const create = useCreateCup();
  const [classId, setClassId] = useState(initClass ?? classes[0]?.id ?? '');
  const cls = classes.find((c) => c.id === classId);
  const focus = useFocusGrade().grade;
  const grade = cls?.grade ?? focus;
  const settings = useArenaSettings(classId || undefined);
  const pool = settings.data?.itemIds ?? [];
  const [src, setSrc] = useState<Src>(itemIds?.length ? 'picked' : 'auto');
  const [subject, setSubject] = useState<SubjectId>(fitSubjectToGrade('toan', grade));
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<ArenaScope>('class');
  const [questions, setQuestions] = useState(7);
  const [entry, setEntry] = useState<CupEntry>('all');
  const [later, setLater] = useState(false);
  const [startAt, setStartAt] = useState(() => localInput(new Date(Date.now() + 3600_000)));
  const [pace, setPace] = useState<CupPace>('continuous');
  const [minutes, setMinutes] = useState(15);
  const [seeding, setSeeding] = useState<CupSeeding>('random');
  const n = scope === 'class' ? cls?.studentIds.length ?? 0 : 0;
  const autoTitle = `Giải ${SUBJECTS[subject]?.name ?? ''} ${scope === 'grade' ? `khối ${grade}` : `lớp ${cls?.name ?? ''}`}`.replace(/\s+/g, ' ').trim();
  const chosen = src === 'picked' ? itemIds ?? [] : src === 'pool' ? pool : [];
  const err = useMemo(() => {
    if (!classId) return 'Thầy/cô chọn lớp.';
    if (src !== 'auto' && chosen.length < questions) return `Cần ít nhất ${questions} câu (đang có ${chosen.length}).`;
    if (later && !startAt) return 'Thầy/cô chọn giờ bắt đầu.';
    return '';
  }, [classId, src, chosen.length, questions, later, startAt]);

  const submit = () => {
    create.mutate({
      title: title.trim() || autoTitle, scope, classId, subject, source: src === 'auto' ? 'auto' : 'picked', itemIds: chosen,
      questions, seeding, entry, roundMinutes: minutes, pace,
      ...(later || entry === 'signup' ? { startAt: new Date(later ? startAt : Date.now() + 24 * 3600_000).toISOString() } : {}),
    }, { onSuccess: (c) => { onClose(); nav(`/dau-truong/giai/${c.id}`); } });
  };

  return (
    <Dialog open wide title="Mở giải đấu loại trực tiếp" onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" icon="trophy" disabled={!!err || create.isPending} onClick={submit} data-testid="cup-create">{create.isPending ? 'Đang mở giải…' : 'Mở giải'}</Btn>
    </>}>
      <div className="tc-stack tc-cupform">
        <p className="tc-small tc-muted">
          Mỗi vòng mở trong một khung giờ. Hai bạn trong cặp làm <b>cùng bộ câu</b> (không cần vào cùng lúc); ai đúng nhiều hơn đi tiếp —
          bằng nhau thì ai nhanh hơn. Hết giờ mà một bạn chưa đấu thì bạn kia thắng. Cuối giải: Vô địch, Á quân, đồng Hạng ba nhận sao, cúp và giấy khen.
        </p>
        <div className="tc-grid2">
          <Field label="Lớp">
            <select className="tc-input" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="cup-class">
              {classes.map((c) => <option key={c.id} value={c.id}>Lớp {c.name}</option>)}
            </select>
          </Field>
          <Field label="Tên giải">
            <input className="tc-input" value={title} placeholder={autoTitle} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="cup-title" />
          </Field>
        </div>
        <Seg label="Phạm vi" value={scope} onChange={setScope} options={[
          { value: 'class', label: `Trong lớp ${cls?.name ?? ''}` }, { value: 'grade', label: `Cả khối ${grade} (mọi lớp)` },
        ]} />
        <div className="tc-grid2">
          <Field label="Môn">
            <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)} data-testid="cup-subject">
              <SubjectOptions grade={grade} />
            </select>
          </Field>
          <GroupField label="Số câu mỗi trận (20 giây / câu)">
            <Seg label="Số câu mỗi trận" value={questions} onChange={setQuestions} options={[3, 5, 7, 10].map((v) => ({ value: v, label: `${v} câu` }))} />
          </GroupField>
        </div>
        <GroupField label="Câu hỏi" help={src === 'auto' ? 'Máy chọn ngẫu nhiên trong ngân hàng câu hỏi (cùng môn, cùng khối, dạng trả lời nhanh có đáp án); hai bạn cùng cặp làm cùng bộ câu, các vòng sau ưu tiên câu chưa gặp.' : undefined}>
          <Seg label="Nguồn câu hỏi" value={src} onChange={setSrc} options={[
            { value: 'auto', label: 'Tự động theo môn' },
            ...(itemIds?.length ? [{ value: 'picked' as Src, label: `${itemIds.length} câu vừa chọn` }] : []),
            { value: 'pool', label: `Bộ câu Đấu trường của lớp (${pool.length})` },
          ]} />
        </GroupField>
        <Seg label="Người tham gia" value={entry} onChange={setEntry} options={[
          { value: 'all', label: 'Tất cả học sinh' }, { value: 'signup', label: 'Học sinh tự đăng kí' },
        ]} />
        <div className="tc-grid2">
          <GroupField label="Bắt đầu" help={entry === 'signup' && !later ? 'Học sinh tự đăng kí: giải bắt đầu sau 1 ngày, hoặc thầy/cô bấm "Bắt đầu ngay" trong trang giải.' : undefined}>
            <div className="tc-row tc-wrap">
              <Seg label="Thời điểm bắt đầu" value={later ? 'later' : 'now'} onChange={(v) => setLater(v === 'later')} options={[
                { value: 'now', label: entry === 'signup' ? 'Sau 1 ngày' : 'Ngay bây giờ' }, { value: 'later', label: 'Hẹn giờ' },
              ]} />
              {later ? <input className="tc-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Giờ bắt đầu" /> : null}
            </div>
          </GroupField>
          <GroupField label="Hạt giống">
            <Seg label="Xếp hạt giống" value={seeding} onChange={setSeeding} options={[
              { value: 'random', label: 'Bốc thăm' }, { value: 'mastery', label: 'Theo mức thành thạo môn' },
            ]} />
          </GroupField>
        </div>
        <div className="tc-grid2">
          <GroupField label="Nhịp các vòng">
            <Seg label="Nhịp các vòng" value={pace} onChange={(v) => { setPace(v); setMinutes(v === 'daily' ? 120 : 15); }} options={[
              { value: 'continuous', label: 'Vòng sau mở ngay (đấu trên lớp)' }, { value: 'daily', label: 'Mỗi ngày một vòng (đấu ở nhà)' },
            ]} />
          </GroupField>
          <Field label="Thời gian mỗi vòng">
            <select className="tc-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} data-testid="cup-minutes">
              {MINUTES.map((m) => <option key={m} value={m}>{minText(m)}</option>)}
            </select>
          </Field>
        </div>
        <p className="tc-small" role="status">
          {n >= 2 ? `${entry === 'all' ? n : 'Tối đa ' + n} học sinh → ${roundsFor(n)} vòng` : scope === 'grade' ? 'Học sinh cả khối tham gia (tối đa 256 bạn).' : ''}
          {err ? <b className="tc-warn"> · {err}</b> : null}
        </p>
        <ErrorNote error={create.error} />
      </div>
    </Dialog>
  );
}
