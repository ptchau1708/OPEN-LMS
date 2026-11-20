import { useState } from 'react';
import { TT27_TERM_LABEL } from '@openedu/contracts';
import { bridge, csvFileName, downloadText, toCsv } from '@openedu/data';
import { Btn } from '../../components/common';
import type { BridgeData } from './shared';

function save(title: string, sheets: bridge.XSheetSpec[]) {
  bridge.downloadBytes(csvFileName(title, 'xlsx'), bridge.writeXlsx(sheets));
}

/** Các bảng Excel dựng sẵn: cột đầu luôn là STT, Mã học sinh, Họ và tên. */
export function QuickExport({ data, only }: { data: BridgeData; only?: 'classroom' }) {
  const published = data.exams.filter((e) => e.status === 'published' && data.reports[e.id]);
  const [examId, setExamId] = useState(published[0]?.id ?? '');
  const report = data.reports[examId];
  const cls = data.cls.name;
  const month = `${data.month.slice(5)}-${data.month.slice(0, 4)}`;
  const noCodes = data.students.filter((s) => !s.externalCode).length;

  if (only === 'classroom') {
    const ids = published.map((e) => e.id);
    return (
      <div className="tc-row tc-wrap">
        <Btn icon="upload" data-testid="br-x-gc-xlsx" onClick={() => save(`Diem Classroom ${cls}`, [bridge.classroomGradeSheet(data, ids)])}>Tải bảng điểm (.xlsx)</Btn>
        <Btn icon="upload" data-testid="br-x-gc-csv" onClick={() => downloadText(csvFileName(`Diem Classroom ${cls}`), toCsv(bridge.classroomGradeRows(data, ids).map((r) => r.map((v) => (v instanceof Date || typeof v === 'boolean' ? String(v) : v)))))}>Tải bảng điểm (.csv)</Btn>
      </div>
    );
  }

  return (
    <section className="tc-card br-step">
      <header className="tc-card__head"><h2>Xuất nhanh ra Excel</h2><span className="tc-small tc-muted">Mỗi tệp là .xlsx thật, mở được bằng Excel, Google Sheets, LibreOffice</span></header>
      {noCodes ? <div className="tc-alert tc-alert--info"><span>{noCodes}/{data.students.length} em chưa có mã học sinh VnEdu — cột “Mã học sinh” sẽ trống với các em đó. Thêm mã ở thẻ “Mã học sinh” hoặc “Nhập danh sách”.</span></div> : null}
      <ul className="br-exports">
        <li>
          <div><strong>Danh sách lớp {cls}</strong><span className="tc-small tc-muted">Mã, họ tên, tên đăng nhập, email Google (nếu có)</span></div>
          <Btn icon="upload" data-testid="br-x-list" onClick={() => save(`Danh sach lop ${cls}`, [bridge.classListSheet(data)])}>Tải .xlsx</Btn>
        </li>
        <li>
          <div>
            <strong>Bảng điểm một đề kiểm tra</strong>
            {published.length ? (
              <select className="tc-input tc-input--sm" aria-label="Chọn đề kiểm tra" value={examId} onChange={(e) => setExamId(e.target.value)}>
                {published.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            ) : <span className="tc-small tc-muted">Lớp chưa có đề nào đã phát hành</span>}
          </div>
          <Btn icon="upload" data-testid="br-x-exam" disabled={!report} onClick={() => report && save(`Bang diem ${report.exam.title} ${cls}`, [bridge.examScoreSheet(data, report)])}>Tải .xlsx</Btn>
        </li>
        <li>
          <div><strong>Tổng hợp TT27 — {TT27_TERM_LABEL[data.termId]}</strong><span className="tc-small tc-muted">Mức đạt, điểm KTĐK, nhận xét từng môn; năng lực; phẩm chất; nhận xét chung · {data.tt27.length}/{data.students.length} em đã có đánh giá</span></div>
          <Btn icon="upload" data-testid="br-x-tt27" onClick={() => save(`TT27 ${data.termId} ${cls}`, [bridge.tt27Sheet(data)])}>Tải .xlsx</Btn>
        </li>
        <li>
          <div><strong>Chuyên cần tháng {month.replace('-', '/')}</strong><span className="tc-small tc-muted">{data.attendance.length} ngày đã điểm danh; tổng có mặt, muộn, vắng có phép / không phép</span></div>
          <Btn icon="upload" data-testid="br-x-att" onClick={() => save(`Chuyen can ${month} ${cls}`, [bridge.attendanceSheet(data)])}>Tải .xlsx</Btn>
        </li>
        <li>
          <div><strong>Tất cả trong một tệp</strong><span className="tc-small tc-muted">Mỗi bảng một trang tính</span></div>
          <Btn kind="primary" icon="upload" data-testid="br-x-all" onClick={() => save(`OPEN-EDU ${cls} ${data.termId}`, [bridge.classListSheet(data), ...(report ? [bridge.examScoreSheet(data, report)] : []), bridge.tt27Sheet(data), bridge.attendanceSheet(data)])}>Tải .xlsx</Btn>
        </li>
      </ul>
    </section>
  );
}
