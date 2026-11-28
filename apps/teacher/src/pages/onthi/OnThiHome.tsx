/**
 * Ôn thi (app GV): bài luyện cho CẢ KHỐI theo dạng câu của sân chơi Trạng Nguyên / Đấu trường VioEdu (docs/ON_THI.md).
 * Tạo bài từ tệp Word theo mẫu (mỗi tệp một bài), xem danh sách, mở kết quả.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ONTHI_STYLES, SUBJECTS, type Grade, type OnThiStyle, type Profile } from '@openedu/contracts';
import { useDeleteOnThiSet, useOnThiSets } from '@openedu/data';
import { Btn, ConfirmBar, Empty, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { GRADES, useFocusGrade } from '../../lib/focusGrade';
import { downloadBytes, loadImportLib } from '../itembank/lib';
import { WordImportDialog } from './WordImport';
import './onthi.css';

export const STYLE_LABEL: Record<OnThiStyle, string> = { tn: 'Trạng Nguyên', vio: 'Đấu trường VIOEDU' };
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export async function downloadOnThiTemplate(style: OnThiStyle): Promise<void> {
  const lib = await loadImportLib();
  downloadBytes(lib.buildOnThiTemplateDocx(style), style === 'tn' ? 'mau-on-thi-trang-nguyen.docx' : 'mau-on-thi-vioedu.docx', lib.DOCX_MIME);
}

export default function OnThiHome({ user }: { user: Profile }) {
  const nav = useNavigate();
  const focus = useFocusGrade().grade;
  const [style, setStyle] = useState<OnThiStyle>('tn');
  const [grade, setGrade] = useState<Grade>(focus);
  const [importing, setImporting] = useState(false);
  const [askDel, setAskDel] = useState<string | null>(null);
  const q = useOnThiSets({ style, grade });
  const del = useDeleteOnThiSet();
  const list = q.data ?? [];
  return (
    <div className="tc-page ot-page">
      <PageHead
        title="Ôn thi"
        sub="Bài luyện cho cả khối với các dạng câu giống sân chơi Trạng Nguyên và Đấu trường VioEdu. Học sinh làm ở mục Ôn thi trong app học sinh."
        actions={<>
          <Btn icon="upload" onClick={() => void downloadOnThiTemplate(style)} data-testid="ot-template">Tải tệp Word mẫu</Btn>
          <Btn kind="primary" icon="plus" onClick={() => setImporting(true)} data-testid="ot-import-open">Tạo bài từ tệp Word</Btn>
        </>}
      />
      <div className="ot-filters">
        <Seg label="Kiểu bài luyện" value={style} onChange={setStyle} options={[{ value: 'tn', label: 'Ôn thi Trạng Nguyên' }, { value: 'vio', label: 'Ôn thi Đấu trường VIOEDU' }]} />
        <Seg label="Khối" value={grade} onChange={(g) => setGrade(g as Grade)} options={GRADES.map((g) => ({ value: g, label: `Khối ${g}` }))} />
      </div>
      <p className="tc-muted tc-small ot-rule">
        {style === 'tn'
          ? `Kiểu Trạng Nguyên: mỗi câu ${ONTHI_STYLES.tn.points} điểm, câu nhiều ý phải đúng hết mới được điểm; học sinh nhảy câu bằng bảng câu; mức đạt mặc định 80% (30 câu: 240/300).`
          : `Kiểu VioEdu: mỗi câu ${ONTHI_STYLES.vio.points} điểm, sai không trừ; mỗi lần một câu, có nút Bỏ qua và thanh nhịp; câu Đúng – Sai nhiều ý tính điểm lũy tiến.`}
      </p>
      <section className="tc-card tc-card--flush">
        <ErrorNote error={del.error} />
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : !list.length ? (
          <Empty icon="scroll" title={`Khối ${grade} chưa có bài luyện ${STYLE_LABEL[style]}`}>
            <ol className="ot-steps">
              <li>Bấm <b>Tải tệp Word mẫu</b>, soạn câu theo đúng cách viết trong mẫu (mỗi tệp là một bài luyện).</li>
              <li>Bấm <b>Tạo bài từ tệp Word</b>, chọn tệp, soát câu rồi bấm Tạo bài luyện.</li>
              <li>Học sinh khối {grade} thấy bài ở mục <b>Ôn thi</b> trong app.</li>
            </ol>
          </Empty>
        ) : (
          <div className="tc-tablewrap">
            <table className="tc-table" data-testid="ot-sets">
              <thead><tr><th>#</th><th>Bài luyện</th><th>Câu · thời gian</th><th>Mức đạt</th><th>Đã làm</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {list.map((s, i) => {
                  const mine = s.createdBy === user.id || user.role === 'admin' || !s.createdBy;
                  return (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td><b>{s.title}</b><div className="tc-muted tc-small">{SUBJECTS[s.subject]?.name ?? s.subject}{s.createdByName ? ` · ${s.createdByName}` : ''}</div></td>
                      <td className="tc-small">{s.itemIds.length} câu · {s.minutes} phút · {fmt(s.points)} điểm/câu</td>
                      <td className="tc-small">{fmt(s.passScore)}/{fmt(s.itemIds.length * s.points)}</td>
                      <td>{s.done ?? '—'}</td>
                      <td>
                        <span className={`tc-chip ${s.status === 'published' ? 'tc-chip--ok' : 'tc-chip--warn'}`}>{s.status === 'published' ? 'Đang mở' : 'Nháp'}</span>
                        {s.lockOrder ? <span className="tc-chip ot-ml" title="Phải đạt bài trước mới mở">Khóa thứ tự</span> : null}
                        {!s.showBoard ? <span className="tc-chip ot-ml">Ẩn xếp hạng</span> : null}
                      </td>
                      <td className="ot-right">
                        <span className="tc-row ot-endrow">
                          <Btn size="sm" kind="primary" onClick={() => nav(`/on-thi/${s.id}`)}>Kết quả</Btn>
                          {mine ? <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá bài ${s.title}`} title="Xoá bài" onClick={() => setAskDel(s.id)} /> : null}
                        </span>
                        {askDel === s.id ? <ConfirmBar text={`Xoá bài “${s.title}”? Bài làm của học sinh cũng bị xoá. Câu hỏi vẫn còn trong ngân hàng.`} busy={del.isPending} onCancel={() => setAskDel(null)} onConfirm={() => del.mutate(s.id, { onSuccess: () => setAskDel(null) })} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <WordImportDialog open={importing} onClose={() => setImporting(false)} style={style} grade={grade} nextPosition={list.length + 1}
        onCreated={(id) => { setImporting(false); nav(`/on-thi/${id}`); }} />
    </div>
  );
}
