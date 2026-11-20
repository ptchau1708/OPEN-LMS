/** Xuất CSV / bảng dán (TSV) cho báo cáo và TT27 (thuần, có kiểm thử). */
import {
  SUBJECTS,
  TT27_COMPETENCY_LABEL,
  TT27_QUALITY_LABEL,
  TT27_TERM_LABEL,
  type AccountSlip,
  type ClassReportRow,
  type Profile,
  type SchoolOverview,
  type SubjectId,
  type Tt27Competency,
  type Tt27Evaluation,
  type Tt27Quality,
} from '@openedu/contracts';

export type Cell = string | number | null | undefined;

function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  return v;
}

/** CSV theo RFC 4180 (dấu phẩy, CRLF, có BOM để Excel đọc đúng tiếng Việt). Số thập phân dùng dấu phẩy kiểu Việt Nam. */
export function toCsv(rows: Cell[][], opts: { bom?: boolean } = {}): string {
  const body = rows
    .map((r) => r.map((v) => {
      const s = cellText(v);
      // Chặn công thức khi mở bằng Excel (CSV injection).
      const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
      return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    }).join(','))
    .join('\r\n');
  return (opts.bom === false ? '' : '﻿') + body + '\r\n';
}

/** Bảng phân cách tab để sao chép rồi dán vào phần mềm quản lí trường / Excel (xuống dòng trong ô → dấu cách). */
export function toTsv(rows: Cell[][]): string {
  return rows.map((r) => r.map((v) => cellText(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '' : `${Math.round(v * 100)}%`);

export function classReportRows(rows: ClassReportRow[]): Cell[][] {
  const head = ['Lớp', 'Khối', 'Giáo viên', 'Sĩ số', 'HS hoạt động', 'Bài hoàn thành', 'Câu đã làm', 'Tỉ lệ đúng', 'Thành thạo TB', 'HS có lỗ hổng', 'Chuyên cần 30 ngày', 'TT27 đã chốt', 'Bài viết đã duyệt'];
  return [head, ...rows.map((r) => [r.name, r.grade, r.teacherName ?? '', r.students, r.activeStudents, r.lessonsCompleted, r.answered, pct(r.correctRate), pct(r.avgMastery), r.studentsWithGaps, pct(r.attendanceRate), `${r.tt27Final}/${r.students}`, r.worksApproved])];
}

export function schoolReportCsv(o: SchoolOverview): string {
  const rows: Cell[][] = [
    ['Báo cáo trường', `${o.range.from.slice(0, 10)} → ${o.range.to.slice(0, 10)}`, `Năm học ${o.schoolYear}`, TT27_TERM_LABEL[o.termId]],
    [],
    ...classReportRows(o.rows),
    [],
    ['Khối', 'Môn', 'Số HS', 'Thành thạo TB', 'Tỉ lệ vững'],
    ...o.mastery.map((m) => [`Lớp ${m.grade}`, SUBJECTS[m.subject]?.name ?? m.subject, m.students, pct(m.avgMastery), pct(m.secureRate)]),
  ];
  return toCsv(rows);
}

const QUALITIES = Object.keys(TT27_QUALITY_LABEL) as Tt27Quality[];
const COMPETENCIES = Object.keys(TT27_COMPETENCY_LABEL) as Tt27Competency[];

/**
 * Bảng TT27 một lớp: STT, Mã HS, Họ và tên, mỗi môn (Mức đạt T/H/C, Điểm KTĐK, Nhận xét), năng lực, phẩm chất (T/Đ/C),
 * Nhận xét chung. Thứ tự cột giống mẫu nhập liệu của phần mềm quản lí trường; HS chưa có đánh giá vẫn có dòng (ô trống).
 */
export function tt27Rows(students: Profile[], evals: Tt27Evaluation[], subjects: SubjectId[], competencies: Tt27Competency[] = COMPETENCIES): Cell[][] {
  const by = new Map(evals.map((e) => [e.studentId, e]));
  const head: Cell[] = ['STT', 'Mã HS', 'Họ và tên'];
  for (const s of subjects) {
    const n = SUBJECTS[s]?.name ?? s;
    head.push(`${n} - Mức đạt`, `${n} - Điểm KTĐK`, `${n} - Nhận xét`);
  }
  for (const c of competencies) head.push(`NL ${TT27_COMPETENCY_LABEL[c]}`);
  for (const q of QUALITIES) head.push(`PC ${TT27_QUALITY_LABEL[q]}`);
  head.push('Nhận xét chung', 'Trạng thái');
  const rows: Cell[][] = [head];
  students.forEach((st, i) => {
    const e = by.get(st.id);
    const r: Cell[] = [i + 1, st.username ?? '', st.name];
    for (const s of subjects) {
      const x = e?.subjects[s];
      r.push(x?.level ?? '', x?.score ?? '', x?.comment ?? '');
    }
    for (const c of competencies) r.push(e?.competencies[c] ?? '');
    for (const q of QUALITIES) r.push(e?.qualities[q] ?? '');
    r.push(e?.generalComment ?? '', e ? (e.status === 'final' ? 'Đã chốt' : 'Nháp') : 'Chưa đánh giá');
    rows.push(r);
  });
  return rows;
}

export function accountSlipRows(slips: AccountSlip[]): Cell[][] {
  return [['Họ và tên', 'Lớp', 'Tên đăng nhập', 'Mật khẩu'], ...slips.map((s) => [s.name, s.className ?? '', s.username, s.password])];
}

/** Tên tệp an toàn: "Báo cáo 4A" → "bao-cao-4a.csv". */
export function csvFileName(title: string, ext = 'csv'): string {
  const base = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'bao-cao'}.${ext}`;
}

/** Trình duyệt: tải chuỗi về máy (không làm gì ngoài trình duyệt). */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
