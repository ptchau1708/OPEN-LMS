/** Xuất Excel báo cáo bài giao (docs/BAO_CAO_BAI_GIAO.md). Nằm trong gói export để không vào gói tải đầu của app. */
import type { Assignment } from '@openedu/contracts';
import type { AssignmentReport, StudentResult } from '../assignReport';
import { writeXlsx, type XCell, type XSheetSpec } from './xlsx';

const VN = 7 * 3_600_000;
const fmt = (t: number) => { const x = new Date(t + VN); return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`; };
/* ------------------------------ xuất Excel ------------------------------ */
const STATUS_LABEL: Record<StudentResult['status'], string> = { 'chua-lam': 'Chưa làm', 'dang-lam': 'Đang làm', 'hoan-thanh': 'Hoàn thành' };
const dt = (iso?: string) => (iso ? `${fmt(Date.parse(iso))} ${new Date(Date.parse(iso) + VN).toISOString().slice(11, 16)}` : '');
const roundName = (a: Assignment) => `${a.title}${(a.round ?? 1) > 1 ? ` (lượt ${a.round})` : ''}`;

/**
 * Tệp Excel báo cáo một đợt: Tổng hợp (mỗi lần giao một dòng), Điểm theo học sinh (bảng HS × lần giao),
 * Chi tiết (mỗi HS × lần giao một dòng), Câu hỏi (tỉ lệ đúng từng câu).
 */
export function reportXlsx(input: { title: string; className: string; reports: AssignmentReport[]; itemLabel?: (itemId: string) => string }): Uint8Array {
  const { reports } = input;
  const head = (cols: string[]): XCell[][] => [[`${input.title} — Lớp ${input.className}`], cols];
  const sum: XSheetSpec = {
    name: 'Tổng hợp', header: 1,
    rows: [...head(['Bài giao', 'Ngày mở', 'Hạn nộp', 'Quá hạn', 'Số em', 'Đã làm', 'Hoàn thành', 'Nộp muộn', 'Quá hạn chưa xong', 'Điểm TB (%)']),
      ...reports.map((r) => [roundName(r.assignment), dt(r.assignment.openAt), dt(r.assignment.dueAt), r.assignment.latePolicy === 'lock' ? 'Khóa bài' : 'Cho nộp muộn', r.summary.assigned, r.summary.started, r.summary.completed, r.summary.late, r.summary.overdue, r.summary.avgPercent ?? ''] as XCell[])],
  };
  const studentIds: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const r of reports) for (const s of r.students) if (!seen.has(s.studentId)) { seen.add(s.studentId); studentIds.push({ id: s.studentId, name: s.name }); }
  studentIds.sort((x, y) => x.name.localeCompare(y.name, 'vi'));
  const grid: XSheetSpec = {
    name: 'Điểm theo học sinh', header: 1,
    rows: [...head(['STT', 'Học sinh', ...reports.map((r) => roundName(r.assignment)), 'Trung bình (%)']),
      ...studentIds.map((s, i) => {
        const vals = reports.map((r) => r.students.find((x) => x.studentId === s.id));
        const nums = vals.map((v) => v?.percent).filter((v): v is number => typeof v === 'number');
        return [i + 1, s.name, ...vals.map((v) => (v ? (v.percent ?? (v.overdue ? 'Quá hạn' : '')) : '—')), nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : ''] as XCell[];
      })],
  };
  const detail: XSheetSpec = {
    name: 'Chi tiết', header: 1,
    rows: [...head(['Bài giao', 'Học sinh', 'Trạng thái', 'Đã trả lời', 'Tổng câu', 'Điểm (%)', 'Đúng ngay lần đầu', 'Bắt đầu', 'Xong lúc', 'Nộp muộn', 'Số phút']),
      ...reports.flatMap((r) => r.students.map((s) => [roundName(r.assignment), s.name, s.overdue ? 'Quá hạn chưa xong' : STATUS_LABEL[s.status], s.answered, s.total, s.percent ?? '', s.firstTry, dt(s.startedAt), dt(s.finishedAt), s.late ? 'Muộn' : '', s.minutes ?? ''] as XCell[]))],
  };
  const qs: XSheetSpec = {
    name: 'Câu hỏi', header: 1,
    rows: [...head(['Bài giao', 'Câu', 'Nội dung', 'Số em trả lời', 'Số em đúng', 'Tỉ lệ đúng (%)']),
      ...reports.flatMap((r) => r.questions.map((q) => [roundName(r.assignment), q.index + 1, input.itemLabel?.(q.itemId) ?? q.itemId, q.answered, q.correct, q.percent ?? ''] as XCell[]))],
  };
  return writeXlsx([sum, grid, detail, qs]);
}
