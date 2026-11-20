/**
 * Các bảng Excel dựng sẵn (không cần mẫu): danh sách lớp, bảng điểm một đề, tổng hợp TT27, chuyên cần tháng,
 * bảng điểm cho Google Classroom / Google Sheets. Cột đầu luôn là STT, Mã HS, Họ và tên. Thuần, có kiểm thử.
 */
import {
  ATTENDANCE_LABEL,
  SUBJECTS,
  TT27_COMPETENCY_LABEL,
  TT27_QUALITY_LABEL,
  TT27_TERM_LABEL,
  type AttendanceStatus,
  type ExamReport,
  type Profile,
  type Tt27Competency,
  type Tt27Quality,
} from '@openedu/contracts';
import { attendanceCountsOf, bridgeSubjects, workAverage, type BridgeData } from './fields';
import type { XCell, XSheetSpec } from './xlsx';

const code = (s: Profile) => s.externalCode ?? '';
const titleRows = (title: string, sub: string): XCell[][] => [[title], [sub], []];

/** (a) Danh sách lớp. */
export function classListSheet(d: BridgeData): XSheetSpec {
  const head = ['STT', 'Mã học sinh', 'Họ và tên', 'Lớp', 'Tên đăng nhập OPEN-EDU', 'Email Google'];
  const rows: XCell[][] = d.students.map((s, i) => [i + 1, code(s), s.name, d.cls.name, s.username ?? '', d.googleEmails?.[s.id] ?? '']);
  return { name: `Danh sách ${d.cls.name}`, rows: [...titleRows(`DANH SÁCH HỌC SINH LỚP ${d.cls.name}`, `Năm học ${d.schoolYear} · ${d.students.length} học sinh`), head, ...rows], header: 3, textCols: [1], widths: [6, 16, 28, 8, 24, 30] };
}

/** (b) Bảng điểm một đề kiểm tra. */
export function examScoreSheet(d: BridgeData, report: ExamReport): XSheetSpec {
  const head = ['STT', 'Mã học sinh', 'Họ và tên', 'Điểm (thang 10)', 'Mức đạt', 'Điểm thô', 'Điểm tối đa', 'Trạng thái', 'Nộp lúc'];
  const by = new Map(report.students.map((r) => [r.student.id, r]));
  const rows: XCell[][] = d.students.map((s, i) => {
    const r = by.get(s.id);
    const a = r?.attempt;
    const done = a?.status === 'submitted';
    return [i + 1, code(s), s.name, done ? a?.score10 ?? null : null, done ? r?.level ?? null : null, done ? a?.score ?? null : null, done ? a?.maxScore ?? null : null,
      !r ? 'Không thuộc đề này' : done ? 'Đã nộp' : a ? 'Đang làm' : 'Chưa làm', done && a?.submittedAt ? new Date(a.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : null];
  });
  const e = report.exam;
  return { name: 'Bảng điểm', rows: [...titleRows(`BẢNG ĐIỂM: ${e.title}`, `Lớp ${d.cls.name} · ${SUBJECTS[e.subject]?.name ?? e.subject} · ${report.submitted}/${report.students.length} em đã nộp${report.mean !== null ? ` · điểm trung bình ${String(report.mean).replace('.', ',')}` : ''}`), head, ...rows], header: 3, textCols: [1], widths: [6, 16, 28, 10, 9, 9, 9, 16, 20] };
}

const QUALITIES = Object.keys(TT27_QUALITY_LABEL) as Tt27Quality[];
const COMPETENCIES = Object.keys(TT27_COMPETENCY_LABEL) as Tt27Competency[];

/** (c) Tổng hợp TT27 của lớp theo kì: tiêu đề 2 tầng (môn → mức đạt / điểm / nhận xét). */
export function tt27Sheet(d: BridgeData): XSheetSpec {
  const subjects = bridgeSubjects(d);
  const top: XCell[] = ['STT', 'Mã học sinh', 'Họ và tên'];
  const sub: XCell[] = [null, null, null];
  const merges: XSheetSpec['merges'] = [0, 1, 2].map((c) => ({ r1: 3, c1: c, r2: 4, c2: c }));
  const widths: number[] = [6, 16, 28];
  for (const s of subjects) {
    merges.push({ r1: 3, c1: top.length, r2: 3, c2: top.length + 2 });
    top.push(SUBJECTS[s]?.name ?? s, null, null);
    sub.push('Mức đạt', 'Điểm KTĐK', 'Nhận xét');
    widths.push(8, 8, 44);
  }
  merges.push({ r1: 3, c1: top.length, r2: 3, c2: top.length + COMPETENCIES.length - 1 });
  top.push('Năng lực', ...COMPETENCIES.slice(1).map(() => null));
  for (const c of COMPETENCIES) { sub.push(TT27_COMPETENCY_LABEL[c]); widths.push(11); }
  merges.push({ r1: 3, c1: top.length, r2: 3, c2: top.length + QUALITIES.length - 1 });
  top.push('Phẩm chất', ...QUALITIES.slice(1).map(() => null));
  for (const q of QUALITIES) { sub.push(TT27_QUALITY_LABEL[q]); widths.push(11); }
  for (const label of ['Nhận xét chung', 'Trạng thái']) {
    merges.push({ r1: 3, c1: top.length, r2: 4, c2: top.length });
    top.push(label);
    sub.push(null);
    widths.push(label === 'Trạng thái' ? 14 : 50);
  }
  const by = new Map(d.tt27.map((e) => [e.studentId, e]));
  const rows: XCell[][] = d.students.map((st, i) => {
    const e = by.get(st.id);
    const r: XCell[] = [i + 1, code(st), st.name];
    for (const s of subjects) { const x = e?.subjects[s]; r.push(x?.level ?? null, x?.score ?? null, x?.comment || null); }
    for (const c of COMPETENCIES) r.push(e?.competencies[c] ?? null);
    for (const q of QUALITIES) r.push(e?.qualities[q] ?? null);
    r.push(e?.generalComment || null, e ? (e.status === 'final' ? 'Đã chốt' : 'Nháp') : 'Chưa đánh giá');
    return r;
  });
  return { name: `TT27 ${d.termId}`, rows: [...titleRows(`TỔNG HỢP ĐÁNH GIÁ THEO THÔNG TƯ 27 — LỚP ${d.cls.name}`, `${TT27_TERM_LABEL[d.termId]} · Năm học ${d.schoolYear} · T/H/C: Hoàn thành tốt / Hoàn thành / Chưa hoàn thành · T/Đ/C: Tốt / Đạt / Cần cố gắng`), top, sub, ...rows], header: 3, headerRows: 2, merges, textCols: [1], widths };
}

const ATT_CODE: Record<AttendanceStatus, string> = { 'co-mat': '', muon: 'M', 'vang-co-phep': 'P', 'vang-khong-phep': 'K' };

/** (d) Chuyên cần theo tháng: mỗi ngày đã điểm danh một cột (M muộn · P có phép · K không phép) + tổng. */
export function attendanceSheet(d: BridgeData): XSheetSpec {
  const days = [...d.attendance].sort((a, b) => a.date.localeCompare(b.date));
  const head: XCell[] = ['STT', 'Mã học sinh', 'Họ và tên', ...days.map((x) => `${x.date.slice(8)}/${x.date.slice(5, 7)}`), 'Có mặt', 'Đi muộn', 'Vắng có phép', 'Vắng không phép'];
  const rows: XCell[][] = d.students.map((s, i) => {
    const c = attendanceCountsOf(days, s.id);
    return [i + 1, code(s), s.name, ...days.map((x) => ATT_CODE[x.entries[s.id] ?? 'co-mat'] || null), c.present, c.late, c.excused, c.unexcused];
  });
  const m = `${d.month.slice(5)}/${d.month.slice(0, 4)}`;
  return { name: `Chuyên cần ${d.month}`, rows: [...titleRows(`CHUYÊN CẦN THÁNG ${m} — LỚP ${d.cls.name}`, `${days.length} ngày đã điểm danh · M: ${ATTENDANCE_LABEL.muon} · P: ${ATTENDANCE_LABEL['vang-co-phep']} · K: ${ATTENDANCE_LABEL['vang-khong-phep']} · Có mặt tính cả ngày đi muộn`), head, ...rows], header: 3, textCols: [1], widths: [6, 16, 28, ...days.map(() => 7), 9, 9, 9, 9] };
}

/**
 * (e) Bảng điểm theo bố cục gần với Google Classroom / Sheets: Họ và tên, Email, rồi mỗi đề một cột điểm,
 * dòng thứ hai ghi điểm tối đa. Lưu ý: Classroom KHÔNG có chức năng nhập điểm từ tệp — bảng này để thầy cô lưu,
 * mở bằng Google Sheets, hoặc đối chiếu khi nhập tay. Đẩy điểm tự động dùng thẻ Google Classroom (API).
 */
export function classroomGradeRows(d: BridgeData, examIds: string[]): XCell[][] {
  const exams = examIds.map((id) => d.reports[id]).filter((r): r is ExamReport => !!r);
  const head: XCell[] = ['Mã học sinh', 'Họ và tên', 'Email Google', ...exams.map((r) => r.exam.title), 'Bài viết (TB)'];
  const max: XCell[] = [null, 'Điểm tối đa', null, ...exams.map(() => 10), 10];
  const rows: XCell[][] = d.students.map((s) => [code(s), s.name, d.googleEmails?.[s.id] ?? '',
    ...exams.map((r) => { const a = r.students.find((x) => x.student.id === s.id)?.attempt; return a?.status === 'submitted' ? a.score10 ?? null : null; }),
    workAverage(d.works, s.id).avg]);
  return [head, max, ...rows];
}
export function classroomGradeSheet(d: BridgeData, examIds: string[]): XSheetSpec {
  return { name: 'Điểm (Classroom)', rows: classroomGradeRows(d, examIds), header: 0, textCols: [0], freeze: true };
}
