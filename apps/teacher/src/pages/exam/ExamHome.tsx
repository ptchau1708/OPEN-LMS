import { useNavigate } from 'react-router';
import { SUBJECTS, TT27_TERM_LABEL, type Profile } from '@openedu/contracts';
import { matrixTotals, useClasses, useExamMatrices, useExams } from '@openedu/data';
import { Btn, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { fmtDateTime } from '../../lib/format';
import { ExamTabs, fmtPoints } from './shared';
import { ShareClassroomButton } from '../bridge/ShareClassroom';

export default function ExamHome({ user }: { user: Profile }) {
  const nav = useNavigate();
  const mq = useExamMatrices();
  const eq = useExams();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const className = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? id;
  const now = Date.now();
  return (
    <div className="tc-page ex-page">
      <PageHead title="Đề kiểm tra" sub="Ma trận đề theo 3 mức (TT27), ra đề A/B từ ngân hàng câu hỏi, làm bài trực tuyến hoặc in giấy."
        actions={<Btn kind="primary" icon="plus" onClick={() => nav('/de-kiem-tra/ma-tran/moi')}>Ma trận mới</Btn>} />
      <ExamTabs />
      <section className="tc-card">
        <div className="tc-card__head"><h2 className="ex-h2">Ma trận đề</h2></div>
        {mq.isLoading ? <Loading /> : mq.error ? <ErrorNote error={mq.error} onRetry={() => void mq.refetch()} /> : !mq.data?.length ? (
          <Empty icon="map" title="Chưa có ma trận">Tạo ma trận: chọn mạch kiến thức, số câu mỗi mức và điểm.</Empty>
        ) : (
          <div className="ex-cards">
            {mq.data.map((m) => {
              const tt = matrixTotals(m);
              return (
                <article key={m.id} className="ex-mcard">
                  <h3>{m.title}</h3>
                  <p className="tc-muted tc-small">{SUBJECTS[m.subject]?.name ?? m.subject} lớp {m.grade}{m.termId ? ` · ${TT27_TERM_LABEL[m.termId]}` : ''} · {m.durationMin} phút</p>
                  <div className="ex-mcard__nums">
                    <span><b>{tt.questions}</b> câu</span><span><b>{tt.tn}</b> TN · <b>{tt.tl}</b> TL</span><span><b>{fmtPoints(tt.points)}</b> điểm</span>
                  </div>
                  <div className="ex-lvbar" aria-label="Tỉ lệ điểm theo mức">
                    {([1, 2, 3] as const).map((l) => <i key={l} className={`ex-lvbar--${l}`} style={{ flexGrow: tt.byLevel[l].points || 0.0001 }} title={`Mức ${l}: ${fmtPoints(tt.byLevel[l].points)} điểm`} />)}
                  </div>
                  <div className="tc-row ex-mcard__act">
                    <Btn size="sm" icon="pencil" onClick={() => nav(`/de-kiem-tra/ma-tran/${m.id}`)}>Sửa</Btn>
                    <Btn size="sm" kind="primary" icon="play" onClick={() => nav(`/de-kiem-tra/ra-de?maTran=${encodeURIComponent(m.id)}`)}>Ra đề</Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="tc-card tc-card--flush">
        <div className="tc-card__head ex-pad"><h2 className="ex-h2">Đề đã ra</h2></div>
        {eq.isLoading ? <Loading /> : eq.error ? <ErrorNote error={eq.error} /> : !eq.data?.length ? <Empty title="Chưa có đề nào">Bấm “Ra đề” ở một ma trận.</Empty> : (
          <div className="tc-tablewrap">
            <table className="tc-table">
              <thead><tr><th>Đề</th><th>Lớp</th><th>Thời gian mở</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {eq.data.map((e) => {
                  const state = e.status === 'draft' ? 'Nháp' : now < Date.parse(e.openAt) ? 'Sắp mở' : now < Date.parse(e.closeAt) ? 'Đang mở' : 'Đã đóng';
                  return (
                    <tr key={e.id}>
                      <td><b>{e.title}</b><div className="tc-muted tc-small">{e.paper.A.filter((s) => s.itemId).length} câu · {e.durationMin} phút{e.onlineVariants === 'AB' ? ' · đề A/B' : ''}</div></td>
                      <td>{className(e.classId)}</td>
                      <td className="tc-small">{fmtDateTime(e.openAt)} → {fmtDateTime(e.closeAt)}</td>
                      <td><span className={`tc-chip ${state === 'Đang mở' ? 'tc-chip--ok' : state === 'Nháp' ? 'tc-chip--warn' : ''}`}>{state}</span>{e.resultsPolicy === 'after-release' ? <span className="tc-chip ex-ml">{e.releasedAt ? 'Đã công bố' : 'Chờ công bố'}</span> : null}</td>
                      <td className="ex-right">
                        <span className="tc-row ex-endrow">
                          <Btn size="sm" onClick={() => nav(`/de-kiem-tra/${e.id}/in`)}>Bản in</Btn>
                          <Btn size="sm" onClick={() => nav(`/de-kiem-tra/${e.id}/sua`)}>Soạn</Btn>
                          {e.status === 'published' ? <ShareClassroomButton kind="exam" id={e.id} title={e.title} compact /> : null}
                          <Btn size="sm" kind="primary" onClick={() => nav(`/de-kiem-tra/${e.id}/ket-qua`)}>Kết quả</Btn>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
