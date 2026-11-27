/** Thông tin bổ sung của học sinh do thầy/cô nhập (dữ liệu thu thập bên ngoài ứng dụng). */
export type NoteCategory = 'quan-sat' | 'hoc-tap' | 'suc-khoe' | 'gia-dinh' | 'nang-khieu' | 'khen-thuong' | 'khac';
export const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  'quan-sat': 'Quan sát, nhận xét',
  'hoc-tap': 'Kết quả học tập bên ngoài',
  'suc-khoe': 'Sức khoẻ',
  'gia-dinh': 'Gia đình, hoàn cảnh',
  'nang-khieu': 'Năng khiếu, sở thích',
  'khen-thuong': 'Khen thưởng, thành tích',
  khac: 'Khác',
};
export const NOTE_CATEGORIES = Object.keys(NOTE_CATEGORY_LABEL) as NoteCategory[];
export type NoteSource = 'tay' | 'word' | 'excel';
export const NOTE_SOURCE_LABEL: Record<NoteSource, string> = { tay: 'Nhập tay', word: 'Từ Word', excel: 'Từ Excel' };

export interface StudentNote {
  id: string;
  studentId: string;
  category: NoteCategory;
  title: string;
  /** Nội dung (văn bản). */
  body: string;
  /** Các cột dữ liệu (nhập từ Excel): nhãn cột → giá trị. */
  fields: Record<string, string>;
  /** Ngày ghi nhận YYYY-MM-DD. */
  date: string;
  source: NoteSource;
  /** Tên tệp Word / Excel đã nhập. */
  sourceName?: string;
  /** Phụ huynh xem được. Mặc định: chỉ thầy/cô. */
  shareParent: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
export type StudentNoteInput = Omit<StudentNote, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string };

export const NOTE_LIMITS = { title: 200, body: 20000, fields: 60, fieldText: 500 } as const;

/** Làm sạch trước khi lưu; trả lỗi tiếng Việt nếu thiếu. */
export function cleanNote(i: StudentNoteInput): StudentNoteInput {
  const title = i.title.replace(/\s+/g, ' ').trim().slice(0, NOTE_LIMITS.title);
  if (!title) throw new Error('Thầy/cô nhập tiêu đề cho ghi chép nhé.');
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.fields ?? {}).slice(0, NOTE_LIMITS.fields)) {
    const key = k.replace(/\s+/g, ' ').trim().slice(0, 80);
    const val = String(v ?? '').trim().slice(0, NOTE_LIMITS.fieldText);
    if (key && val) fields[key] = val;
  }
  const body = (i.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, NOTE_LIMITS.body);
  if (!body && !Object.keys(fields).length) throw new Error('Ghi chép chưa có nội dung.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : new Date().toISOString().slice(0, 10);
  return { ...i, title, body, fields, date, ...(i.sourceName ? { sourceName: i.sourceName.slice(0, 200) } : {}) };
}
