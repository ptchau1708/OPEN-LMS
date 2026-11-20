/**
 * ĐƯỜNG NỐI VNEDU — chỗ cắm cho kết nối trực tiếp sau này.
 *
 * Hiện trạng (11/2026): trường chỉ có tài khoản web VnEdu thông thường, VNPT chưa cấp cổng kết nối (API) → không thể
 * đồng bộ tự động. `ExcelVnEduConnector` làm cầu nối bằng tệp Excel: GV tải mẫu từ VnEdu, OPEN-EDU đọc / điền, GV tải
 * tệp đã điền lên VnEdu.
 *
 * TODO(ApiVnEduConnector): khi trường có tài liệu API + khóa truy cập của VNPT, viết lớp `ApiVnEduConnector`
 * cài đặt đúng interface `VnEduConnector` dưới đây (gọi qua một Edge Function để giấu khóa, KHÔNG gọi thẳng từ
 * trình duyệt), rồi đổi `getVnEduConnector()` trả về lớp đó. Giao diện trang "Xuất / nhập dữ liệu" chỉ dùng interface
 * này nên không phải sửa. Cần từ VNPT: địa chỉ API, cách xác thực, mã trường / mã lớp, định dạng danh sách HS,
 * định dạng nhập điểm và nhận xét TT27, giới hạn số lần gọi. KHÔNG viết lời gọi API giả ở đây.
 */
import { detectWorkbook, type DetectedTable } from './detect';
import type { BridgeData } from './fields';
import { matchRows, type MatchStudent, type RowMatch } from './match';
import { buildFillPlan, fillTemplate, type ColumnMapping, type FillResult } from './template';
import { readXlsx, type XWorkbook } from './xlsx';

export interface VnEduRosterEntry {
  /** Mã học sinh / mã định danh trên VnEdu. */
  code: string;
  name: string;
  /** dd/mm/yyyy nếu mẫu có. */
  dob?: string;
  className?: string;
}

/** Nguồn / đích của một lần trao đổi: với cầu nối Excel là tệp GV tải lên; với API sau này là mã lớp trên VnEdu. */
export interface VnEduTarget {
  /** Tệp mẫu tải từ VnEdu (bắt buộc với ExcelVnEduConnector). */
  file?: Uint8Array;
  /** Dành cho ApiVnEduConnector. */
  classCode?: string;
}

export interface VnEduPushResult {
  /** Tệp đã điền để GV tải lên VnEdu (cầu nối Excel). API sau này: không có tệp. */
  file?: FillResult;
  filled: number;
  /** Dòng chưa ghép được với học sinh OPEN-EDU. */
  unmatched: number;
}

export interface VnEduConnector {
  readonly kind: 'excel' | 'api';
  /** Có kết nối trực tiếp không (false = qua tệp). */
  readonly direct: boolean;
  /** Lấy danh sách lớp từ VnEdu. */
  pullRoster(target: VnEduTarget): Promise<VnEduRosterEntry[]>;
  /** Đưa điểm sang VnEdu. */
  pushMarks(target: VnEduTarget, data: BridgeData, mapping: ColumnMapping): Promise<VnEduPushResult>;
  /** Đưa nhận xét TT27 sang VnEdu. */
  pushComments(target: VnEduTarget, data: BridgeData, mapping: ColumnMapping): Promise<VnEduPushResult>;
}

export interface OpenedTemplate { wb: XWorkbook; sheetIndex: number; table: DetectedTable }

/** Mở tệp mẫu và tìm bảng học sinh. */
export function openTemplate(file: Uint8Array): OpenedTemplate {
  const wb = readXlsx(file);
  const hit = detectWorkbook(wb.sheets);
  if (!hit) throw new Error('Không thấy cột "Họ và tên" trong tệp. Thầy cô kiểm tra lại có đúng tệp danh sách / sổ điểm không nhé.');
  return { wb, sheetIndex: hit.sheetIndex, table: hit.table };
}

export function toMatchStudents(d: Pick<BridgeData, 'students' | 'cls'>): MatchStudent[] {
  return d.students.map((s) => ({ id: s.id, name: s.name, externalCode: s.externalCode, username: s.username, className: d.cls.name }));
}

export class ExcelVnEduConnector implements VnEduConnector {
  readonly kind = 'excel' as const;
  readonly direct = false;

  async pullRoster(target: VnEduTarget): Promise<VnEduRosterEntry[]> {
    if (!target.file) throw new Error('Cần tệp danh sách lớp tải từ VnEdu.');
    const { table } = openTemplate(target.file);
    return table.students.map((s) => ({ code: s.code, name: s.name, ...(s.dob ? { dob: s.dob } : {}), ...(s.className ? { className: s.className } : {}) }));
  }

  /** Điền theo cách ghép cột; `matches` cho phép GV đã sửa tay việc ghép dòng. */
  fill(file: Uint8Array, data: BridgeData, mapping: ColumnMapping, opts: { matches?: RowMatch[]; overwrite?: boolean } = {}): VnEduPushResult {
    const t = openTemplate(file);
    const matches = opts.matches ?? matchRows(t.table.students, toMatchStudents(data));
    const plan = buildFillPlan(t.wb.sheets[t.sheetIndex], t.table, matches, mapping, data, { overwrite: opts.overwrite });
    return { file: fillTemplate(file, t.wb, t.sheetIndex, t.table, plan), filled: plan.filled, unmatched: matches.filter((m) => !m.studentId).length };
  }

  async pushMarks(target: VnEduTarget, data: BridgeData, mapping: ColumnMapping): Promise<VnEduPushResult> {
    if (!target.file) throw new Error('Cần tệp sổ điểm tải từ VnEdu.');
    return this.fill(target.file, data, mapping);
  }

  async pushComments(target: VnEduTarget, data: BridgeData, mapping: ColumnMapping): Promise<VnEduPushResult> {
    if (!target.file) throw new Error('Cần tệp nhận xét tải từ VnEdu.');
    return this.fill(target.file, data, mapping);
  }
}

/** Bộ nối VnEdu đang dùng. Hiện chỉ có cầu nối Excel (xem TODO ở đầu tệp). */
export function getVnEduConnector(): VnEduConnector & { fill: ExcelVnEduConnector['fill'] } {
  return new ExcelVnEduConnector();
}
