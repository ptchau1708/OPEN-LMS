/**
 * Các "trường dữ liệu" OPEN-EDU có thể điền vào cột của tệp Excel (điểm đề kiểm tra, điểm bài viết, TT27, chuyên cần…)
 * và cách tính giá trị cho từng học sinh từ dữ liệu đã tải (BridgeData). Thuần, có kiểm thử.
 */
import {
  SUBJECTS,
  TT27_COMPETENCY_LABEL,
  TT27_QUALITY_LABEL,
  TT27_TERM_LABEL,
  type AttendanceRecord,
  type ClassInfo,
  type DataSource,
  type Exam,
  type ExamReport,
  type Profile,
  type SubjectId,
  type SubmissionDetail,
  type Tt27Competency,
  type Tt27Evaluation,
  type Tt27Quality,
  type Tt27TermId,
} from '@openedu/contracts';
import { getExamService } from '../exam/service';

export interface BridgeData {
  cls: ClassInfo;
  students: Profile[];
  termId: Tt27TermId;
  schoolYear: string;
  /** Tháng chuyên cần YYYY-MM. */
  month: string;
  tt27: Tt27Evaluation[];
  exams: Exam[];
  /** Báo cáo theo examId (chỉ đề đã phát hành). */
  reports: Record<string, ExamReport>;
  /** Bài viết đã duyệt của lớp. */
  works: SubmissionDetail[];
  attendance: AttendanceRecord[];
  /** Email Google theo studentId (nếu đã nhập từ Classroom). */
  googleEmails?: Record<string, string>;
}

export interface BridgeField {
  id: string;
  label: string;
  group: 'Học sinh' | 'Đề kiểm tra' | 'Bài viết' | 'TT27 — môn học' | 'TT27 — năng lực' | 'TT27 — phẩm chất' | 'TT27 — chung' | 'Chuyên cần';
}

export type FieldValue = string | number | null;

const QUALITIES = Object.keys(TT27_QUALITY_LABEL) as Tt27Quality[];
const COMPETENCIES = Object.keys(TT27_COMPETENCY_LABEL) as Tt27Competency[];

/** Môn có trong TT27 của lớp (đã có đánh giá) + Toán, Tiếng Việt luôn có. */
export function bridgeSubjects(d: Pick<BridgeData, 'tt27' | 'exams'>): SubjectId[] {
  const set = new Set<SubjectId>(['toan', 'tieng-viet']);
  for (const e of d.tt27) for (const s of Object.keys(e.subjects) as SubjectId[]) set.add(s);
  return (Object.keys(SUBJECTS) as SubjectId[]).filter((s) => set.has(s));
}

/** Danh mục trường có thể điền, theo dữ liệu thật của lớp. */
export function bridgeFields(d: BridgeData): BridgeField[] {
  const out: BridgeField[] = [
    { id: 'code', label: 'Mã học sinh (VnEdu)', group: 'Học sinh' },
    { id: 'username', label: 'Tên đăng nhập OPEN-EDU', group: 'Học sinh' },
    { id: 'name', label: 'Họ và tên (trong OPEN-EDU)', group: 'Học sinh' },
  ];
  for (const e of d.exams) {
    if (e.status !== 'published') continue;
    out.push({ id: `exam:${e.id}`, label: `Điểm đề “${e.title}” (thang 10)`, group: 'Đề kiểm tra' });
    out.push({ id: `exam-level:${e.id}`, label: `Mức đạt theo đề “${e.title}” (T/H/C)`, group: 'Đề kiểm tra' });
  }
  out.push({ id: 'work-avg', label: 'Điểm trung bình bài viết đã duyệt (thang 10)', group: 'Bài viết' });
  out.push({ id: 'work-count', label: 'Số bài viết đã duyệt', group: 'Bài viết' });
  const term = TT27_TERM_LABEL[d.termId];
  for (const s of bridgeSubjects(d)) {
    const n = SUBJECTS[s]?.name ?? s;
    out.push({ id: `tt27-level:${s}`, label: `${n} — mức đạt (T/H/C) · ${term}`, group: 'TT27 — môn học' });
    out.push({ id: `tt27-score:${s}`, label: `${n} — điểm KTĐK · ${term}`, group: 'TT27 — môn học' });
    out.push({ id: `tt27-comment:${s}`, label: `${n} — nhận xét · ${term}`, group: 'TT27 — môn học' });
  }
  for (const c of COMPETENCIES) out.push({ id: `tt27-comp:${c}`, label: `Năng lực ${TT27_COMPETENCY_LABEL[c]} (T/Đ/C)`, group: 'TT27 — năng lực' });
  for (const q of QUALITIES) out.push({ id: `tt27-qual:${q}`, label: `Phẩm chất ${TT27_QUALITY_LABEL[q]} (T/Đ/C)`, group: 'TT27 — phẩm chất' });
  out.push({ id: 'tt27-general', label: `Nhận xét chung · ${term}`, group: 'TT27 — chung' });
  const m = `${d.month.slice(5)}/${d.month.slice(0, 4)}`;
  out.push({ id: 'att-excused', label: `Số buổi vắng có phép · tháng ${m}`, group: 'Chuyên cần' });
  out.push({ id: 'att-unexcused', label: `Số buổi vắng không phép · tháng ${m}`, group: 'Chuyên cần' });
  out.push({ id: 'att-absent', label: `Tổng số buổi vắng · tháng ${m}`, group: 'Chuyên cần' });
  out.push({ id: 'att-late', label: `Số buổi đi muộn · tháng ${m}`, group: 'Chuyên cần' });
  out.push({ id: 'att-present', label: `Số buổi có mặt · tháng ${m}`, group: 'Chuyên cần' });
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function attendanceCountsOf(records: AttendanceRecord[], studentId: string): { days: number; present: number; late: number; excused: number; unexcused: number } {
  const out = { days: records.length, present: 0, late: 0, excused: 0, unexcused: 0 };
  for (const r of records) {
    const s = r.entries[studentId] ?? 'co-mat';
    if (s === 'co-mat') out.present++;
    else if (s === 'muon') { out.late++; out.present++; }
    else if (s === 'vang-co-phep') out.excused++;
    else out.unexcused++;
  }
  return out;
}

/** Điểm trung bình (thang 10) các bài viết đã duyệt của một HS; null nếu chưa có bài. */
export function workAverage(works: SubmissionDetail[], studentId: string): { avg: number | null; count: number } {
  const mine = works.filter((w) => w.studentId === studentId && w.final && w.final.max > 0);
  if (!mine.length) return { avg: null, count: 0 };
  const sum = mine.reduce((a, w) => a + ((w.final?.total ?? 0) / (w.final?.max ?? 1)) * 10, 0);
  return { avg: round1(sum / mine.length), count: mine.length };
}

/** Giá trị một trường cho một học sinh. null = chưa có dữ liệu (ô sẽ để nguyên). */
export function fieldValue(d: BridgeData, fieldId: string, studentId: string): FieldValue {
  const st = d.students.find((s) => s.id === studentId);
  if (!st) return null;
  const [kind, arg] = fieldId.includes(':') ? [fieldId.slice(0, fieldId.indexOf(':')), fieldId.slice(fieldId.indexOf(':') + 1)] : [fieldId, ''];
  const ev = d.tt27.find((e) => e.studentId === studentId);
  switch (kind) {
    case 'code': return st.externalCode ?? null;
    case 'username': return st.username ?? null;
    case 'name': return st.name;
    case 'exam':
    case 'exam-level': {
      const row = d.reports[arg]?.students.find((s) => s.student.id === studentId);
      if (!row || row.attempt?.status !== 'submitted') return null;
      return kind === 'exam' ? row.attempt.score10 ?? null : row.level ?? null;
    }
    case 'work-avg': return workAverage(d.works, studentId).avg;
    case 'work-count': return workAverage(d.works, studentId).count;
    case 'tt27-level': return ev?.subjects[arg as SubjectId]?.level ?? null;
    case 'tt27-score': return ev?.subjects[arg as SubjectId]?.score ?? null;
    case 'tt27-comment': return ev?.subjects[arg as SubjectId]?.comment || null;
    case 'tt27-comp': return ev?.competencies[arg as Tt27Competency] ?? null;
    case 'tt27-qual': return ev?.qualities[arg as Tt27Quality] ?? null;
    case 'tt27-general': return ev?.generalComment || null;
    case 'att-excused': return d.attendance.length ? attendanceCountsOf(d.attendance, studentId).excused : null;
    case 'att-unexcused': return d.attendance.length ? attendanceCountsOf(d.attendance, studentId).unexcused : null;
    case 'att-absent': { if (!d.attendance.length) return null; const c = attendanceCountsOf(d.attendance, studentId); return c.excused + c.unexcused; }
    case 'att-late': return d.attendance.length ? attendanceCountsOf(d.attendance, studentId).late : null;
    case 'att-present': return d.attendance.length ? attendanceCountsOf(d.attendance, studentId).present : null;
    default: return null;
  }
}

/** Ngày cuối tháng YYYY-MM-DD. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Tải mọi dữ liệu cần cho cầu nối của một lớp (danh sách, TT27, đề + báo cáo, bài viết đã duyệt, điểm danh tháng). */
export async function loadBridgeData(ds: DataSource, cls: ClassInfo, opts: { termId: Tt27TermId; schoolYear: string; month: string }): Promise<BridgeData> {
  const exams = getExamService(ds);
  const [students, tt27, examList, works, attendance] = await Promise.all([
    ds.listStudents(cls.id),
    ds.listTt27({ classId: cls.id, termId: opts.termId, schoolYear: opts.schoolYear }),
    exams.listExams({ classId: cls.id }).catch(() => [] as Exam[]),
    ds.listSubmissions({ classId: cls.id, status: 'approved' }).catch(() => [] as SubmissionDetail[]),
    ds.listAttendance(cls.id, monthRange(opts.month)).catch(() => [] as AttendanceRecord[]),
  ]);
  const published = examList.filter((e) => e.status === 'published');
  const reports: Record<string, ExamReport> = {};
  await Promise.all(published.map(async (e) => {
    try { reports[e.id] = await exams.getReport(e.id); } catch { /* đề lỗi: bỏ qua, cột sẽ trống */ }
  }));
  const order = new Map(cls.studentIds.map((id, i) => [id, i]));
  const sorted = [...students].filter((s) => s.role === 'student').sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'vi'));
  return { cls, students: sorted, termId: opts.termId, schoolYear: opts.schoolYear, month: opts.month, tt27, exams: examList, reports, works, attendance };
}
