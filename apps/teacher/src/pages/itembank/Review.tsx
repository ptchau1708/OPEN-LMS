import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Grade, type Item, type ItemBase, type SubjectId, subjectInGrade, subjectOptionsFor } from '@openedu/contracts';
import { useDataSource, useItems } from '@openedu/data';
import { Btn, Dialog, Empty } from '../../components/common';
import { ItemPreview, ItemStudio, TypeBadge } from '../../components/items';
import { cx } from '../../lib/format';
import type { DraftItem as Draft } from '@openedu/data/import';
import { errText, type ImportLib } from './lib';
import { SkillPicker } from './SkillPicker';
import { SubjectOptions } from '../../components/SubjectOptions';

type Status = 'ready' | 'missing-answer' | 'review';

interface Row {
  d: Draft;
  selected: boolean;
  saved?: boolean;
  error?: string;
}

const DIFF: { value: NonNullable<ItemBase['difficulty']>; label: string }[] = [
  { value: 'nhan-biet', label: 'Nhận biết' },
  { value: 'ket-noi', label: 'Kết nối' },
  { value: 'van-dung', label: 'Vận dụng' },
];
const STATUS_TEXT: Record<Status | 'saved', string> = { ready: 'Sẵn sàng', 'missing-answer': 'Thiếu đáp án', review: 'Cần xem lại', saved: 'Đã lưu' };
const AI_ANSWER_TAG = 'dap-an-ai';
const SOURCE_TEXT: Record<string, string> = { text: 'văn bản dán', xlsx: 'tệp Excel', docx: 'tệp Word', ai: 'AI', manual: 'gõ nhanh' };

/** Màn hình soát chung cho mọi cách thêm nhanh: kiểm tra, sửa, gắn thẻ, lưu nhiều câu một lần. */
export function ReviewScreen({ lib, drafts, notes, onClose, onBack, onSaved }: { lib: ImportLib; drafts: Draft[]; notes?: string[]; onClose: () => void; onBack: () => void; onSaved?: (n: number) => void }) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const bank = useItems();
  const [rows, setRows] = useState<Row[]>(() => drafts.map((d) => ({ d, selected: true })));
  const [focus, setFocus] = useState<string | null>(drafts[0]?.rowId ?? null);
  const [skipDup, setSkipDup] = useState(true);
  const [detail, setDetail] = useState<Row | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  // Môn / lớp chung của các câu (đọc từ đề hoặc mặc định) → hiện sẵn ở hàng "Đặt cho … câu đã chọn".
  const [bulk, setBulk] = useState<{ subject: SubjectId | ''; grade: Grade | 0; difficulty: ItemBase['difficulty'] | ''; skills: string[] }>(() => {
    const one = <T,>(vals: T[]): T | undefined => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : undefined);
    return { subject: one(drafts.map((d) => d.item.subject)) ?? '', grade: one(drafts.map((d) => d.item.grade)) ?? 0, difficulty: '', skills: [] };
  });
  const bulkSubject = bulk.subject || focusRowSubject(drafts, focus);
  const bulkGrade = (bulk.grade || drafts.find((d) => d.rowId === focus)?.item.grade || 3) as Grade;

  const status = (r: Row): Status => lib.draftStatus(r.d);
  const dups = useMemo(() => {
    // Câu "cập nhật" (có Mã câu) không tính là trùng với chính nó — findDuplicate bỏ qua cùng id.
    const marks = lib.markDuplicates(rows.map((r) => r.d.item), (bank.data ?? []).filter((b) => !rows.some((r) => r.saved && r.d.item.id === b.id)));
    return Object.fromEntries(rows.map((r, i) => [r.d.rowId, marks[i]]));
  }, [rows, bank.data, lib]);
  const isBlockedDup = (r: Row): boolean => skipDup && !!dups[r.d.rowId] && !r.d.updatesExisting;
  const canSave = (r: Row): boolean => !r.saved && r.selected && status(r) === 'ready' && !isBlockedDup(r);

  const pending = rows.filter((r) => !r.saved);
  const counts = { ready: 0, 'missing-answer': 0, review: 0 } as Record<Status, number>;
  pending.forEach((r) => { counts[status(r)]++; });
  const dupCount = pending.filter((r) => dups[r.d.rowId]).length;
  const toSave = rows.filter(canSave);
  const selectedPending = pending.filter((r) => r.selected);
  const blocked = selectedPending.length - toSave.length;
  const focusRow = rows.find((r) => r.d.rowId === focus) ?? null;
  const busy = !!progress && progress.done < progress.total;
  const anyDemo = rows.some((r) => r.d.demo);

  const patch = (rowId: string, fn: (d: Draft) => Draft): void => setRows((rs) => rs.map((r) => (r.d.rowId === rowId ? { ...r, d: fn(r.d), error: undefined } : r)));
  const setItem = (rowId: string, item: Item): void => patch(rowId, (d) => ({ ...d, item }));
  const setAll = (selected: boolean): void => setRows((rs) => rs.map((r) => (r.saved ? r : { ...r, selected })));
  const selectReady = (): void => setRows((rs) => rs.map((r) => (r.saved ? r : { ...r, selected: status(r) === 'ready' && !isBlockedDup(r) })));

  const applyBulk = (): void => {
    setRows((rs) => rs.map((r) => {
      if (r.saved || !r.selected) return r;
      const it = { ...r.d.item } as Item;
      if (bulk.subject) it.subject = bulk.subject;
      if (bulk.grade) it.grade = bulk.grade;
      if (bulk.difficulty) it.difficulty = bulk.difficulty;
      if (bulk.skills.length) it.skills = [...new Set([...(it.skills ?? []), ...bulk.skills])];
      return { ...r, d: { ...r.d, item: it } };
    }));
  };

  const save = async (): Promise<void> => {
    const list = rows.filter(canSave);
    if (!list.length) return;
    setProgress({ done: 0, total: list.length, failed: 0 });
    let i = 0;
    let done = 0;
    let failed = 0;
    const worker = async (): Promise<void> => {
      while (i < list.length) {
        const r = list[i++];
        const it = { ...r.d.item, tags: (r.d.item.tags ?? []).filter((t) => t !== AI_ANSWER_TAG) } as Item;
        if (!it.tags?.length) delete it.tags;
        try {
          const saved = await ds.saveItem(it);
          setRows((rs) => rs.map((x) => (x.d.rowId === r.d.rowId ? { ...x, saved: true, selected: false, error: undefined, d: { ...x.d, item: saved } } : x)));
        } catch (e) {
          failed++;
          setRows((rs) => rs.map((x) => (x.d.rowId === r.d.rowId ? { ...x, error: errText(e) } : x)));
        }
        done++;
        setProgress({ done, total: list.length, failed });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    void qc.invalidateQueries({ queryKey: ['items'] });
    void qc.invalidateQueries({ queryKey: ['itemsByIds'] });
    onSaved?.(done - failed);
  };

  const allSaved = rows.length > 0 && rows.every((r) => r.saved);
  const savedCount = rows.filter((r) => r.saved).length;

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title="Soát câu hỏi trước khi lưu"
      full
      footer={
        <>
          <span className="tc-small tc-muted tc-qb-footnote">
            {progress ? (
              <span className="tc-row" role="status">
                <span className="tc-progress tc-qb-progress"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></span>
                {busy ? `Đang lưu ${progress.done}/${progress.total}…` : `Đã lưu ${progress.total - progress.failed}/${progress.total} câu${progress.failed ? ` — ${progress.failed} câu lỗi (xem dòng đỏ)` : ''}.`}
              </span>
            ) : blocked > 0 ? `${blocked} câu đã chọn chưa lưu được (thiếu đáp án / cần xem lại${skipDup ? ' / trùng' : ''}).` : 'Chỉ câu "Sẵn sàng" mới lưu được.'}
          </span>
          {allSaved ? <Btn kind="primary" onClick={onClose}>Xong — xem trong ngân hàng</Btn> : (
            <>
              <Btn onClick={onBack} disabled={busy || savedCount > 0}>Quay lại</Btn>
              <Btn onClick={onClose} disabled={busy}>{savedCount ? 'Đóng' : 'Hủy'}</Btn>
              <Btn kind="primary" icon="check" onClick={() => void save()} disabled={busy || toSave.length === 0} data-testid="qb-save">
                {busy ? 'Đang lưu…' : `Lưu ${toSave.length} câu vào ngân hàng`}
              </Btn>
            </>
          )}
        </>
      }
    >
      <div className="tc-qb-review">
        <div className="tc-qb-review__main">
          {notes?.length ? <div className="tc-alert tc-alert--info tc-qb-notes" role="status" data-testid="qb-review-notes"><span>{notes.join(' ')}</span></div> : null}
          <div className="tc-qb-summary">
            <span className="tc-chip tc-chip--ok">{STATUS_TEXT.ready}: {counts.ready}</span>
            <span className={cx('tc-chip', counts['missing-answer'] > 0 && 'tc-chip--warn')}>{STATUS_TEXT['missing-answer']}: {counts['missing-answer']}</span>
            <span className={cx('tc-chip', counts.review > 0 && 'tc-chip--danger')}>{STATUS_TEXT.review}: {counts.review}</span>
            {dupCount ? <span className="tc-chip tc-chip--warn">Trùng: {dupCount}</span> : null}
            {savedCount ? <span className="tc-chip tc-chip--ok">Đã lưu: {savedCount}</span> : null}
            {anyDemo ? <span className="tc-chip tc-qb-demo">bản mẫu (demo)</span> : null}
            <span className="tc-ebar__spacer" />
            <label className="tc-switch"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> Bỏ qua câu trùng</label>
          </div>

          <div className="tc-qb-bulk tc-card tc-card--flat">
            <span className="tc-small"><strong>Đặt cho {selectedPending.length} câu đã chọn:</strong></span>
            <select className="tc-input tc-input--sm" aria-label="Môn cho các câu đã chọn" value={bulk.subject} onChange={(e) => setBulk({ ...bulk, subject: e.target.value as SubjectId | '', skills: [] })}>
              <option value="">Môn…</option>{subjectOptionsFor(bulk.grade, [bulk.subject]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="tc-input tc-input--sm" aria-label="Lớp cho các câu đã chọn" value={bulk.grade} onChange={(e) => { const g = Number(e.target.value) as Grade | 0; setBulk({ ...bulk, grade: g, skills: [], ...(g && bulk.subject && !subjectInGrade(bulk.subject, g) ? { subject: '' as const } : {}) }); }}>
              <option value={0}>Lớp…</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
            <select className="tc-input tc-input--sm" aria-label="Mức độ cho các câu đã chọn" value={bulk.difficulty ?? ''} onChange={(e) => setBulk({ ...bulk, difficulty: e.target.value as ItemBase['difficulty'] | '' })}>
              <option value="">Mức độ…</option>{DIFF.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {bulkSubject ? (
              <SkillPicker subject={bulkSubject} grade={bulkGrade} value={bulk.skills} onChange={(skills) => setBulk({ ...bulk, skills })} compact />
            ) : null}
            <Btn size="sm" onClick={applyBulk} disabled={!selectedPending.length || (!bulk.subject && !bulk.grade && !bulk.difficulty && !bulk.skills.length)}>Áp dụng</Btn>
            <span className="tc-ebar__spacer" />
            <Btn size="sm" kind="ghost" onClick={() => setAll(true)}>Chọn tất cả</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setAll(false)}>Bỏ chọn</Btn>
            <Btn size="sm" kind="ghost" onClick={selectReady}>Chỉ chọn câu sẵn sàng</Btn>
            <a className="tc-small" href="/ki-nang" target="_blank" rel="noreferrer" title="Xem, thêm, sửa kĩ năng; xuất danh mục kĩ năng ra Excel">Danh mục kĩ năng ↗</a>
          </div>

          {!rows.length ? <Empty icon="puzzle" title="Không đọc được câu hỏi nào">Thầy cô quay lại, kiểm tra nội dung rồi thử lại nhé.</Empty> : (
            <ol className="tc-qb-rows" aria-label="Các câu đọc được">
              {rows.map((r, idx) => {
                const st = r.saved ? 'saved' : status(r);
                const dup = dups[r.d.rowId];
                const reasons = r.saved ? [] : lib.draftReasons(r.d);
                const aiAnswer = (r.d.item.tags ?? []).includes(AI_ANSWER_TAG);
                return (
                  <li key={r.d.rowId} className={cx('tc-qb-row', `is-${st}`, focus === r.d.rowId && 'is-focus', r.error && 'is-error')} onFocusCapture={() => setFocus(r.d.rowId)} onClick={() => setFocus(r.d.rowId)} data-testid="qb-row">
                    <div className="tc-qb-row__head">
                      <input type="checkbox" aria-label={`Chọn câu ${idx + 1}`} checked={r.selected} disabled={r.saved} onChange={(e) => setRows((rs) => rs.map((x) => (x.d.rowId === r.d.rowId ? { ...x, selected: e.target.checked } : x)))} />
                      <strong className="tc-qb-row__num">{idx + 1}</strong>
                      <span className={cx('tc-chip', st === 'ready' || st === 'saved' ? 'tc-chip--ok' : st === 'missing-answer' ? 'tc-chip--warn' : 'tc-chip--danger')} data-testid="qb-status">{STATUS_TEXT[st]}</span>
                      <TypeBadge type={r.d.item.type} />
                      {lib.isTrueFalse(r.d.item) ? <span className="tc-chip">Đúng – Sai</span> : null}
                      {r.d.updatesExisting ? <span className="tc-chip" title="Dòng có Mã câu của một câu trong ngân hàng">Cập nhật câu đã có</span> : null}
                      {dup && !r.d.updatesExisting ? <span className="tc-chip tc-chip--warn" title={dup.startsWith('bank:') ? 'Ngân hàng đã có câu cùng đề' : `Trùng với câu ${Number(dup.slice(6)) + 1} trong danh sách này`}>{dup.startsWith('bank:') ? 'Trùng ngân hàng' : `Trùng câu ${Number(dup.slice(6)) + 1}`}</span> : null}
                      {r.d.demo ? <span className="tc-chip tc-qb-demo">bản mẫu (demo)</span> : null}
                      <span className="tc-ebar__spacer" />
                      {!r.saved ? (
                        <>
                          {r.d.review && !lib.checkItem(r.d.item).problems.length ? <Btn size="sm" onClick={() => patch(r.d.rowId, (d) => ({ ...d, review: undefined }))}>Đã xem, giữ câu này</Btn> : null}
                          <Btn size="sm" kind="ghost" icon="pencil" onClick={() => setDetail(r)}>Sửa chi tiết</Btn>
                          <Btn size="sm" kind="ghost" icon="trash" aria-label={`Bỏ câu ${idx + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.d.rowId !== r.d.rowId))} />
                        </>
                      ) : null}
                    </div>
                    {r.saved ? <p className="tc-qb-row__saved">{r.d.item.prompt.text}</p> : (
                      <>
                        <InlineEditor item={r.d.item} lib={lib} onChange={(it) => setItem(r.d.rowId, it)} />
                        <div className="tc-qb-row__meta">
                          <select className="tc-input tc-input--sm" aria-label="Môn" value={r.d.item.subject} onChange={(e) => setItem(r.d.rowId, { ...r.d.item, subject: e.target.value as SubjectId, skills: [] } as Item)}>
                            <SubjectOptions grade={r.d.item.grade} present={[r.d.item.subject]} />
                          </select>
                          <select className="tc-input tc-input--sm" aria-label="Lớp" value={r.d.item.grade} onChange={(e) => setItem(r.d.rowId, { ...r.d.item, grade: Number(e.target.value) as Grade } as Item)}>
                            {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
                          </select>
                          <select className="tc-input tc-input--sm" aria-label="Mức độ" value={r.d.item.difficulty ?? ''} onChange={(e) => setItem(r.d.rowId, { ...r.d.item, difficulty: (e.target.value || undefined) as ItemBase['difficulty'] } as Item)}>
                            <option value="">Mức độ…</option>{DIFF.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                          <SkillPicker subject={r.d.item.subject} grade={r.d.item.grade} value={r.d.item.skills ?? []} onChange={(skills) => setItem(r.d.rowId, { ...r.d.item, skills } as Item)} compact />
                        </div>
                      </>
                    )}
                    {reasons.length || aiAnswer || r.error ? (
                      <ul className="tc-qb-row__notes">
                        {r.error ? <li className="is-error">Chưa lưu được: {r.error}</li> : null}
                        {aiAnswer && !r.saved ? <li>Đề gốc không ghi đáp án — đáp án do AI tự giải, thầy cô kiểm tra lại nhé.</li> : null}
                        {reasons.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    ) : null}
                    {r.d.raw && st === 'review' && r.d.source !== 'xlsx' ? <details className="tc-qb-raw"><summary>Xem chữ gốc</summary><pre>{r.d.raw}</pre></details> : null}
                    {r.d.source === 'xlsx' && r.d.raw ? <span className="tc-muted tc-small">{r.d.raw}</span> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <aside className="tc-qb-review__side" aria-label="Xem trước">
          {focusRow ? (
            <>
              <p className="tc-small tc-muted">Xem trước câu {rows.indexOf(focusRow) + 1} · nguồn: {SOURCE_TEXT[focusRow.d.source] ?? focusRow.d.source}</p>
              {lib.checkItem(focusRow.d.item).problems.length ? <Empty icon="eye" title="Chưa xem trước được">Sửa các lỗi của câu này trước.</Empty> : <ItemPreview key={`${focusRow.d.rowId}:${focusRow.d.item.type}`} item={focusRow.d.item} compact />}
            </>
          ) : <Empty icon="eye" title="Chọn một câu để xem trước" />}
        </aside>
      </div>
      {detail ? (
        <DetailEditor
          item={rows.find((x) => x.d.rowId === detail.d.rowId)?.d.item ?? detail.d.item}
          onClose={() => setDetail(null)}
          onDone={(it) => { setItem(detail.d.rowId, it); setDetail(null); }}
        />
      ) : null}
    </Dialog>
  );
}

function focusRowSubject(drafts: Draft[], focus: string | null): SubjectId | '' {
  return drafts.find((d) => d.rowId === focus)?.item.subject ?? drafts[0]?.item.subject ?? '';
}

function DetailEditor({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: (it: Item) => void }) {
  const [draft, setDraft] = useState<Item>(item);
  return (
    <Dialog open onClose={onClose} title="Sửa chi tiết câu hỏi" full footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" onClick={() => onDone(draft)}>Xong</Btn></>}>
      <ItemStudio item={draft} onChange={setDraft} />
    </Dialog>
  );
}

const L = (i: number): string => String.fromCharCode(65 + i);

/** Sửa nhanh ngay trong bảng: đề + lựa chọn + đáp án (Trắc nghiệm, Nhiều đáp án, Điền đáp án). Dạng khác: "Sửa chi tiết". */
function InlineEditor({ item, onChange, lib }: { item: Item; onChange: (it: Item) => void; lib: ImportLib }) {
  const prompt = (
    <textarea className="tc-input tc-qb-prompt" rows={Math.min(6, Math.max(1, Math.ceil(item.prompt.text.length / 90), item.prompt.text.split('\n').length))} value={item.prompt.text} aria-label="Câu hỏi" placeholder="Câu hỏi" onChange={(e) => onChange({ ...item, prompt: { ...item.prompt, text: e.target.value } } as Item)} />
  );
  if (item.type === 'MCQ' || item.type === 'MCQ_MULTIPLE') {
    const multi = item.type === 'MCQ_MULTIPLE';
    const opts = item.payload.options;
    const correct = multi ? item.key?.correct ?? [] : item.key?.correct ? [item.key.correct] : [];
    const tf = lib.isTrueFalse(item);
    const emit = (options: typeof opts, corr: string[]): void => {
      const ids = new Set(options.map((o) => o.id));
      const c = corr.filter((x) => ids.has(x));
      if (multi) onChange({ ...item, payload: { ...item.payload, options }, key: { ...item.key, correct: c } } as Item);
      else onChange({ ...item, payload: { ...item.payload, options }, key: { ...item.key, correct: c[0] ?? '' } } as Item);
    };
    const nextId = (): string => { for (let i = 0; i < 26; i++) { const id = String.fromCharCode(97 + i); if (!opts.some((o) => o.id === id)) return id; } return `o${opts.length + 1}`; };
    return (
      <div className="tc-qb-edit">
        {prompt}
        <div className={cx('tc-qb-opts', tf && 'tc-qb-opts--tf')} role="group" aria-label="Lựa chọn">
          {opts.map((o, i) => {
            const on = correct.includes(o.id);
            return (
              <span key={o.id} className={cx('tc-qb-opt', on && 'is-correct')}>
                <label className="tc-qb-opt__mark" title="Đánh dấu đáp án đúng">
                  <input type={multi ? 'checkbox' : 'radio'} checked={on} aria-label={`Đáp án đúng là ${L(i)}`} onChange={() => emit(opts, multi ? (on ? correct.filter((x) => x !== o.id) : [...correct, o.id]) : [o.id])} />
                  {L(i)}
                </label>
                {tf ? <span className="tc-qb-opt__tf">{o.text}</span> : (
                  <>
                    <input className="tc-input tc-input--sm" value={o.text ?? ''} aria-label={`Lựa chọn ${L(i)}`} onChange={(e) => emit(opts.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)), correct)} />
                    {opts.length > 2 ? <button type="button" className="tc-qb-x" aria-label={`Xoá lựa chọn ${L(i)}`} onClick={() => emit(opts.filter((x) => x.id !== o.id), correct)}>×</button> : null}
                  </>
                )}
              </span>
            );
          })}
          {!tf && opts.length < 6 ? <Btn size="sm" kind="ghost" icon="plus" onClick={() => emit([...opts, { id: nextId(), text: '' }], correct)}>Lựa chọn</Btn> : null}
          {!tf ? (
            <label className="tc-switch tc-small" title="Cho phép chọn nhiều đáp án đúng">
              <input type="checkbox" checked={multi} onChange={(e) => {
                if (e.target.checked) onChange({ ...item, type: 'MCQ_MULTIPLE', payload: { ...item.payload, options: opts }, key: { correct } } as Item);
                else onChange({ ...item, type: 'MCQ', payload: { ...item.payload, options: opts }, key: { correct: correct[0] ?? '' } } as Item);
              }} /> Nhiều đáp án
            </label>
          ) : null}
        </div>
      </div>
    );
  }
  if (item.type === 'SHORT_ANSWER') {
    const acc = item.key?.accepted ?? [];
    return (
      <div className="tc-qb-edit">
        {prompt}
        <div className="tc-qb-opts">
          <label className="tc-qb-answer">
            <span className="tc-small">Đáp án đúng</span>
            <input className="tc-input tc-input--sm" defaultValue={acc.join('; ')} key={acc.join('\u0000')} placeholder="Ví dụ: 24 (nhiều cách viết: 0,5; 1/2)" aria-label="Đáp án đúng" onBlur={(e) => {
              const list = e.target.value.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
              const numeric = list.length > 0 && list.every((a) => /^-?\d+(?:[.,]\d+)?$/.test(a));
              const { inputMode: _m, ...rest } = item.payload;
              onChange({ ...item, payload: { ...rest, ...(numeric ? { inputMode: 'numeric' as const } : {}) }, key: { ...item.key, accepted: list } } as Item);
            }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="tc-qb-answer tc-qb-answer--unit">
            <span className="tc-small">Đơn vị</span>
            <input className="tc-input tc-input--sm" value={item.payload.unit ?? ''} placeholder="cm, kg…" aria-label="Đơn vị" onChange={(e) => { const { unit: _u, ...rest } = item.payload; onChange({ ...item, payload: { ...rest, ...(e.target.value.trim() ? { unit: e.target.value } : {}) } } as Item); }} />
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className="tc-qb-edit">
      {prompt}
      <p className="tc-small tc-muted">{summary(item)} — bấm "Sửa chi tiết" để sửa thẻ và đáp án.</p>
    </div>
  );
}

function summary(item: Item): string {
  if (item.type === 'ORDERING') {
    const by = new Map(item.payload.items.map((c) => [c.id, c.text ?? '']));
    return `Thứ tự đúng: ${(item.key?.order ?? []).map((id) => by.get(id)).join(' → ')}`;
  }
  if (item.type === 'MATCHING') {
    const right = new Map(item.payload.right.map((c) => [c.id, c.text ?? '']));
    return item.payload.left.map((l) => `${l.text} – ${right.get(item.key?.pairs?.[l.id] ?? '') ?? '?'}`).join(' · ');
  }
  if (item.type === 'FILL_IN_PASSAGE') return item.payload.passage;
  return '';
}
