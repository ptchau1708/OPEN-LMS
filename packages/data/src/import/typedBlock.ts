/**
 * Câu hỏi có dòng "Dạng: …" (mẫu Word / dán văn bản) → câu nháp đủ 16 dạng. THUẦN, không ném lỗi.
 *
 * Mỗi câu: "Câu 1: <đề>" rồi "Dạng: <tên dạng>", sau đó các dòng theo dạng (xem buildWordTemplateDocx / docs):
 *   Chọn 1 đáp án, Chọn nhiều đáp án, Thăm dò ý kiến, Nghe và chọn : A. … B. … + "Đáp án: B" (nhiều: "A, C")
 *   Đúng – Sai                     : "Đáp án: Đúng" | "Sai"
 *   Điền ngắn                      : "Đáp án: 24; hai mươi tư" + "Đơn vị: cm"
 *   Sắp xếp thứ tự                 : A. B. C. ghi ĐÚNG thứ tự (hoặc thêm "Đáp án: B, A, C")
 *   Nối cặp                        : A. vế trái = vế phải (dấu = hoặc → hoặc |)
 *   Sắp xếp câu                    : "Câu đúng: Em / đi học / đúng giờ / ."
 *   Phân loại từ / Kéo thả vào ô   : "Nhóm Vần ang: cây bàng, cá vàng" / "Ô Dưới nước: con cá, con tôm"
 *   Điền vào đoạn văn              : "Đoạn văn: Cây cối [đâm] chồi …" (nhiều cách đúng: [đâm|nảy]) + "Kho từ: …" (tuỳ chọn)
 *   Chọn trong câu                 : "Đoạn văn: My name [am|*is|are] Mai." (dấu * trước lựa chọn đúng)
 *   Nghe và chọn                   : + "Đọc cho HS nghe: con mèo", "Giọng: Tiếng Anh" (tuỳ chọn)
 *   Ghi âm đọc to                  : "Đoạn đọc: …" (nhiều dòng) + "Thời gian: 30" (giây)
 *   Vẽ và tô                       : chỉ cần đề
 *   Đồ dùng toán                   : "Que tính: 26 + 7" (+ "Lựa chọn: 31, 33, 23") hoặc "Đồng hồ: 3 giờ 30 phút"
 *   Chạm vào hình                  : đề + "Vùng đúng: …" (ghi chú); ảnh và vùng chạm thêm ở bước soát (Sửa chi tiết)
 * Dòng chung (mọi dạng): Gợi ý:, Giải thích:, Mức độ:, Môn:, Lớp:, Mã kĩ năng:
 */
import { ACTIVITY_TYPES, uid, type Choice, type Item, type ItemType } from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { parseDifficulty, parseGrade, parseSkills, parseSubject } from './template';
import { resolveChoiceAnswer } from './textParser';
import { letterId, makeMcq, makeShort, makeTrueFalse, newRowId, type DraftItem, type DraftSource, type ImportDefaults } from './types';

export type TypedKind = ItemType | 'TRUE_FALSE';

const fold = (s: string): string => foldVietnamese(String(s ?? '')).replace(/[–—-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Tên dạng (đã bỏ dấu) → dạng. Gồm tên trên giao diện (ACTIVITY_TYPES) và cách gọi quen thuộc. */
const KIND_NAMES: [TypedKind, string[]][] = [
  ['MCQ', ['trac nghiem', 'trac nghiem 1 dap an', 'chon mot dap an', 'mot dap an', 'mcq']],
  ['MCQ_MULTIPLE', ['nhieu dap an', 'chon nhieu', 'trac nghiem nhieu dap an']],
  ['TRUE_FALSE', ['dung sai', 'dung hay sai', 'dung hoac sai', 'd s', 'true false']],
  ['SHORT_ANSWER', ['dien dap an', 'dien so', 'tra loi ngan', 'dien']],
  ['ORDERING', ['sap xep', 'xep thu tu']],
  ['MATCHING', ['noi', 'noi cot', 'ghep cap', 'ghep doi']],
  ['DRAG_DROP', ['keo tha', 'keo vao o', 'keo tha vao o']],
  ['SENTENCE_SCRAMBLE', ['xep cau', 'sap xep tu thanh cau', 'xep tu thanh cau']],
  ['WORD_CLASSIFY', ['phan loai', 'xep nhom', 'phan nhom']],
  ['FILL_IN_PASSAGE', ['dien vao cho trong', 'dien khuyet', 'dien tu vao doan van']],
  ['INLINE_DROPDOWN', ['chon tu trong cau', 'chon trong doan', 'danh sach chon']],
  ['LISTEN_CHOOSE', ['nghe chon', 'nghe roi chon']],
  ['HOTSPOT', ['cham hinh', 'chon vung tren hinh']],
  ['DRAW', ['ve', 'to mau', 've hinh']],
  ['RECORD_READ', ['doc to', 'ghi am', 'luyen doc']],
  ['MATH_MANIPULATIVE', ['que tinh', 'dong ho', 'do dung hoc toan']],
  ['POLL', ['tham do', 'binh chon', 'khao sat']],
];
const KIND_INDEX = new Map<string, TypedKind>();
for (const a of ACTIVITY_TYPES) KIND_INDEX.set(fold(a.label.replace(/\(mới\)/, '')), a.type);
for (const [k, list] of KIND_NAMES) for (const n of list) KIND_INDEX.set(n, k);
KIND_INDEX.set(fold('Đúng – Sai'), 'TRUE_FALSE');

export function parseTypedKind(v: string): TypedKind | null {
  const f = fold(v);
  return KIND_INDEX.get(f) ?? null;
}

/** Tên chuẩn (để ghi lên mẫu). */
export const TYPED_KIND_LABEL: Record<TypedKind, string> = {
  ...(Object.fromEntries(ACTIVITY_TYPES.map((a) => [a.type, a.label])) as Record<ItemType, string>),
  TRUE_FALSE: 'Đúng – Sai',
};

export const TYPE_LINE = /^(?:dạng|loại)(?:\s+câu(?:\s+hỏi)?)?\s*[:：]\s*(\S.*)$/i;
export const isTypedBlock = (lines: string[]): boolean => lines.some((l) => TYPE_LINE.test(l.trim()));

type Field =
  | 'answer' | 'hint' | 'expl' | 'difficulty' | 'subject' | 'grade' | 'skills' | 'unit' | 'passage' | 'bank' | 'listen' | 'lang'
  | 'sentence' | 'seconds' | 'sticks' | 'clock' | 'choices' | 'regions' | 'colors' | 'note';
const FIELDS: [Field, string[]][] = [
  ['answer', ['dap an', 'dap an dung', 'd a', 'da', 'ket qua', 'dap so', 'thu tu dung']],
  ['hint', ['goi y', 'huong dan']],
  ['expl', ['giai thich', 'loi giai', 'bai giai']],
  ['difficulty', ['muc do', 'muc']],
  ['subject', ['mon', 'mon hoc']],
  ['grade', ['lop', 'khoi']],
  ['skills', ['ma ki nang', 'ma ky nang', 'ki nang', 'ky nang', 'yccd', 'ma yccd']],
  ['unit', ['don vi']],
  ['passage', ['doan van', 'doan doc', 'bai doc', 'van ban', 'noi dung doc']],
  ['bank', ['kho tu', 'tu cho san', 'cac tu']],
  ['listen', ['doc cho hs nghe', 'doc cho hoc sinh nghe', 'noi dung nghe', 'may doc', 'nghe']],
  ['lang', ['giong', 'giong doc', 'ngon ngu']],
  ['sentence', ['cau dung', 'cau hoan chinh', 'thu tu tu']],
  ['seconds', ['thoi gian', 'thoi gian ghi am', 'so giay']],
  ['sticks', ['que tinh', 'phep tinh']],
  ['clock', ['dong ho', 'gio']],
  ['choices', ['lua chon', 'cac lua chon']],
  ['regions', ['vung dung', 'vung cham']],
  ['colors', ['mau', 'mau to']],
  ['note', ['ghi chu', 'luu y', 'chu y']],
];
const FIELD_INDEX = new Map<string, Field>();
for (const [k, list] of FIELDS) for (const n of list) FIELD_INDEX.set(n, k);

const OPTION = /^[*✓✔☑]?\s*\(?([A-Ha-h])\s*[.)]\s*(.*)$/;
const GROUP = /^(?:nhóm|ô|cột|hộp)\s+(.+?)\s*[:：]\s*(.*)$/i;
const MARKS = /[✓✔☑]/g;

interface Parsed {
  num: number | null;
  prompt: string[];
  kind: TypedKind | null;
  kindRaw: string;
  fields: Partial<Record<Field, string>>;
  options: { text: string; marked: boolean }[];
  groups: { label: string; items: string[] }[];
  bullets: string[];
}

function scan(lines: string[]): Parsed {
  const p: Parsed = { num: null, prompt: [], kind: null, kindRaw: '', fields: {}, options: [], groups: [], bullets: [] };
  let last: Field | 'prompt' | 'option' | null = 'prompt';
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) {
      if (last === 'prompt' && p.prompt.length) last = null;
      continue;
    }
    const t = l.match(TYPE_LINE);
    if (t) {
      p.kindRaw = t[1].trim();
      p.kind = parseTypedKind(p.kindRaw);
      last = null;
      continue;
    }
    const g = l.match(GROUP);
    if (g) {
      p.groups.push({ label: g[1].trim(), items: g[2].split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean) });
      last = null;
      continue;
    }
    const f = l.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    const field = f ? FIELD_INDEX.get(fold(f[1])) : undefined;
    if (f && field) {
      p.fields[field] = f[2].trim();
      last = field;
      continue;
    }
    const o = l.match(OPTION);
    if (o && (p.kind || p.prompt.length)) {
      const marked = /^[*✓✔☑]/.test(l) || MARKS.test(o[2]) || /\s*\*\s*$/.test(o[2]);
      MARKS.lastIndex = 0;
      p.options.push({ text: o[2].replace(MARKS, '').replace(/\s*\*\s*$/, '').trim(), marked });
      last = 'option';
      continue;
    }
    if (/^[-•+]\s+/.test(l) && p.kind) {
      p.bullets.push(l.replace(/^[-•+]\s+/, '').trim());
      last = null;
      continue;
    }
    // dòng nối tiếp
    if (last === 'prompt' || (last === null && !p.kind && !p.options.length)) p.prompt.push(l.replace(MARKS, ''));
    else if (last === 'passage' || last === 'expl' || last === 'hint') p.fields[last] = `${p.fields[last] ?? ''}\n${l}`.trim();
    else if (last === 'option' && p.options.length) p.options[p.options.length - 1].text += ` ${l}`;
    else p.prompt.push(l.replace(MARKS, ''));
  }
  return p;
}

const PAIR_SEP = /\s*(?:→|->|=>|\||=)\s*/;
function splitPair(cell: string): [string, string] | null {
  const m = cell.match(PAIR_SEP);
  if (!m || m.index === undefined) return null;
  const left = cell.slice(0, m.index).trim();
  const right = cell.slice(m.index + m[0].length).trim();
  return left && right ? [left, right] : null;
}

function truth(v: string): boolean | null {
  const f = fold(v);
  if (['dung', 'd', 'true', 'a', '1', 'co'].includes(f)) return true;
  if (['sai', 's', 'false', 'b', '0', 'khong'].includes(f)) return false;
  return null;
}

/** "B, A, C" / "2,1,3" / "BAC" → hoán vị chỉ số. */
function orderIdx(answer: string, n: number): number[] | null {
  const tokens = answer.match(/[A-Ha-h](?![a-zà-ỹ])|\d+/g) ?? [];
  const idx = tokens.map((t) => (/\d/.test(t) ? Number(t) - 1 : t.toLowerCase().charCodeAt(0) - 97));
  return idx.length === n && new Set(idx).size === n && idx.every((i) => i >= 0 && i < n) ? idx : null;
}

/** [a|b] → {{b1}}; trả về đoạn đã thay + nội dung từng chỗ trống. */
function blanks(passage: string, prefix: 'b' | 'd'): { text: string; parts: string[][] } {
  const parts: string[][] = [];
  const text = passage.replace(/\[([^\]\n]+)\]/g, (_m, inner: string) => {
    parts.push(inner.split('|').map((x) => x.trim()).filter(Boolean));
    return `{{${prefix}${parts.length}}}`;
  });
  return { text, parts };
}

const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#eef2f7"/><text x="160" y="105" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#64748b">Thêm ảnh ở bước soát</text></svg>')}`;

const num = (s: string): number | null => {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Một khối câu có "Dạng:" → câu nháp. `fallbackAnswer`: đáp án lấy từ bảng đáp án cuối đề (nếu có). */
export function parseTypedBlock(lines: string[], d0: ImportDefaults, source: DraftSource, fallbackAnswer?: string): DraftItem {
  const raw = lines.join('\n').trim();
  const p = scan(lines);
  const notes: string[] = [];
  let review: string | undefined;
  const F = p.fields;
  const subject = F.subject ? parseSubject(F.subject) : undefined;
  const grade = F.grade ? parseGrade(F.grade) : undefined;
  const difficulty = F.difficulty ? parseDifficulty(F.difficulty) : undefined;
  if (F.subject && !subject) notes.push(`Không hiểu môn «${F.subject}»`);
  if (F.grade && !grade) notes.push(`Không hiểu lớp «${F.grade}»`);
  if (F.difficulty && !difficulty) notes.push(`Không hiểu mức độ «${F.difficulty}»`);
  const d: ImportDefaults = { ...d0, subject: subject ?? d0.subject, grade: grade ?? d0.grade };
  const prompt = p.prompt.join('\n').trim();
  const answer = (F.answer ?? fallbackAnswer ?? '').trim();
  const opts = p.options.map((o) => o.text);
  const base = { id: uid('it'), grade: d.grade, subject: d.subject, prompt: { text: prompt }, stars: 1 };
  let kind = p.kind;
  if (!kind) {
    notes.push(`Không hiểu dạng «${p.kindRaw}» — đã đoán theo nội dung`);
    kind = opts.length >= 2 ? 'MCQ' : 'SHORT_ANSWER';
  }

  let item: Item;
  const markedIdx = p.options.map((o, i) => (o.marked ? i : -1)).filter((i) => i >= 0);
  const choiceAnswer = (): number[] => {
    if (answer) {
      const r = resolveChoiceAnswer(answer, opts);
      if (r) return r;
      notes.push(`Không hiểu đáp án «${answer}»`);
    }
    return markedIdx;
  };
  switch (kind) {
    case 'MCQ':
    case 'MCQ_MULTIPLE': {
      const c = choiceAnswer();
      item = makeMcq(prompt, opts, c, d, kind === 'MCQ_MULTIPLE');
      if (kind === 'MCQ' && c.length > 1) notes.push('Có nhiều đáp án đúng nên chuyển thành "Chọn nhiều đáp án"');
      break;
    }
    case 'TRUE_FALSE': {
      const v = answer ? truth(answer) : null;
      if (answer && v === null) notes.push(`Không hiểu đáp án «${answer}» (ghi Đúng hoặc Sai)`);
      item = makeTrueFalse(prompt, v, d);
      break;
    }
    case 'SHORT_ANSWER':
      item = makeShort(prompt, answer.split(/\s*[;|]\s*|\s+hoặc\s+/i), d, F.unit);
      break;
    case 'POLL':
      item = { ...base, type: 'POLL', payload: { options: opts.map((text, i) => ({ id: letterId(i), text })) }, key: null };
      if (opts.length < 2) review = 'Thăm dò ý kiến cần ít nhất 2 lựa chọn (A., B., …)';
      break;
    case 'LISTEN_CHOOSE': {
      const c = choiceAnswer();
      const en = /anh|english|en/.test(fold(F.lang ?? ''));
      const listen = (F.listen ?? '').trim();
      item = {
        ...base, type: 'LISTEN_CHOOSE',
        prompt: { text: prompt || 'Em nghe rồi chọn đáp án đúng.', ...(listen ? { speak: listen } : {}), ...(en ? { lang: 'en-US' as const } : {}) },
        payload: { options: opts.map((text, i) => ({ id: letterId(i), text })), columns: 2 },
        key: { correct: c[0] !== undefined ? letterId(c[0]) : '' },
      };
      if (!listen) notes.push('Chưa có "Đọc cho HS nghe:" — máy sẽ đọc đề bài');
      break;
    }
    case 'ORDERING': {
      const cards = opts.length ? opts : p.bullets;
      const items: Choice[] = cards.map((text, i) => ({ id: `i${i + 1}`, text }));
      let order = items.map((c) => c.id);
      if (answer) {
        const idx = orderIdx(answer, cards.length);
        if (idx) order = idx.map((i) => items[i].id);
        else notes.push(`Không hiểu thứ tự «${answer}» — dùng thứ tự A, B, C… như đã ghi`);
      }
      item = { ...base, type: 'ORDERING', payload: { items }, key: { order } };
      break;
    }
    case 'MATCHING': {
      const cells = (opts.length ? opts : p.bullets).map(splitPair);
      const good = cells.filter((x): x is [string, string] => !!x);
      if (good.length !== cells.length) review = 'Mỗi cặp của câu Nối cặp cần ghi "vế trái = vế phải"';
      const left: Choice[] = good.map((x, i) => ({ id: `l${i + 1}`, text: x[0] }));
      const right: Choice[] = good.map((x, i) => ({ id: `r${i + 1}`, text: x[1] }));
      item = { ...base, type: 'MATCHING', payload: { left, right }, key: { pairs: Object.fromEntries(left.map((l, i) => [l.id, right[i].id])) } };
      break;
    }
    case 'SENTENCE_SCRAMBLE': {
      const s = (F.sentence ?? F.answer ?? '').trim();
      const parts = s.includes('/') ? s.split('/') : s.split(/\s+/);
      const words: Choice[] = parts.map((x) => x.trim()).filter(Boolean).map((text, i) => ({ id: `w${i + 1}`, text }));
      item = { ...base, type: 'SENTENCE_SCRAMBLE', payload: { words }, key: { order: words.map((w) => w.id) } };
      if (!words.length) review = 'Thiếu dòng "Câu đúng: Em / đi học / đúng giờ / ."';
      break;
    }
    case 'WORD_CLASSIFY':
    case 'DRAG_DROP': {
      const groups = p.groups.filter((g) => g.label);
      if (groups.length < 2) review = `Cần ít nhất 2 dòng "${kind === 'DRAG_DROP' ? 'Ô' : 'Nhóm'} <tên>: thẻ 1, thẻ 2"`;
      const tokens: Choice[] = [];
      const placement: Record<string, string> = {};
      const gid = kind === 'DRAG_DROP' ? 'z' : 'g';
      const tid = kind === 'DRAG_DROP' ? 't' : 'w';
      groups.forEach((g, gi) => g.items.forEach((text) => {
        const id = `${tid}${tokens.length + 1}`;
        tokens.push({ id, text });
        placement[id] = `${gid}${gi + 1}`;
      }));
      if (kind === 'DRAG_DROP') item = { ...base, type: 'DRAG_DROP', payload: { tokens, zones: groups.map((g, i) => ({ id: `z${i + 1}`, label: g.label })) }, key: { placement } };
      else item = { ...base, type: 'WORD_CLASSIFY', payload: { words: tokens, groups: groups.map((g, i) => ({ id: `g${i + 1}`, label: g.label })) }, key: { placement } };
      break;
    }
    case 'FILL_IN_PASSAGE': {
      const src = (F.passage ?? '').trim() || prompt;
      const b = blanks(src, 'b');
      if (!b.parts.length) review = 'Đoạn văn cần có chỗ trống ghi trong ngoặc vuông, ví dụ: Cây cối [đâm] chồi';
      const keyBlanks = Object.fromEntries(b.parts.map((alts, i) => [`b${i + 1}`, alts]));
      let bank: Choice[] | undefined;
      if (F.bank !== undefined) {
        const listed = F.bank.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
        const all = [...b.parts.map((a) => a[0]).filter(Boolean)];
        for (const w of listed) if (!all.some((x) => x.toLowerCase() === w.toLowerCase())) all.push(w);
        bank = all.map((text, i) => ({ id: `w${i + 1}`, text }));
      }
      item = { ...base, prompt: { text: F.passage ? prompt || 'Điền từ thích hợp vào chỗ trống.' : 'Điền từ thích hợp vào chỗ trống.' }, type: 'FILL_IN_PASSAGE', payload: { passage: b.text, ...(bank ? { bank } : {}) }, key: { blanks: keyBlanks } };
      break;
    }
    case 'INLINE_DROPDOWN': {
      const src = (F.passage ?? '').trim() || prompt;
      const b = blanks(src, 'd');
      const dropdowns: Record<string, Choice[]> = {};
      const keyB: Record<string, string> = {};
      let missing = 0;
      b.parts.forEach((alts, i) => {
        const id = `d${i + 1}`;
        const list = alts.map((a, j) => ({ id: `o${j + 1}`, text: a.replace(/^\*\s*/, '') }));
        dropdowns[id] = list;
        const star = alts.findIndex((a) => a.startsWith('*'));
        if (star >= 0) keyB[id] = list[star].id;
        else missing++;
      });
      if (!b.parts.length) review = 'Đoạn văn cần có ô chọn trong ngoặc vuông, ví dụ: My name [am|*is|are] Mai.';
      if (missing) notes.push(`${missing} ô chọn chưa đánh dấu * trước lựa chọn đúng`);
      const ok = !missing && b.parts.length > 0;
      item = { ...base, prompt: { text: F.passage ? prompt || 'Chọn từ đúng.' : 'Chọn từ đúng.' }, type: 'INLINE_DROPDOWN', payload: { passage: b.text, dropdowns }, ...(ok ? { key: { blanks: keyB } } : {}) } as Item;
      break;
    }
    case 'RECORD_READ': {
      const text = (F.passage ?? '').trim();
      const sec = Math.round(num(F.seconds ?? '') ?? 60);
      item = { ...base, prompt: { text: prompt || 'Em đọc to đoạn văn rồi ghi âm gửi thầy cô nhé.' }, type: 'RECORD_READ', payload: { text, maxSeconds: Math.min(180, Math.max(10, sec)) }, key: null };
      if (!text) review = 'Thiếu dòng "Đoạn đọc: …"';
      break;
    }
    case 'DRAW':
      item = { ...base, type: 'DRAW', payload: {}, key: null };
      break;
    case 'MATH_MANIPULATIVE': {
      if (F.clock !== undefined) {
        const m = F.clock.match(/(\d{1,2})\s*(?:giờ|h|:|g)\s*(\d{1,2})?/i);
        const h = m ? Number(m[1]) % 12 : NaN;
        const mi = m?.[2] ? Number(m[2]) : 0;
        item = { ...base, type: 'MATH_MANIPULATIVE', payload: { kind: 'clock' }, ...(m && mi < 60 ? { key: { value: h * 60 + mi } } : {}) } as Item;
        if (!m || mi >= 60) review = `Không hiểu giờ «${F.clock}» (ví dụ: 3 giờ 30 phút)`;
      } else {
        const m = (F.sticks ?? '').match(/^\s*(\d{1,3})\s*([+\-–])\s*(\d{1,3})\s*$/);
        if (m) {
          const a = Number(m[1]);
          const b = Number(m[3]);
          const op = m[2] === '+' ? '+' : '-';
          const value = op === '+' ? a + b : a - b;
          let choices = (F.choices ?? '').split(/\s*[,;]\s*/).map(num).filter((x): x is number => x !== null);
          if (choices.length && !choices.includes(value)) choices = [value, ...choices];
          item = { ...base, type: 'MATH_MANIPULATIVE', payload: { kind: 'sticks', operands: [a, b], op, ...(choices.length ? { choices } : {}) }, key: { value } };
          if (value < 0) review = 'Phép trừ cho kết quả âm';
        } else {
          item = { ...base, type: 'MATH_MANIPULATIVE', payload: { kind: 'sticks', operands: [0, 0], op: '+' }, key: { value: 0 } };
          review = 'Cần dòng "Que tính: 26 + 7" hoặc "Đồng hồ: 3 giờ 30 phút"';
        }
      }
      break;
    }
    case 'HOTSPOT':
      item = { ...base, type: 'HOTSPOT', payload: { image: PLACEHOLDER_IMAGE, aspect: 1.6, regions: [] } } as Item;
      review = `Dạng Chạm vào hình: bấm "Sửa chi tiết" để thêm ảnh và vẽ vùng chạm${F.regions ? ` (vùng đúng: ${F.regions})` : ''}`;
      break;
    default:
      item = makeShort(prompt, [answer], d);
  }

  if (!item.prompt.text.trim() && kind !== 'FILL_IN_PASSAGE' && kind !== 'INLINE_DROPDOWN') review = review ?? 'Chưa có đề bài';
  if (difficulty) item.difficulty = difficulty;
  else if (d0.difficulty) item.difficulty = d0.difficulty;
  const sk = F.skills ? parseSkills(F.skills, { subject: d.subject, grade: d.grade }) : { codes: [], unknown: [] };
  if (sk.unknown.length) notes.push(`Kĩ năng không có trong danh mục: ${sk.unknown.join(', ')}`);
  if (sk.codes.length) item.skills = sk.codes;
  else if (d0.skills?.length) item.skills = [...d0.skills];
  if (F.hint) item.hint = F.hint;
  if (F.expl) item.explanation = F.expl;

  return {
    rowId: newRowId(), item, source, notes, raw,
    ...(review ? { review } : {}),
    given: { ...(subject ? { subject: true } : {}), ...(grade ? { grade: true } : {}), ...(difficulty ? { difficulty: true } : {}) },
  };
}
