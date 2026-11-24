/**
 * Mẫu Excel của ngân hàng câu hỏi: tải mẫu → điền → tải lên; xuất ngân hàng ra đúng mẫu này (sửa trong Excel rồi nhập lại).
 * Thuần (không đụng DOM). Cột — xem TEMPLATE_COLUMNS và docs/PHASE7_QUESTION_BANK.md.
 */
import { SKILL_BY_CODE, SUBJECTS, SUBJECT_LIST, subjectGradeNote, uid, type Choice, type Grade, type Item, type ItemBase, type SubjectId } from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { resolveChoiceAnswer } from './textParser';
import { DIFFICULTY_LABEL, isTrueFalse, letterId, makeMcq, makeShort, makeTrueFalse, newRowId, type DraftItem, type ImportDefaults } from './types';
import { readXlsx, writeXlsx, type XlsxCell, type XlsxSheet } from './xlsx';

export type TemplateKind = 'MCQ' | 'MCQ_MULTIPLE' | 'SHORT_ANSWER' | 'ORDERING' | 'MATCHING' | 'TRUE_FALSE';

export const KIND_LABEL: Record<TemplateKind, string> = {
  MCQ: 'Trắc nghiệm',
  MCQ_MULTIPLE: 'Nhiều đáp án',
  SHORT_ANSWER: 'Điền đáp án',
  ORDERING: 'Sắp xếp',
  MATCHING: 'Nối cặp',
  TRUE_FALSE: 'Đúng – Sai',
};

type Col = 'kind' | 'prompt' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'answer' | 'hint' | 'explanation' | 'difficulty' | 'subject' | 'grade' | 'skills' | 'unit' | 'id';
const OPT_COLS: Col[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export const TEMPLATE_COLUMNS: { col: Col; header: string; width: number; aliases: string[] }[] = [
  { col: 'kind', header: 'Loại', width: 14, aliases: ['loai', 'loai cau', 'loai cau hoi', 'dang', 'dang cau hoi', 'kieu', 'type'] },
  { col: 'prompt', header: 'Câu hỏi', width: 46, aliases: ['cau hoi', 'de bai', 'noi dung', 'noi dung cau hoi', 'de', 'question'] },
  { col: 'A', header: 'A', width: 18, aliases: ['a', 'dap an a', 'phuong an a', 'lua chon a', 'pa a', 'option a'] },
  { col: 'B', header: 'B', width: 18, aliases: ['b', 'dap an b', 'phuong an b', 'lua chon b', 'pa b', 'option b'] },
  { col: 'C', header: 'C', width: 18, aliases: ['c', 'dap an c', 'phuong an c', 'lua chon c', 'pa c', 'option c'] },
  { col: 'D', header: 'D', width: 18, aliases: ['d', 'dap an d', 'phuong an d', 'lua chon d', 'pa d', 'option d'] },
  { col: 'E', header: 'E', width: 14, aliases: ['e', 'dap an e', 'phuong an e', 'lua chon e', 'option e'] },
  { col: 'F', header: 'F', width: 14, aliases: ['f', 'dap an f', 'phuong an f', 'lua chon f', 'option f'] },
  { col: 'answer', header: 'Đáp án đúng', width: 16, aliases: ['dap an dung', 'dap an', 'da', 'd.a', 'd/a', 'ket qua', 'answer', 'key', 'dap so'] },
  { col: 'hint', header: 'Gợi ý', width: 24, aliases: ['goi y', 'huong dan', 'hint'] },
  { col: 'explanation', header: 'Giải thích', width: 28, aliases: ['giai thich', 'loi giai', 'giai', 'explanation'] },
  { col: 'difficulty', header: 'Mức độ', width: 12, aliases: ['muc do', 'muc', 'do kho', 'level'] },
  { col: 'subject', header: 'Môn', width: 14, aliases: ['mon', 'mon hoc', 'subject'] },
  { col: 'grade', header: 'Lớp', width: 6, aliases: ['lop', 'khoi', 'khoi lop', 'grade'] },
  { col: 'skills', header: 'Mã kĩ năng', width: 22, aliases: ['ma ki nang', 'ma ky nang', 'ki nang', 'ky nang', 'yccd', 'ma yccd', 'skills', 'skill'] },
  { col: 'unit', header: 'Đơn vị', width: 9, aliases: ['don vi', 'unit'] },
  { col: 'id', header: 'Mã câu (không sửa)', width: 20, aliases: ['ma cau', 'ma cau khong sua', 'ma', 'id'] },
];

const HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);
const fold = (s: string): string => foldVietnamese(String(s ?? '')).replace(/[():*]/g, ' ').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------------- đọc giá trị ô ---------------- */
const KIND_ALIASES: [TemplateKind, string[]][] = [
  ['MCQ_MULTIPLE', ['nhieu dap an', 'chon nhieu', 'chon nhieu dap an', 'trac nghiem nhieu dap an', 'nhieu lua chon dung', 'mcq_multiple', 'multiple']],
  ['MCQ', ['trac nghiem', 'chon 1 dap an', 'chon mot dap an', 'mot dap an', '1 dap an', 'tn', 'mcq', 'trac nghiem 1 dap an']],
  ['SHORT_ANSWER', ['dien dap an', 'dien', 'dien ngan', 'dien so', 'tra loi ngan', 'tu luan ngan', 'tu luan', 'short_answer', 'short']],
  ['ORDERING', ['sap xep', 'sap xep thu tu', 'xep thu tu', 'ordering']],
  ['MATCHING', ['noi cap', 'noi', 'ghep cap', 'ghep doi', 'noi cot', 'matching']],
  ['TRUE_FALSE', ['dung sai', 'dung/sai', 'dung hay sai', 'd/s', 'ds', 'true/false', 'true false']],
];

export function parseKind(v: string): TemplateKind | null {
  const f = fold(v);
  if (!f) return null;
  for (const [k, list] of KIND_ALIASES) if (list.includes(f)) return k;
  return null;
}

export function parseDifficulty(v: string): ItemBase['difficulty'] | undefined {
  const f = fold(v);
  if (!f) return undefined;
  if (['nhan biet', 'nb', '1', 'm1', 'muc 1', 'de', 'nhan-biet'].includes(f)) return 'nhan-biet';
  if (['ket noi', 'thong hieu', 'th', 'kn', '2', 'm2', 'muc 2', 'trung binh', 'tb', 'vua'].includes(f)) return 'ket-noi';
  if (['van dung', 'vd', 'van dung cao', 'vdc', '3', 'm3', 'muc 3', '4', 'm4', 'muc 4', 'kho', 'nang cao'].includes(f)) return 'van-dung';
  return undefined;
}

export function parseSubject(v: string): SubjectId | undefined {
  const f = fold(v);
  if (!f) return undefined;
  const hit = Object.values(SUBJECTS).find((s) => s.id === f || fold(s.name) === f || fold(s.id) === f);
  if (hit) return hit.id;
  const alias: Record<string, SubjectId> = {
    'tu nhien xa hoi': 'tnxh', 'tu nhien va xa hoi': 'tnxh', tnxh: 'tnxh', 'tn xh': 'tnxh', 'tn&xh': 'tnxh',
    'tieng viet': 'tieng-viet', tv: 'tieng-viet', 'tieng anh': 'tieng-anh', ta: 'tieng-anh', 'anh van': 'tieng-anh', 'ngoai ngu': 'tieng-anh', 'ngoai ngu 1': 'tieng-anh',
    'my thuat': 'mi-thuat', 'khoa hoc': 'khoa-hoc', kh: 'khoa-hoc', 'am nhac': 'am-nhac', nhac: 'am-nhac',
    'dao duc': 'dao-duc', dd: 'dao-duc',
    'lich su va dia li': 'lich-su-dia-li', 'lich su dia li': 'lich-su-dia-li', 'lich su & dia li': 'lich-su-dia-li', 'lich su va dia ly': 'lich-su-dia-li',
    'lich su dia ly': 'lich-su-dia-li', 'ls&dl': 'lich-su-dia-li', 'ls dl': 'lich-su-dia-li', lsdl: 'lich-su-dia-li', 'lich su': 'lich-su-dia-li', 'dia li': 'lich-su-dia-li', 'dia ly': 'lich-su-dia-li',
    'tin hoc': 'tin-hoc', tin: 'tin-hoc', 'tin hoc va cong nghe': 'tin-hoc', 'tin hoc & cong nghe': 'tin-hoc',
    'cong nghe': 'cong-nghe', cn: 'cong-nghe',
    'giao duc the chat': 'gdtc', gdtc: 'gdtc', 'the duc': 'gdtc',
    'hoat dong trai nghiem': 'hdtn', hdtn: 'hdtn', 'trai nghiem': 'hdtn',
  };
  return alias[f] ?? alias[f.replace(/\s*&\s*/g, ' va ')];
}

export function parseGrade(v: string): Grade | undefined {
  const m = String(v ?? '').match(/[1-5]/);
  const f = fold(v);
  if (!m || !/^(?:lop |khoi )?[1-5](?:\.0+)?$/.test(f)) return undefined;
  return Number(m[0]) as Grade;
}

export function parseSkills(v: string): { codes: string[]; unknown: string[] } {
  const codes: string[] = [];
  const unknown: string[] = [];
  for (const raw of String(v ?? '').split(/[,;\n]+/)) {
    const c = raw.trim();
    if (!c) continue;
    const hit = SKILL_BY_CODE[c] ? c : Object.keys(SKILL_BY_CODE).find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) {
      if (!codes.includes(hit)) codes.push(hit);
    } else unknown.push(c);
  }
  return { codes, unknown };
}

const PAIR_SEP = /\s*(?:→|->|=>|\|)\s*/;
function splitPair(cell: string): [string, string] | null {
  const m = cell.match(PAIR_SEP);
  const i = m?.index ?? cell.indexOf('=');
  if (i < 0) return null;
  const left = cell.slice(0, i).trim();
  const right = cell.slice(i + (m ? m[0].length : 1)).trim();
  return left && right ? [left, right] : null;
}

/* ---------------- dòng Excel → câu nháp ---------------- */
export interface RowsImportResult {
  drafts: DraftItem[];
  /** Số dòng dữ liệu trống đã bỏ qua. */
  skippedBlank: number;
  /** Dòng tiêu đề tìm thấy ở dòng mấy (từ 1); 0 = không có, dùng thứ tự cột của mẫu. */
  headerRow: number;
  warnings: string[];
}

function findHeader(rows: string[][]): { row: number; map: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const map: Partial<Record<Col, number>> = {};
    (rows[r] ?? []).forEach((cell, c) => {
      const f = fold(cell);
      if (!f) return;
      const hit = TEMPLATE_COLUMNS.find((t) => t.aliases.includes(f) || fold(t.header) === f);
      if (hit && map[hit.col] === undefined) map[hit.col] = c;
    });
    if (map.prompt !== undefined && (map.answer !== undefined || map.A !== undefined || map.kind !== undefined)) return { row: r, map };
  }
  return null;
}

/**
 * `bank`: các câu đang có (để dòng có "Mã câu" trùng thì CẬP NHẬT câu đó, giữ ảnh / thẻ / sao thưởng).
 */
export function rowsToDrafts(rowsIn: (string | number | null | undefined)[][], defaults: ImportDefaults, bank: Item[] = []): RowsImportResult {
  const rows = rowsIn.map((r) => (r ?? []).map((c) => (c === null || c === undefined ? '' : String(c).replace(/\r\n?/g, '\n').trim())));
  const warnings: string[] = [];
  const header = findHeader(rows);
  let map: Partial<Record<Col, number>>;
  let start: number;
  if (header) {
    map = header.map;
    start = header.row + 1;
  } else {
    map = Object.fromEntries(TEMPLATE_COLUMNS.map((t, i) => [t.col, i])) as Record<Col, number>;
    start = 0;
    warnings.push('Không thấy dòng tiêu đề (Loại, Câu hỏi, A, B, C, D, Đáp án đúng…) nên đọc theo thứ tự cột của mẫu.');
  }
  const bankById = new Map(bank.map((b) => [b.id, b]));
  const drafts: DraftItem[] = [];
  let skippedBlank = 0;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const get = (c: Col): string => (map[c] !== undefined ? row[map[c] as number] ?? '' : '');
    if (!row.some((c) => c)) {
      skippedBlank++;
      continue;
    }
    const notes: string[] = [];
    let review: string | undefined;
    const prompt = get('prompt');
    const opts = OPT_COLS.map(get);
    while (opts.length && !opts[opts.length - 1]) opts.pop();
    const answer = get('answer');
    const subject = parseSubject(get('subject'));
    const grade = parseGrade(get('grade'));
    const difficulty = parseDifficulty(get('difficulty'));
    if (get('subject') && !subject) notes.push(`Không hiểu môn «${get('subject')}»`);
    if (get('grade') && !grade) notes.push(`Không hiểu lớp «${get('grade')}»`);
    if (get('difficulty') && !difficulty) notes.push(`Không hiểu mức độ «${get('difficulty')}»`);
    const sk = parseSkills(get('skills'));
    if (sk.unknown.length) notes.push(`Mã kĩ năng không có trong danh mục: ${sk.unknown.join(', ')}`);
    const d: ImportDefaults = { ...defaults, grade: grade ?? defaults.grade, subject: subject ?? defaults.subject };

    let kind = parseKind(get('kind'));
    if (get('kind') && !kind) notes.push(`Không hiểu loại «${get('kind')}» — đã tự đoán`);
    if (!kind) {
      const filled = opts.filter(Boolean).length;
      if (filled >= 2) kind = (resolveChoiceAnswer(answer, opts)?.length ?? 0) > 1 ? 'MCQ_MULTIPLE' : 'MCQ';
      else if (/^(đúng|sai|đ|s)$/i.test(answer)) kind = 'TRUE_FALSE';
      else kind = 'SHORT_ANSWER';
    }

    let item: Item;
    const gaps = opts.some((o) => !o);
    switch (kind) {
      case 'MCQ':
      case 'MCQ_MULTIPLE': {
        const correct = answer ? resolveChoiceAnswer(answer, opts) : null;
        if (answer && !correct) notes.push(`Không hiểu đáp án «${answer}»`);
        if (kind === 'MCQ' && correct && correct.length > 1) notes.push('Có nhiều đáp án đúng nên chuyển thành dạng "Nhiều đáp án"');
        item = makeMcq(prompt, opts, correct ?? [], d, kind === 'MCQ_MULTIPLE');
        if (gaps) review = 'Có ô lựa chọn bỏ trống ở giữa (ví dụ có A, C mà thiếu B)';
        break;
      }
      case 'TRUE_FALSE': {
        const a = fold(answer);
        const val = ['dung', 'd', 'true', 'a', '1'].includes(a) ? true : ['sai', 's', 'false', 'b', '2', '0'].includes(a) ? false : null;
        if (answer && val === null) notes.push(`Không hiểu đáp án «${answer}» (ghi Đúng hoặc Sai)`);
        item = makeTrueFalse(prompt, val, d);
        break;
      }
      case 'ORDERING': {
        const cards = opts.filter(Boolean);
        const items: Choice[] = cards.map((text, i) => ({ id: `i${i + 1}`, text }));
        let order = items.map((c) => c.id);
        if (answer) {
          const idx = resolveChoiceAnswerOrder(answer, cards.length);
          if (idx) order = idx.map((i) => items[i].id);
          else notes.push(`Không hiểu thứ tự «${answer}» — dùng thứ tự A, B, C… như đã ghi`);
        }
        item = { id: uid('it'), type: 'ORDERING', grade: d.grade, subject: d.subject, prompt: { text: prompt }, stars: 1, payload: { items }, key: { order } };
        break;
      }
      case 'MATCHING': {
        const pairs = opts.filter(Boolean).map(splitPair);
        const good = pairs.filter((p): p is [string, string] => !!p);
        if (good.length !== pairs.length) review = 'Mỗi ô A–F của câu Nối cặp cần ghi "vế trái = vế phải"';
        const left: Choice[] = good.map((p, i) => ({ id: `l${i + 1}`, text: p[0] }));
        const right: Choice[] = good.map((p, i) => ({ id: `r${i + 1}`, text: p[1] }));
        item = { id: uid('it'), type: 'MATCHING', grade: d.grade, subject: d.subject, prompt: { text: prompt }, stars: 1, payload: { left, right }, key: { pairs: Object.fromEntries(left.map((l, i) => [l.id, right[i].id])) } };
        break;
      }
      default:
        item = makeShort(prompt, answer.split(/\s*[;|]\s*|\s+hoặc\s+/i), d, get('unit'));
    }
    if (difficulty) item.difficulty = difficulty;
    else if (defaults.difficulty) item.difficulty = defaults.difficulty;
    if (sk.codes.length) item.skills = sk.codes;
    else if (defaults.skills?.length) item.skills = [...defaults.skills];
    if (get('hint')) item.hint = get('hint');
    if (get('explanation')) item.explanation = get('explanation');

    let updatesExisting = false;
    const old = get('id') ? bankById.get(get('id')) : undefined;
    if (old) {
      item = mergeExisting(old, item);
      updatesExisting = true;
    } else if (get('id')) notes.push('Mã câu không có trong ngân hàng — sẽ lưu thành câu mới');

    drafts.push({
      rowId: newRowId(), item, source: 'xlsx', notes, raw: `Dòng ${r + 1}`,
      ...(review ? { review } : {}),
      ...(updatesExisting ? { updatesExisting } : {}),
      given: { ...(subject ? { subject: true } : {}), ...(grade ? { grade: true } : {}), ...(difficulty ? { difficulty: true } : {}) },
    });
  }
  return { drafts, skippedBlank, headerRow: header ? header.row + 1 : 0, warnings };
}

/** "B, A, C" / "2,1,3" / "BAC" → hoán vị chỉ số; null nếu không phải hoán vị đủ. */
function resolveChoiceAnswerOrder(answer: string, n: number): number[] | null {
  const tokens = answer.match(/[A-Fa-f](?![a-zà-ỹ])|\d+/g) ?? [];
  const idx = tokens.map((t) => (/\d/.test(t) ? Number(t) - 1 : t.toLowerCase().charCodeAt(0) - 97));
  return idx.length === n && new Set(idx).size === n && idx.every((i) => i >= 0 && i < n) ? idx : null;
}

/** Cập nhật câu đã có từ dòng Excel: giữ id, ảnh, âm thanh, thẻ, sao; lựa chọn giữ ảnh/câu đọc theo vị trí. */
function mergeExisting(old: Item, next: Item): Item {
  const keepChoice = (o: Choice | undefined, n: Choice): Choice => (o ? { ...n, ...(o.image ? { image: o.image } : {}), ...(o.speak ? { speak: o.speak } : {}), ...(o.misconception && o.text === n.text ? { misconception: o.misconception } : {}) } : n);
  const merged = {
    ...next,
    id: old.id,
    prompt: { ...old.prompt, text: next.prompt.text },
    ...(old.stars !== undefined ? { stars: old.stars } : {}),
    ...(old.tags ? { tags: old.tags } : {}),
    ...(old.skill ? { skill: old.skill } : {}),
  } as Item;
  if ((merged.type === 'MCQ' || merged.type === 'MCQ_MULTIPLE') && (old.type === 'MCQ' || old.type === 'MCQ_MULTIPLE')) {
    merged.payload = { ...old.payload, options: merged.payload.options.map((c, i) => keepChoice(old.payload.options[i], c)) };
  } else if (merged.type === 'SHORT_ANSWER' && old.type === 'SHORT_ANSWER') {
    merged.payload = { ...old.payload, ...merged.payload };
    if (old.key?.caseSensitive && merged.key) merged.key = { ...merged.key, caseSensitive: true };
  } else if (merged.type === 'ORDERING' && old.type === 'ORDERING') {
    merged.payload = { ...old.payload, items: merged.payload.items };
  }
  return merged;
}

/* ---------------- câu hỏi → dòng Excel ---------------- */
export function templateKindOf(item: Item): TemplateKind | null {
  const plain = (list: Choice[]): boolean => list.every((c) => !!c.text && !c.image);
  switch (item.type) {
    case 'MCQ':
      if (isTrueFalse(item)) return 'TRUE_FALSE';
      return item.payload.options.length <= 6 && plain(item.payload.options) ? 'MCQ' : null;
    case 'MCQ_MULTIPLE':
      return item.payload.options.length <= 6 && plain(item.payload.options) ? 'MCQ_MULTIPLE' : null;
    case 'SHORT_ANSWER':
      return 'SHORT_ANSWER';
    case 'ORDERING':
      return item.payload.items.length <= 6 && plain(item.payload.items) ? 'ORDERING' : null;
    case 'MATCHING':
      return item.payload.left.length <= 6 && item.payload.left.length === item.payload.right.length && plain(item.payload.left) && plain(item.payload.right) ? 'MATCHING' : null;
    default:
      return null;
  }
}

const letters = (idx: number[]): string => idx.filter((i) => i >= 0).map((i) => letterId(i).toUpperCase()).join(', ');

export function itemToRow(item: Item, withId = true): XlsxCell[] | null {
  const kind = templateKindOf(item);
  if (!kind) return null;
  const cell: Partial<Record<Col, XlsxCell>> = {
    kind: KIND_LABEL[kind],
    prompt: item.prompt.text,
    hint: item.hint,
    explanation: item.explanation,
    difficulty: item.difficulty ? DIFFICULTY_LABEL[item.difficulty] : '',
    subject: SUBJECTS[item.subject]?.name ?? '',
    grade: item.grade,
    skills: (item.skills ?? []).join(', '),
    ...(withId ? { id: item.id } : {}),
  };
  const setOpts = (texts: string[]): void => texts.forEach((t, i) => { cell[OPT_COLS[i]] = t; });
  if (item.type === 'MCQ' && kind === 'TRUE_FALSE') cell.answer = item.key?.correct === item.payload.options[0].id ? 'Đúng' : item.key?.correct === item.payload.options[1].id ? 'Sai' : '';
  else if (item.type === 'MCQ') {
    setOpts(item.payload.options.map((o) => o.text ?? ''));
    cell.answer = letters([item.payload.options.findIndex((o) => o.id === item.key?.correct)]);
  } else if (item.type === 'MCQ_MULTIPLE') {
    setOpts(item.payload.options.map((o) => o.text ?? ''));
    cell.answer = letters(item.payload.options.map((o, i) => ((item.key?.correct ?? []).includes(o.id) ? i : -1)));
  } else if (item.type === 'SHORT_ANSWER') {
    cell.answer = (item.key?.accepted ?? []).join('; ');
    cell.unit = item.payload.unit;
  } else if (item.type === 'ORDERING') {
    // ghi các thẻ theo ĐÚNG thứ tự; cột đáp án để trống = "đúng như thứ tự A, B, C…"
    const byId = new Map(item.payload.items.map((c) => [c.id, c]));
    const ordered = (item.key?.order ?? []).map((id) => byId.get(id)).filter((c): c is Choice => !!c);
    setOpts((ordered.length === item.payload.items.length ? ordered : item.payload.items).map((c) => c.text ?? ''));
  } else if (item.type === 'MATCHING') {
    const right = new Map(item.payload.right.map((c) => [c.id, c.text ?? '']));
    setOpts(item.payload.left.map((l) => {
      const r = right.get(item.key?.pairs?.[l.id] ?? '') ?? '';
      const sep = `${l.text}${r}`.includes('=') ? ' → ' : ' = ';
      return `${l.text}${sep}${r}`;
    }));
  }
  return TEMPLATE_COLUMNS.map((t) => cell[t.col] ?? '');
}

const GUIDE: XlsxCell[][] = [
  ['HƯỚNG DẪN ĐIỀN MẪU NGÂN HÀNG CÂU HỎI'],
  [''],
  ['Mỗi dòng ở trang "Câu hỏi" là một câu. Giữ nguyên dòng tiêu đề. Xoá các dòng ví dụ trước khi tải lên (hoặc bỏ chọn chúng ở màn hình soát).'],
  [''],
  ['Cột', 'Cách điền'],
  ['Loại', 'Trắc nghiệm | Nhiều đáp án | Điền đáp án | Sắp xếp | Nối cặp | Đúng – Sai. Bỏ trống: có A, B… thì là Trắc nghiệm, không có thì là Điền đáp án.'],
  ['Câu hỏi', 'Đề bài. Bắt buộc.'],
  ['A … F', 'Trắc nghiệm / Nhiều đáp án: các lựa chọn (ít nhất 2). Sắp xếp: các thẻ, ghi theo ĐÚNG thứ tự. Nối cặp: mỗi ô một cặp "vế trái = vế phải". Điền đáp án, Đúng – Sai: bỏ trống.'],
  ['Đáp án đúng', 'Trắc nghiệm: B (hoặc b, 2, hoặc chép đúng nội dung lựa chọn). Nhiều đáp án: A, C. Điền đáp án: 25 (nhiều cách viết đúng ngăn bằng dấu ; ví dụ 0,5; 1/2). Đúng – Sai: Đúng hoặc Sai. Sắp xếp, Nối cặp: bỏ trống.'],
  ['Gợi ý', 'Hiện khi học sinh làm chưa đúng. Không bắt buộc.'],
  ['Giải thích', 'Hiện sau khi nộp. Không bắt buộc.'],
  ['Mức độ', 'Nhận biết | Kết nối | Vận dụng (hoặc 1, 2, 3). Không bắt buộc.'],
  ['Môn', `${SUBJECT_LIST.map((s) => (s.id === 'khac' ? s.name : `${s.name} (${subjectGradeNote(s.id)})`)).join(' | ')}. Bỏ trống: dùng môn chọn lúc tải lên.`],
  ['Lớp', '1 đến 5. Bỏ trống: dùng lớp chọn lúc tải lên.'],
  ['Mã kĩ năng', 'Mã yêu cầu cần đạt, ví dụ T4.PS.RUT-GON; nhiều mã ngăn bằng dấu phẩy. Có thể bỏ trống rồi gắn ở màn hình soát.'],
  ['Đơn vị', 'Chỉ cho Điền đáp án: cm, kg, giờ… (hiện cạnh ô trả lời). Không bắt buộc.'],
  ['Mã câu (không sửa)', 'Chỉ có khi xuất từ ngân hàng. Giữ nguyên để khi tải lên, câu đó được CẬP NHẬT thay vì tạo câu mới. Câu mới thì bỏ trống.'],
];

const EXAMPLES: XlsxCell[][] = [
  ['Trắc nghiệm', 'Số liền sau của 99 là:', '98', '100', '101', '109', '', '', 'B', 'Số liền sau lớn hơn số đã cho 1 đơn vị.', '99 + 1 = 100', 'Nhận biết', 'Toán', 2, '', '', ''],
  ['Nhiều đáp án', 'Những số nào là số chẵn?', '12', '15', '20', '31', '', '', 'A, C', '', 'Số chẵn có chữ số tận cùng là 0, 2, 4, 6, 8.', 'Kết nối', 'Toán', 3, '', '', ''],
  ['Điền đáp án', 'Một hình vuông có cạnh 6 cm. Chu vi hình vuông đó là bao nhiêu?', '', '', '', '', '', '', '24', 'Chu vi hình vuông = cạnh × 4', '6 × 4 = 24 (cm)', 'Vận dụng', 'Toán', 3, '', 'cm', ''],
  ['Đúng – Sai', 'Từ "xinh xắn" là từ chỉ đặc điểm. Đúng hay sai?', '', '', '', '', '', '', 'Đúng', '', '', 'Nhận biết', 'Tiếng Việt', 2, '', '', ''],
  ['Sắp xếp', 'Sắp xếp các số theo thứ tự từ bé đến lớn.', '0,25', '1/2', '0,75', '1', '', '', '', '', '', 'Kết nối', 'Toán', 5, '', '', ''],
  ['Nối cặp', 'Nối phép tính với kết quả đúng.', '7 × 8 = 56', '9 × 6 = 54', '8 × 8 = 64', '', '', '', '', '', '', 'Nhận biết', 'Toán', 3, '', '', ''],
];

function questionSheet(rows: XlsxCell[][]): XlsxSheet {
  const col = (c: Col): number => TEMPLATE_COLUMNS.findIndex((t) => t.col === c);
  return {
    name: 'Câu hỏi',
    rows: [HEADERS, ...rows],
    widths: TEMPLATE_COLUMNS.map((t) => t.width),
    lists: [
      { col: col('kind'), values: Object.values(KIND_LABEL) },
      { col: col('difficulty'), values: Object.values(DIFFICULTY_LABEL) },
      { col: col('subject'), values: SUBJECT_LIST.map((s) => s.name) },
      { col: col('grade'), values: ['1', '2', '3', '4', '5'] },
    ],
  };
}

const guideSheet = (): XlsxSheet => ({ name: 'Hướng dẫn', rows: GUIDE, widths: [22, 120], headerRows: 0 });

/** Tệp mẫu để GV tải về (có 6 dòng ví dụ, mỗi loại một dòng). */
export function buildTemplateXlsx(): Uint8Array {
  return writeXlsx([questionSheet(EXAMPLES), guideSheet()]);
}

export interface ExportResult {
  bytes: Uint8Array;
  exported: number;
  /** Hoạt động thuộc dạng mẫu Excel chưa chứa được (kéo thả, có ảnh trong lựa chọn…). */
  skipped: number;
}

export function exportItemsXlsx(items: Item[]): ExportResult {
  const rows = items.map((it) => itemToRow(it)).filter((r): r is XlsxCell[] => !!r);
  return { bytes: writeXlsx([questionSheet(rows), guideSheet()]), exported: rows.length, skipped: items.length - rows.length };
}

/** Đọc tệp .xlsx (trang "Câu hỏi" nếu có, không thì trang đầu) → câu nháp. */
export function importXlsx(data: Uint8Array, defaults: ImportDefaults, bank: Item[] = []): RowsImportResult {
  const first = readXlsx(data);
  const named = first.sheetNames.find((n) => fold(n) === 'cau hoi');
  const sheet = named && named !== first.sheetNames[0] ? readXlsx(data, { sheet: named }) : first;
  const res = rowsToDrafts(sheet.rows, defaults, bank);
  if (sheet.truncated) res.warnings.push('Tệp có quá nhiều dòng — chỉ đọc 5000 dòng đầu.');
  return res;
}
