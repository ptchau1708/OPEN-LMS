/**
 * Nhập thông tin bổ sung cho nhiều học sinh từ Excel: tệp mẫu (có sẵn danh sách lớp) + đọc / ghép học sinh.
 * Dòng tiêu đề có cột "Họ và tên" (bắt buộc), có thể thêm "Tên đăng nhập", "Mã HS", "STT".
 * Cột "Ghi chú" / "Nội dung" / "Nhận xét" → nội dung; mọi cột khác → dữ liệu (nhãn cột: giá trị).
 */
import type { Profile } from '@openedu/contracts';
import { writeXlsx } from '../import/xlsx';
import { foldVietnamese } from '../text';

const f = (s: string) => foldVietnamese(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const IS_NAME = /^(ho (va )?ten|ho ten hoc sinh|ten hoc sinh|hoc sinh|ho va ten hoc sinh)$/;
const IS_USER = /^(ten dang nhap|tai khoan|username|ten tai khoan)$/;
const IS_CODE = /^(ma hs|ma hoc sinh|ma dinh danh|ma so hoc sinh|ma)$/;
const IS_STT = /^(stt|tt|so thu tu)$/;
const IS_BODY = /^(ghi chu|noi dung|nhan xet|mo ta)$/;

export interface NotesSheetRow {
  rowNo: number;
  name: string;
  student?: Profile;
  /** Lí do chưa ghép được: không tìm thấy, trùng tên. */
  problem?: string;
  fields: Record<string, string>;
  body: string;
}
export interface NotesSheet {
  dataColumns: string[];
  bodyColumn?: string;
  rows: NotesSheetRow[];
}

export function parseNotesSheet(rows: string[][], students: readonly Profile[]): NotesSheet {
  const headIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => IS_NAME.test(f(c))));
  if (headIdx < 0) throw new Error('Không thấy cột "Họ và tên" ở dòng tiêu đề. Thầy/cô dùng tệp mẫu nhé.');
  const head = rows[headIdx]!.map((c) => c.trim());
  const col = (re: RegExp) => head.findIndex((c) => re.test(f(c)));
  const cName = col(IS_NAME), cUser = col(IS_USER), cCode = col(IS_CODE), cStt = col(IS_STT), cBody = col(IS_BODY);
  const dataIdx = head.map((h, i) => ({ h, i })).filter(({ h, i }) => h && ![cName, cUser, cCode, cStt, cBody].includes(i));
  const byUser = new Map(students.filter((s) => s.username).map((s) => [s.username!.toLowerCase(), s]));
  const byCode = new Map(students.filter((s) => s.externalCode).map((s) => [s.externalCode!.trim().toLowerCase(), s]));
  const byName = new Map<string, Profile[]>();
  for (const s of students) { const k = f(s.name); byName.set(k, [...(byName.get(k) ?? []), s]); }

  const out: NotesSheetRow[] = [];
  rows.slice(headIdx + 1).forEach((r, k) => {
    const name = (r[cName] ?? '').trim();
    const user = cUser >= 0 ? (r[cUser] ?? '').trim().toLowerCase() : '';
    const code = cCode >= 0 ? (r[cCode] ?? '').trim().toLowerCase() : '';
    const fields: Record<string, string> = {};
    for (const { h, i } of dataIdx) { const v = (r[i] ?? '').trim(); if (v) fields[h] = v; }
    const body = cBody >= 0 ? (r[cBody] ?? '').trim() : '';
    if (!name && !user && !code) return;
    if (!body && !Object.keys(fields).length) return; // dòng chưa nhập dữ liệu
    let student = (user && byUser.get(user)) || (code && byCode.get(code)) || undefined;
    let problem: string | undefined;
    if (!student) {
      const same = byName.get(f(name)) ?? [];
      if (same.length === 1) student = same[0];
      else problem = same.length > 1 ? 'Trùng tên — thêm cột Tên đăng nhập hoặc Mã HS' : 'Không tìm thấy học sinh này trong lớp';
    }
    out.push({ rowNo: headIdx + k + 2, name: name || user || code, ...(student ? { student } : {}), ...(problem ? { problem } : {}), fields, body });
  });
  return { dataColumns: dataIdx.map((d) => d.h), ...(cBody >= 0 ? { bodyColumn: head[cBody] } : {}), rows: out };
}

/** Tệp mẫu: danh sách lớp + vài cột ví dụ (thầy/cô đổi tên / thêm / bớt cột tuỳ ý). */
export function buildNotesTemplate(students: readonly Profile[], className: string): Uint8Array {
  const head = ['STT', 'Họ và tên', 'Tên đăng nhập', 'Mã HS', 'Chiều cao (cm)', 'Cân nặng (kg)', 'Ghi chú'];
  const rows: (string | number)[][] = [head, ...[...students].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((s, i) => [i + 1, s.name, s.username ?? '', s.externalCode ?? '', '', '', ''])];
  const guide: string[][] = [
    ['HƯỚNG DẪN NHẬP THÔNG TIN BỔ SUNG — LỚP ' + className],
    ['1. Giữ các cột Họ và tên, Tên đăng nhập, Mã HS để OPEN-EDU nhận đúng học sinh (ưu tiên Tên đăng nhập, rồi Mã HS, rồi Họ và tên).'],
    ['2. Các cột còn lại là dữ liệu: đổi tên cột, thêm hoặc xoá cột tuỳ ý (vd Thị lực, Nhóm máu, Điểm thi Violympic, Sở thích…).'],
    ['3. Cột "Ghi chú" (hoặc "Nội dung", "Nhận xét") được lưu thành nội dung của ghi chép.'],
    ['4. Dòng để trống dữ liệu sẽ được bỏ qua. Mỗi học sinh có dữ liệu → một ghi chép trong hồ sơ.'],
    ['5. Khi nhập, thầy/cô đặt tiêu đề (vd "Khám sức khoẻ đầu năm"), nhóm, ngày và chọn có cho phụ huynh xem hay không.'],
  ];
  return writeXlsx([
    { name: 'Thông tin bổ sung', rows, widths: [6, 28, 18, 14, 16, 16, 40] },
    { name: 'Hướng dẫn', rows: guide, widths: [120], headerRows: 1 },
  ]);
}
