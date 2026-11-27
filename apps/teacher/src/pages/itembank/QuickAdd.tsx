import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { fitSubjectToGrade, skillShort, SUBJECTS, type Grade, type ItemBase, type ItemType, type SubjectId } from '@openedu/contracts';
import { useDataSource, useItems } from '@openedu/data';
import type { DraftItem } from '@openedu/data/import';
import { Btn, Dialog, ErrorNote, Field, Loading, Seg } from '../../components/common';
import { cx, typeLabel } from '../../lib/format';
import { downloadBytes, loadImportLib, readFileBytes, type ImportLib } from './lib';
import { ReviewScreen } from './Review';
import { SkillPicker } from './SkillPicker';
import '../../styles/itembank.css';
import { SubjectOptions } from '../../components/SubjectOptions';
import { useFocusGrade } from '../../lib/focusGrade';

type Tab = 'file' | 'paste' | 'scan' | 'ai' | 'grid';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'file', label: 'Từ tệp Excel / Word', hint: 'Không cần AI' },
  { id: 'paste', label: 'Dán văn bản', hint: 'Không cần AI' },
  { id: 'scan', label: 'Ảnh chụp / PDF', hint: 'Cần AI' },
  { id: 'ai', label: 'AI soạn câu hỏi', hint: 'Cần AI' },
  { id: 'grid', label: 'Gõ nhanh trắc nghiệm', hint: 'Không cần AI' },
];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Defaults { subject: SubjectId; grade: Grade }

/** "Thêm câu hỏi nhanh": 5 cách nhập, cùng đổ về một màn hình soát. */
export function QuickAddDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Partial<Defaults>; onSaved?: (n: number) => void }) {
  const [lib, setLib] = useState<ImportLib | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('paste');
  const focus = useFocusGrade().grade;
  const [def, setDef] = useState<Defaults>({ subject: initial?.subject ?? 'toan', grade: initial?.grade ?? focus });
  const [review, setReview] = useState<DraftItem[] | null>(null);
  const [notice, setNotice] = useState<string[]>([]);

  useEffect(() => {
    if (!open || lib) return;
    loadImportLib().then(setLib, setLoadErr);
  }, [open, lib]);
  useEffect(() => {
    if (open) setDef({ subject: initial?.subject ?? 'toan', grade: initial?.grade ?? focus });
    // chỉ đặt lại khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  const close = (): void => { setReview(null); setNotice([]); onClose(); };
  const toReview = (drafts: DraftItem[], notes: string[] = []): void => { setNotice(notes); setReview(drafts); };

  if (review && lib) return <ReviewScreen lib={lib} drafts={review} notes={notice} onBack={() => setReview(null)} onClose={close} onSaved={onSaved} />;

  return (
    <Dialog open onClose={close} title="Thêm câu hỏi nhanh" full>
      {!lib ? (loadErr ? <ErrorNote error={loadErr} onRetry={() => { setLoadErr(null); loadImportLib().then(setLib, setLoadErr); }} /> : <Loading />) : (
        <div className="tc-qb">
          <div className="tc-qb-defaults">
            <span className="tc-small"><strong>Câu hỏi thuộc</strong></span>
            <select className="tc-input tc-input--sm" aria-label="Môn mặc định" value={def.subject} onChange={(e) => setDef({ ...def, subject: e.target.value as SubjectId })}>
              <SubjectOptions grade={def.grade} present={[def.subject]} />
            </select>
            <Seg label="Lớp mặc định" value={def.grade} onChange={(g) => setDef({ ...def, grade: g, subject: fitSubjectToGrade(def.subject, g) })} options={[1, 2, 3, 4, 5].map((g) => ({ value: g as Grade, label: `Lớp ${g}` }))} />
            <span className="tc-muted tc-small">— dùng khi tệp / văn bản không ghi môn, lớp. Sửa từng câu được ở bước soát.</span>
          </div>
          <div className="tc-tabs tc-qb-tabs" role="tablist" aria-label="Cách thêm câu hỏi">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}<small className={cx('tc-qb-tabhint', t.hint === 'Cần AI' && 'is-ai')}>{t.hint}</small>
              </button>
            ))}
          </div>
          {notice.length ? <div className="tc-alert tc-alert--info">{notice.join(' ')}</div> : null}
          <div className="tc-qb-pane">
            {tab === 'file' ? <FilePane lib={lib} def={def} onDrafts={toReview} /> : null}
            {tab === 'paste' ? <PastePane lib={lib} def={def} onDrafts={toReview} /> : null}
            {tab === 'scan' ? <ScanPane lib={lib} def={def} onDrafts={toReview} goTab={setTab} /> : null}
            {tab === 'ai' ? <AiPane lib={lib} def={def} onDrafts={toReview} goTab={setTab} /> : null}
            {tab === 'grid' ? <GridPane lib={lib} def={def} onDrafts={toReview} /> : null}
          </div>
        </div>
      )}
    </Dialog>
  );
}

type PaneProps = { lib: ImportLib; def: Defaults; onDrafts: (d: DraftItem[], notes?: string[]) => void };

type Detected = ReturnType<ImportLib['parseQuestionText']>['detected'];
/** "Nhận ra từ đề: môn …, lớp …, kĩ năng …" — môn, lớp, kĩ năng đọc được ở đầu đề. */
function detectedText(d: Detected): string {
  if (!d) return '';
  const parts = [
    d.subject ? `môn ${SUBJECTS[d.subject]?.name ?? d.subject}` : '',
    d.grade ? `lớp ${d.grade}` : '',
    d.skills?.length ? `kĩ năng ${d.skills.map(skillShort).join(', ')}` : '',
  ].filter(Boolean);
  const unk = d.unknownSkills?.length ? ` Kĩ năng chưa có trong danh mục: ${d.unknownSkills.join(', ')}.` : '';
  return parts.length ? `Nhận ra từ đề: ${parts.join(', ')} — áp cho các câu không ghi riêng.${unk}` : unk.trim();
}

/* ---------------- A1 + A2: tệp Excel / Word ---------------- */
function FilePane({ lib, def, onDrafts }: PaneProps) {
  const bank = useItems();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  const handle = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const name = f.name.toLowerCase();
      const bytes = await readFileBytes(f);
      if (name.endsWith('.xlsx') || f.type === XLSX_MIME) {
        const r = lib.importXlsx(bytes, def, bank.data ?? []);
        if (!r.drafts.length) throw new Error('Tệp Excel không có dòng câu hỏi nào. Thầy/cô kiểm tra lại trang "Câu hỏi" nhé.');
        onDrafts(r.drafts, [`Đọc ${r.drafts.length} dòng từ "${f.name}".`, ...r.warnings]);
      } else if (name.endsWith('.docx')) {
        const t = lib.docxToText(bytes);
        const r = lib.parseQuestionText(t.text, def, 'docx');
        if (!r.drafts.length) throw new Error('Không thấy câu hỏi nào trong tệp Word này. Thầy/cô thử chép chữ rồi dán vào ô "Dán văn bản" nhé.');
        const notes = [`Đọc ${r.drafts.length} câu từ "${f.name}".`];
        if (r.detected) notes.push(detectedText(r.detected));
        if (t.marked) notes.push(`${t.marked} lựa chọn tô đậm / gạch chân / tô màu được hiểu là đáp án đúng.`);
        if (t.autoNumbered) notes.push('Tệp dùng đánh số tự động của Word — số câu hoặc chữ A, B, C có thể không đọc được; thầy/cô soát kĩ nhé.');
        if (t.hasImages) notes.push('Hình ảnh trong tệp không được nhập.');
        onDrafts(r.drafts, notes);
      } else if (name.endsWith('.xls') || name.endsWith('.doc')) {
        throw new Error(`Tệp ${name.endsWith('.xls') ? '.xls' : '.doc'} là định dạng cũ. Thầy/cô mở tệp rồi chọn "Lưu thành" ${name.endsWith('.xls') ? '.xlsx' : '.docx'} nhé.`);
      } else if (name.endsWith('.pdf') || f.type.startsWith('image/')) {
        throw new Error('Ảnh và PDF dùng thẻ "Ảnh chụp / PDF". Nếu PDF chọn được chữ, chép chữ rồi dán vào "Dán văn bản" là nhanh nhất.');
      } else throw new Error('Chỉ nhận tệp Excel (.xlsx) hoặc Word (.docx).');
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="tc-qb-cols">
      <div className="tc-stack">
        <label
          className="tc-qb-drop"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); void handle(e.dataTransfer.files[0]); }}
        >
          <strong>{busy ? 'Đang đọc tệp…' : 'Chọn hoặc kéo thả tệp vào đây'}</strong>
          <span className="tc-muted tc-small">Excel .xlsx (theo mẫu) hoặc Word .docx (đề kiểm tra dạng chữ, hoặc theo mẫu Word đủ các dạng)</span>
          <input ref={input} type="file" accept=".xlsx,.docx,.xls,.doc" data-testid="qb-file" onChange={(e) => void handle(e.target.files?.[0])} disabled={busy} />
        </label>
        <ErrorNote error={err} />
      </div>
      <div className="tc-stack tc-qb-help">
        <h3>Mẫu Excel</h3>
        <p className="tc-small">Mỗi dòng một câu: <b>Loại</b>, <b>Câu hỏi</b>, <b>A–F</b>, <b>Đáp án đúng</b>, Gợi ý, Giải thích, Mức độ, Môn, Lớp, <b>Mã kĩ năng</b>. Mẫu có sẵn 6 dòng ví dụ, trang "Hướng dẫn" và trang <b>"Danh mục kĩ năng"</b> (đủ mã kĩ năng các môn, lớp 1–5 — chép mã sang cột Mã kĩ năng, hoặc ghi đúng tên kĩ năng).</p>
        <div className="tc-row tc-wrap">
          <Btn icon="upload" onClick={() => downloadBytes(lib.buildTemplateXlsx(), 'mau-ngan-hang-cau-hoi.xlsx', XLSX_MIME)} data-testid="qb-template">Tải mẫu Excel</Btn>
          <Btn kind="ghost" icon="upload" onClick={() => downloadBytes(lib.buildSkillsXlsx({ withHidden: false }), 'danh-muc-ki-nang.xlsx', XLSX_MIME)} data-testid="qb-skills-xlsx">Tải danh mục kĩ năng</Btn>
        </div>
        <h3>Tệp Word</h3>
        <p className="tc-small">Đề viết "Câu 1:", lựa chọn "A.", "B."… Đáp án ghi "Đáp án: B", bảng đáp án cuối đề, hoặc <b>tô đậm / gạch chân</b> lựa chọn đúng.</p>
        <p className="tc-small">Thêm dòng <b>"Dạng: …"</b> dưới mỗi câu để soạn <b>đủ 16 dạng</b>: nối cặp, sắp xếp, kéo thả, phân loại, điền vào đoạn văn, chọn trong câu, nghe và chọn, que tính, đồng hồ, ghi âm đọc to, vẽ và tô, thăm dò… Mẫu có ví dụ từng dạng.</p>
        <Btn icon="upload" onClick={() => downloadBytes(lib.buildWordTemplateDocx(), 'mau-cau-hoi-word.docx', lib.DOCX_MIME)} data-testid="qb-template-word">Tải mẫu Word (đủ các dạng)</Btn>
      </div>
    </div>
  );
}

/* ---------------- A3: dán văn bản ---------------- */
const SAMPLE = `Câu 1: Số liền sau của 99 là:
A. 98     B. 100     C. 101     D. 109
Câu 2: 3/4 của 12 là bao nhiêu?
A. 9
B. 8
C. 6
Câu 3: Một hình vuông có cạnh 6 cm. Chu vi hình vuông là:
Đáp số: 24 cm

Đáp án: 1.B 2.A`;

function PastePane({ lib, def, onDrafts }: PaneProps) {
  const [text, setText] = useState('');
  const [withPassage, setWithPassage] = useState(true);
  const res = text.trim() ? lib.parseQuestionText(text, def) : null;
  const go = (): void => {
    if (!res) return;
    let drafts = res.drafts;
    if (res.preamble && withPassage) {
      drafts = drafts.map((d) => ({ ...d, item: { ...d.item, prompt: { ...d.item.prompt, text: `${res.preamble}\n\n${d.item.prompt.text}` } } as DraftItem['item'] }));
    }
    onDrafts(drafts, [
      ...(res.detected ? [detectedText(res.detected)] : []),
      ...(res.answerTableCount ? [`Lấy ${res.answerTableCount} đáp án từ bảng đáp án cuối đề.`] : []),
    ]);
  };
  return (
    <div className="tc-qb-cols">
      <div className="tc-stack">
        <Field label="Dán đề vào đây" help="Chép từ Word, PDF (loại chọn được chữ), Zalo, trang web… Không cần sửa trước.">
          <textarea className="tc-input tc-qb-paste" rows={16} value={text} placeholder={SAMPLE} onChange={(e) => setText(e.target.value)} data-testid="qb-paste" />
        </Field>
        <div className="tc-row tc-wrap">
          <Btn kind="primary" onClick={go} disabled={!res?.drafts.length} data-testid="qb-parse">{res?.drafts.length ? `Đọc được ${res.drafts.length} câu — soát và lưu` : 'Đọc câu hỏi'}</Btn>
          {!text.trim() ? <Btn size="sm" kind="ghost" onClick={() => setText(SAMPLE)}>Dùng đề mẫu</Btn> : null}
          {res?.preamble ? <label className="tc-switch tc-small"><input type="checkbox" checked={withPassage} onChange={(e) => setWithPassage(e.target.checked)} /> Thêm đoạn bài đọc phía trên vào đề từng câu</label> : null}
        </div>
        {res?.detected ? <p className="tc-small tc-qb-detected" role="status" data-testid="qb-detected">✓ {detectedText(res.detected)}</p> : null}
      </div>
      <div className="tc-stack tc-qb-help">
        <h3>Nhận ra được</h3>
        <ul className="tc-small">
          <li>Đầu câu: <code>Câu 1:</code> <code>Câu 1.</code> <code>Bài 1</code> <code>1)</code> <code>1.</code></li>
          <li>Lựa chọn: <code>A.</code> <code>A)</code> <code>a/</code>, mỗi dòng một ý hoặc nhiều ý trên một dòng</li>
          <li>Đáp án: <code>Đáp án: B</code> <code>ĐA: B</code> <code>Chọn B</code>, dấu <code>*</code> hoặc <code>(đúng)</code>, bảng <code>1.B 2.C 3.A</code></li>
          <li>Câu không có lựa chọn → Điền đáp án (<code>Đáp số: 24 cm</code>)</li>
          <li>"Đúng ghi Đ, sai ghi S" → mỗi ý một câu Đúng – Sai</li>
          <li><code>Gợi ý:</code> và <code>Giải thích:</code></li>
          <li>Môn, lớp ở đầu đề: tiêu đề <code>ĐỀ … MÔN TOÁN – LỚP 3</code>, <code>Toán 3</code> hoặc dòng <code>Môn: …</code> <code>Lớp: 5</code></li>
          <li>Kĩ năng: dòng <code>Mã kĩ năng: …</code> ở đầu đề (cả đề) hoặc dưới từng câu — ghi mã hoặc đúng tên kĩ năng (<a href="/ki-nang" target="_blank" rel="noreferrer">xem danh mục</a>)</li>
          <li>Dòng <code>Môn:</code> <code>Lớp:</code> <code>Mức độ:</code> dưới một câu → riêng câu đó</li>
        </ul>
        <p className="tc-small tc-muted">Đoạn không hiểu được vẫn giữ lại, đánh dấu "Cần xem lại".</p>
        {res ? (
          <p className="tc-small" role="status" data-testid="qb-parse-count">
            Xem nhanh: {res.drafts.length} câu · {res.drafts.filter((d) => lib.draftStatus(d) === 'ready').length} sẵn sàng · {res.drafts.filter((d) => lib.draftStatus(d) === 'missing-answer').length} thiếu đáp án · {res.drafts.filter((d) => lib.draftStatus(d) === 'review').length} cần xem lại
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- A4: ảnh / PDF → AI ---------------- */
function NeedsKey({ goTab }: { goTab: (t: Tab) => void }) {
  return (
    <div className="tc-alert tc-alert--info tc-qb-needkey" role="alert">
      <span>
        <strong>Cách này cần khóa AI.</strong> Máy chủ của trường chưa được cài khóa AI (quản trị viên đặt <code>OPENROUTER_API_KEY</code> hoặc <code>GEMINI_API_KEY</code> cho Edge Function <code>ai-gateway</code>).
        Trong lúc chờ, thầy/cô dùng cách không cần AI:
      </span>
      <span className="tc-row tc-wrap">
        <Btn size="sm" onClick={() => goTab('paste')}>Dán văn bản</Btn>
        <Btn size="sm" onClick={() => goTab('file')}>Tệp Excel / Word</Btn>
        <Btn size="sm" onClick={() => goTab('grid')}>Gõ nhanh</Btn>
      </span>
    </div>
  );
}

function aiNote(e: unknown): { needsKey: boolean; error: unknown } {
  const needsKey = !!e && typeof e === 'object' && (e as { needsKey?: boolean }).needsKey === true;
  return { needsKey, error: needsKey ? null : e };
}

function ScanPane({ lib, def, onDrafts, goTab }: PaneProps & { goTab: (t: Tab) => void }) {
  const ds = useDataSource();
  const [file, setFile] = useState<{ name: string; prep: Awaited<ReturnType<ImportLib['prepareAiFile']>>; preview?: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'prep' | 'ai'>('');
  const [err, setErr] = useState<{ needsKey: boolean; error: unknown }>({ needsKey: false, error: null });
  const pick = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setErr({ needsKey: false, error: null });
    setFile(null);
    setBusy('prep');
    try {
      const prep = await lib.prepareAiFile(f);
      setFile({ name: f.name, prep, ...(prep.mimeType.startsWith('image/') ? { preview: `data:${prep.mimeType};base64,${prep.fileBase64}` } : {}) });
    } catch (e) {
      setErr(aiNote(e));
    } finally {
      setBusy('');
    }
  };
  const run = async (): Promise<void> => {
    if (!file) return;
    setBusy('ai');
    setErr({ needsKey: false, error: null });
    try {
      const r = await lib.aiExtractItems(ds, { fileBase64: file.prep.fileBase64, mimeType: file.prep.mimeType, grade: def.grade, subject: def.subject });
      onDrafts(r.drafts, r.demo ? ['Chế độ demo: đây là BẢN MẪU cố định, không phải AI đọc tệp của thầy/cô. Kết nối máy chủ có khóa AI để đọc tệp thật.'] : [`AI đọc được ${r.drafts.length} câu từ "${file.name}". Thầy/cô đối chiếu với đề gốc trước khi lưu nhé.`]);
    } catch (e) {
      setErr(aiNote(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="tc-qb-cols">
      <div className="tc-stack">
        {ds.mode === 'demo' ? <div className="tc-alert tc-alert--info"><span><span className="tc-chip tc-qb-demo">bản mẫu (demo)</span> Chế độ demo không gửi tệp đi đâu: bấm "AI đọc đề" sẽ nhận 3 câu mẫu để thử bước soát.</span></div> : null}
        <label className="tc-qb-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}>
          <strong>{busy === 'prep' ? 'Đang thu nhỏ ảnh…' : 'Chọn ảnh chụp đề hoặc tệp PDF'}</strong>
          <span className="tc-muted tc-small">JPG, PNG, WEBP (tự thu nhỏ trước khi gửi) hoặc PDF ≤ 4 MB · mỗi lần một ảnh / một tệp</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={(e) => void pick(e.target.files?.[0])} disabled={!!busy} data-testid="qb-scan-file" />
        </label>
        {file ? (
          <div className="tc-qb-scanfile">
            {file.preview ? <img src={file.preview} alt="Ảnh đề đã chọn" /> : <span className="tc-chip">PDF</span>}
            <span className="tc-small">{file.name} · {(file.prep.bytes / 1024).toFixed(0)} KB</span>
          </div>
        ) : null}
        {file?.prep.pdfHasText ? (
          <div className="tc-alert tc-alert--info"><span><strong>PDF này chọn được chữ.</strong> Thầy/cô mở PDF, chọn tất cả (Ctrl+A), chép (Ctrl+C) rồi dán vào "Dán văn bản" — nhanh hơn, không tốn lượt AI và chép đúng từng chữ.</span><Btn size="sm" onClick={() => goTab('paste')}>Dán văn bản</Btn></div>
        ) : null}
        <div className="tc-row">
          <Btn kind="primary" onClick={() => void run()} disabled={!file || !!busy}>{busy === 'ai' ? 'AI đang đọc đề… (có thể mất 30 giây)' : 'AI đọc đề'}</Btn>
        </div>
        {err.needsKey ? <NeedsKey goTab={goTab} /> : <ErrorNote error={err.error} />}
      </div>
      <div className="tc-stack tc-qb-help">
        <h3>Mẹo chụp ảnh</h3>
        <ul className="tc-small">
          <li>Chụp thẳng, đủ sáng, mỗi ảnh một trang.</li>
          <li>Câu có hình vẽ (đếm hình, xem đồng hồ…) AI sẽ bỏ qua — thầy/cô thêm bằng tay.</li>
          <li>AI chép lại đề; đề không ghi đáp án thì AI tự giải và nhắc thầy/cô kiểm tra.</li>
          <li>Mỗi lần đọc tốn 1 lượt AI trong ngày.</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------------- B: AI soạn câu hỏi ---------------- */
type MixPreset = 'even' | 'easy' | 'hard' | NonNullable<ItemBase['difficulty']>;
const MIXES: { value: MixPreset; label: string }[] = [
  { value: 'even', label: 'Đều 3 mức' },
  { value: 'easy', label: 'Nhiều câu dễ' },
  { value: 'hard', label: 'Nhiều câu khó' },
  { value: 'nhan-biet', label: 'Chỉ Nhận biết' },
  { value: 'ket-noi', label: 'Chỉ Kết nối' },
  { value: 'van-dung', label: 'Chỉ Vận dụng' },
];

function AiPane({ lib, def, onDrafts, goTab }: PaneProps & { goTab: (t: Tab) => void }) {
  const ds = useDataSource();
  const [from, setFrom] = useState<'topic' | 'text'>('topic');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<ItemType[]>(['MCQ', 'SHORT_ANSWER']);
  const [mix, setMix] = useState<MixPreset>('even');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ needsKey: boolean; error: unknown }>({ needsKey: false, error: null });
  useEffect(() => setSkills([]), [def.subject, def.grade]);
  const ok = from === 'text' ? text.trim().length >= 20 : !!topic.trim() || skills.length > 0;
  const run = async (): Promise<void> => {
    setBusy(true);
    setErr({ needsKey: false, error: null });
    try {
      const r = await lib.aiGenerateItems(ds, {
        grade: def.grade, subject: def.subject, count, types,
        difficultyMix: lib.difficultyMix(count, mix),
        ...(from === 'text' ? { text } : { topic, skillCodes: skills }),
      });
      onDrafts(r.drafts, r.demo ? ['Chế độ demo: câu hỏi do máy soạn theo quy tắc đơn giản (bản mẫu), không phải AI thật.'] : [`AI soạn được ${r.drafts.length} câu. Thầy/cô đọc kĩ từng câu và đáp án trước khi lưu nhé.`]);
    } catch (e) {
      setErr(aiNote(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tc-qb-cols">
      <div className="tc-stack">
        {ds.mode === 'demo' ? <div className="tc-alert tc-alert--info"><span><span className="tc-chip tc-qb-demo">bản mẫu (demo)</span> Chế độ demo soạn ngay trên máy: môn Toán ra phép tính có đáp án đúng; môn khác ra câu giữ chỗ để thầy/cô sửa.</span></div> : null}
        <Seg label="Soạn từ" value={from} onChange={setFrom} options={[{ value: 'topic', label: 'Chủ đề / kĩ năng' }, { value: 'text', label: 'Nội dung SGK dán vào' }]} />
        {from === 'text' ? (
          <Field label="Nội dung SGK" help="Dán đoạn bài học; AI chỉ hỏi trong phạm vi nội dung này.">
            <textarea className="tc-input" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ví dụ: Phân số 3/4 đọc là ba phần tư. Tử số là 3, mẫu số là 4…" />
          </Field>
        ) : (
          <>
            <Field label="Chủ đề"><input className="tc-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Rút gọn phân số; Từ chỉ sự vật; Các mùa trong năm" /></Field>
            <div className="tc-field"><span className="tc-field__label">Kĩ năng (yêu cầu cần đạt)</span><SkillPicker subject={def.subject} grade={def.grade} value={skills} onChange={setSkills} /></div>
          </>
        )}
        <div className="tc-row tc-wrap">
          <Field label="Số câu"><input type="number" className="tc-input tc-input--num" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></Field>
          <Field label="Mức độ"><select className="tc-input" value={mix} onChange={(e) => setMix(e.target.value as MixPreset)}>{MIXES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        </div>
        <div className="tc-field">
          <span className="tc-field__label">Dạng câu hỏi</span>
          <span className="tc-row tc-wrap">
            {lib.AI_ITEM_TYPES.map((t) => (
              <label key={t} className="tc-switch tc-small"><input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} /> {typeLabel(t)}</label>
            ))}
          </span>
        </div>
        <div className="tc-row"><Btn kind="primary" onClick={() => void run()} disabled={!ok || busy || !types.length}>{busy ? 'AI đang soạn…' : `Soạn ${count} câu`}</Btn></div>
        {err.needsKey ? <NeedsKey goTab={goTab} /> : <ErrorNote error={err.error} />}
      </div>
      <div className="tc-stack tc-qb-help">
        <h3>Lưu ý</h3>
        <ul className="tc-small">
          <li>AI có thể sai — câu nào cũng phải qua bước soát.</li>
          <li>Chọn kĩ năng thì câu hỏi được gắn sẵn mã kĩ năng đó (để tính mức thành thạo).</li>
          <li>Mỗi lần soạn tốn 1 lượt AI trong ngày (mặc định 60 lượt / thầy/cô).</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------------- C: lưới gõ nhanh trắc nghiệm ---------------- */
interface GridRow { key: number; q: string; o: string[]; c: number }
const blankRow = (key: number): GridRow => ({ key, q: '', o: ['', '', '', ''], c: -1 });

function GridPane({ lib, def, onDrafts }: PaneProps) {
  const [rows, setRows] = useState<GridRow[]>(() => [blankRow(1), blankRow(2), blankRow(3)]);
  const seq = useRef(4);
  const table = useRef<HTMLTableElement>(null);
  const filled = rows.filter((r) => r.q.trim() || r.o.some((x) => x.trim()));
  const set = (key: number, p: Partial<GridRow>): void => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const onKey = (e: KeyboardEvent<HTMLInputElement>, rowIdx: number): void => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const focusRow = (i: number): void => { requestAnimationFrame(() => table.current?.querySelectorAll<HTMLInputElement>('tbody tr')[i]?.querySelector<HTMLInputElement>('input')?.focus()); };
    if (rowIdx === rows.length - 1) {
      setRows((rs) => [...rs, blankRow(seq.current++)]);
    }
    focusRow(rowIdx + 1);
  };
  const go = (): void => {
    const drafts: DraftItem[] = filled.map((r) => {
      const opts = r.o.map((x) => x.trim());
      while (opts.length > 2 && !opts[opts.length - 1]) opts.pop();
      return { rowId: lib.newRowId(), item: lib.makeMcq(r.q.trim(), opts, r.c >= 0 && r.c < opts.length ? [r.c] : [], def), source: 'manual', notes: [] };
    });
    onDrafts(drafts);
  };
  return (
    <div className="tc-stack">
      <p className="tc-small tc-muted">Mỗi dòng một câu trắc nghiệm: gõ câu hỏi, 4 lựa chọn, bấm chọn đáp án đúng. Nhấn <kbd>Enter</kbd> để sang dòng mới. Bỏ trống C, D nếu chỉ có 2 lựa chọn.</p>
      <div className="tc-tablewrap">
        <table className="tc-table tc-qb-grid" ref={table}>
          <thead><tr><th>#</th><th>Câu hỏi</th>{['A', 'B', 'C', 'D'].map((l) => <th key={l}>{l} <small className="tc-muted">(chọn = đúng)</small></th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td><input className="tc-input tc-input--sm" value={r.q} aria-label={`Câu hỏi dòng ${i + 1}`} onChange={(e) => set(r.key, { q: e.target.value })} onKeyDown={(e) => onKey(e, i)} /></td>
                {r.o.map((o, j) => (
                  <td key={j}>
                    <span className={cx('tc-qb-gridopt', r.c === j && 'is-correct')}>
                      <input type="radio" name={`qbg-${r.key}`} checked={r.c === j} aria-label={`Dòng ${i + 1}: đáp án đúng là ${'ABCD'[j]}`} onChange={() => set(r.key, { c: j })} />
                      <input className="tc-input tc-input--sm" value={o} aria-label={`Dòng ${i + 1} lựa chọn ${'ABCD'[j]}`} onChange={(e) => set(r.key, { o: r.o.map((x, k) => (k === j ? e.target.value : x)) })} onKeyDown={(e) => onKey(e, i)} />
                    </span>
                  </td>
                ))}
                <td><Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow(seq.current++)]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tc-row">
        <Btn icon="plus" onClick={() => setRows((rs) => [...rs, blankRow(seq.current++)])}>Thêm dòng</Btn>
        <Btn kind="primary" onClick={go} disabled={!filled.length}>Soát {filled.length} câu</Btn>
      </div>
    </div>
  );
}

/** Xuất các câu đang lọc ra Excel (cùng mẫu với nhập). */
export async function exportBankXlsx(items: Parameters<ImportLib['exportItemsXlsx']>[0]): Promise<{ exported: number; skipped: number }> {
  const lib = await loadImportLib();
  const r = lib.exportItemsXlsx(items);
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  downloadBytes(r.bytes, `ngan-hang-cau-hoi-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`, XLSX_MIME);
  return { exported: r.exported, skipped: r.skipped };
}

