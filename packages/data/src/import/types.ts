/**
 * Nhập câu hỏi nhanh (tệp Excel/Word, dán văn bản, AI) — kiểu dùng chung.
 * Mọi nguồn đều cho ra DraftItem[] để GV soát ở MỘT màn hình rồi mới lưu vào ngân hàng.
 */
import { uid, type Grade, type Item, type ItemBase, type SubjectId } from '@openedu/contracts';

export type DraftStatus = 'ready' | 'missing-answer' | 'review';
export type DraftSource = 'text' | 'xlsx' | 'docx' | 'ai' | 'manual';

export interface DraftItem {
  /** Id của dòng trên màn hình soát (không phải id câu hỏi). */
  rowId: string;
  item: Item;
  source: DraftSource;
  /** Lí do cần GV xem lại (khối chữ không hiểu được, AI mẫu…). Có giá trị → trạng thái 'review' cho tới khi GV sửa hoặc bấm "Đã xem". */
  review?: string;
  /** Ghi chú nhẹ (không chặn lưu). */
  notes: string[];
  /** Văn bản gốc của khối (để GV đối chiếu). */
  raw?: string;
  /** true: dòng có "Mã câu" trùng một câu đã có → lưu là CẬP NHẬT câu đó. */
  updatesExisting?: boolean;
  /** true: kết quả mẫu của chế độ demo (không phải AI thật). */
  demo?: boolean;
  /** Trường GV/tệp đã ghi rõ — thao tác "đặt cho tất cả" vẫn ghi đè, nhưng mặc định của hộp thoại thì không. */
  given?: { subject?: boolean; grade?: boolean; difficulty?: boolean };
}

export interface ImportDefaults {
  grade: Grade;
  subject: SubjectId;
  difficulty?: ItemBase['difficulty'];
  skills?: string[];
}

export const DEFAULT_IMPORT: ImportDefaults = { grade: 5, subject: 'toan' };

export const DIFFICULTY_LABEL: Record<NonNullable<ItemBase['difficulty']>, string> = {
  'nhan-biet': 'Nhận biết',
  'ket-noi': 'Kết nối',
  'van-dung': 'Vận dụng',
};

export const STATUS_LABEL: Record<DraftStatus, string> = {
  ready: 'Sẵn sàng',
  'missing-answer': 'Thiếu đáp án',
  review: 'Cần xem lại',
};

export function newRowId(): string {
  return uid('row');
}

export const letterId = (i: number): string => String.fromCharCode(97 + i);

/** Dựng nhanh các dạng thường gặp (dùng chung cho bộ đọc văn bản, Excel, lưới gõ nhanh). */
export function makeMcq(prompt: string, options: string[], correct: number[], d: ImportDefaults, forceMulti = false): Item {
  const opts = options.map((text, i) => ({ id: letterId(i), text }));
  const base = { id: uid('it'), grade: d.grade, subject: d.subject, prompt: { text: prompt }, stars: 1 };
  const ids = correct.filter((i) => i >= 0 && i < opts.length).map(letterId);
  if (forceMulti || ids.length > 1) return { ...base, type: 'MCQ_MULTIPLE', payload: { options: opts, columns: 1 }, key: { correct: ids } };
  return { ...base, type: 'MCQ', payload: { options: opts, columns: 1 }, key: { correct: ids[0] ?? '' } };
}

const UNITS = ['mm', 'cm', 'dm', 'm', 'km', 'g', 'kg', 'tạ', 'tấn', 'yến', 'ml', 'l', 'lít', 'giờ', 'phút', 'giây', 'ngày', 'tuần', 'tháng', 'năm', 'đồng', 'cm2', 'dm2', 'm2', 'km2', 'cm²', 'dm²', 'm²', 'km²', 'cm3', 'dm3', 'm3', 'cm³', 'dm³', 'm³', '%', '°', '°C', 'độ'];
const NUM = /^-?\d+(?:[.,]\d+)?$/;

/** "25 cm" → { value: '25', unit: 'cm' }; không phải số + đơn vị quen thuộc → null. */
export function splitUnit(answer: string): { value: string; unit: string } | null {
  const m = answer.trim().match(/^(-?\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([^\d\s].*)$/);
  if (!m) return null;
  const unit = m[2].trim().replace(/\.$/, '');
  return UNITS.some((u) => u.toLowerCase() === unit.toLowerCase()) ? { value: m[1], unit } : null;
}

export function makeShort(prompt: string, answers: string[], d: ImportDefaults, unit?: string): Item {
  let accepted = answers.map((a) => a.trim()).filter(Boolean);
  let u = unit?.trim() || undefined;
  if (!u && accepted.length === 1) {
    const s = splitUnit(accepted[0]);
    if (s) {
      accepted = [s.value];
      u = s.unit;
    }
  }
  const numeric = accepted.length > 0 && accepted.every((a) => NUM.test(a));
  return {
    id: uid('it'), type: 'SHORT_ANSWER', grade: d.grade, subject: d.subject, prompt: { text: prompt }, stars: 1,
    payload: { ...(numeric ? { inputMode: 'numeric' as const } : {}), ...(u ? { unit: u } : {}) },
    key: { accepted },
  };
}

export const TRUE_FALSE = ['Đúng', 'Sai'] as const;

export function makeTrueFalse(prompt: string, answer: boolean | null, d: ImportDefaults): Item {
  return makeMcq(prompt, [...TRUE_FALSE], answer === null ? [] : [answer ? 0 : 1], d);
}

export function isTrueFalse(item: Item): boolean {
  return item.type === 'MCQ' && item.payload.options.length === 2 && item.payload.options[0].text === 'Đúng' && item.payload.options[1].text === 'Sai';
}

export function applyDefaults(item: Item, d: ImportDefaults): Item {
  const out = { ...item } as Item;
  if (d.difficulty && !out.difficulty) out.difficulty = d.difficulty;
  if (d.skills?.length && !out.skills?.length) out.skills = [...d.skills];
  return out;
}
