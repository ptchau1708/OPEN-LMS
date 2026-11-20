import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { EXAM_LEVEL_LABEL, EXAM_LEVELS, type ExamReportStudent } from '@openedu/contracts';
import { csvFileName, downloadText, examReportCsv, formatDuration, useAllowRetake, useExamReport, useItemsByIds, useReleaseResults } from '@openedu/data';
import { Avatar, Btn, Dialog, ErrorNote, Loading, PageHead } from '../../components/common';
import { LevelBadge } from '../../lib/assess';
import { fmtDateTime, shorten } from '../../lib/format';
import { ExamTabs, LevelTag, fmtPoints } from './shared';

const pTone = (p: number | null) => (p === null ? 'none' : p >= 0.8 ? 'hi' : p >= 0.5 ? 'mid' : 'lo');
const KIND_LABEL: Record<string, string> = { hidden: 'Rời màn hình (đổi tab / ẩn ứng dụng)', blur: 'Rời cửa sổ bài làm', 'fullscreen-exit': 'Thoát toàn màn hình', 'paste-blocked': 'Thử dán chữ (đã chặn)', 'duplicate-session': 'Bài mở ở máy/tab khác', resume: 'Mở lại bài' };

export default function ExamResults() {
  const { examId } = useParams();
  const rq = useExamReport(examId);
  const release = useReleaseResults();
  const retake = useAllowRetake();
  const [detail, setDetail] = useState<ExamReportStudent | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const r = rq.data;
  const ids = useMemo(() => r?.questions.map((q) => q.itemId) ?? [], [r]);
  const items = useItemsByIds(ids);
  if (rq.isLoading) return <div className="tc-page"><Loading /></div>;
  if (!r) return <div className="tc-page"><ErrorNote error={rq.error} onRetry={() => void rq.refetch()} /></div>;
  const e = r.exam;
  const maxBar = Math.max(1, ...r.distribution);
  const flagged = r.students.filter((s) => s.integrity?.lines.length).length;
  const needsRelease = e.resultsPolicy === 'after-release' && !e.releasedAt;
  const variants = e.onlineVariants === 'AB' ? (['A', 'B'] as const) : (['A'] as const);

  return (
    <div className="tc-page ex-page">
      <PageHead title={`Kết quả: ${e.title}`} sub={`${fmtDateTime(e.openAt)} → ${fmtDateTime(e.closeAt)} · ${e.durationMin} phút`}
        actions={<>
          <Btn icon="upload" onClick={() => downloadText(csvFileName(`ket-qua-${e.title}`), examReportCsv(r))}>Xuất CSV</Btn>
          {needsRelease ? <Btn kind="primary" icon="eye" disabled={release.isPending} onClick={() => release.mutate(e.id, { onSuccess: () => setMsg('Đã công bố. Học sinh xem được điểm ở trang Hôm nay.') })}>Công bố kết quả</Btn>
            : <span className="tc-chip tc-chip--ok">{e.resultsPolicy === 'immediate' ? 'Học sinh thấy điểm ngay khi nộp' : 'Đã công bố'}</span>}
        </>} />
      <ExamTabs exam={e} />
      {msg ? <div className="tc-alert tc-alert--ok" role="status">{msg}</div> : null}
      <div className="ex-stats">
        <div className="tc-card"><span>Đã nộp</span><b>{r.submitted}/{r.students.length}</b></div>
        <div className="tc-card"><span>Đang làm</span><b>{r.inProgress}</b></div>
        <div className="tc-card"><span>Chưa làm</span><b>{r.notStarted}</b></div>
        <div className="tc-card"><span>Điểm trung bình</span><b>{r.mean === null ? '–' : String(r.mean).replace('.', ',')}</b></div>
        <div className="tc-card"><span>Có ghi chú</span><b>{flagged}</b></div>
      </div>
      <div className="tc-grid2">
        <section className="tc-card">
          <h2 className="ex-h2">Phổ điểm</h2>
          <div className="ex-dist" role="img" aria-label={`Phổ điểm: ${r.distribution.slice(1).map((n, i) => `${i + 1} điểm: ${n} em`).join(', ')}`}>
            {r.distribution.slice(1).map((n, i) => (
              <div key={i} className="ex-dist__col">
                <span className="ex-dist__n">{n || ''}</span>
                <i style={{ height: `${(n / maxBar) * 100}%` }} className={i + 1 >= 9 ? 'is-t' : i + 1 >= 5 ? 'is-h' : 'is-c'} />
                <span className="ex-dist__x">{i + 1}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="tc-card">
          <h2 className="ex-h2">Theo ô ma trận <span className="tc-muted tc-small">(tỉ lệ điểm đạt)</span></h2>
          <table className="tc-table ex-cellmap">
            <thead><tr><th>Mạch</th>{EXAM_LEVELS.map((l) => <th key={l} className="ex-c">{EXAM_LEVEL_LABEL[l]}</th>)}</tr></thead>
            <tbody>
              {e.rows.map((row) => (
                <tr key={row.id}><td>{row.label}</td>{EXAM_LEVELS.map((l) => {
                  const c = r.cells.find((x) => x.rowId === row.id && x.level === l);
                  return <td key={l} className="ex-c">{c ? <span className={`ex-p ex-p--${pTone(c.p)}`}>{c.p === null ? '–' : `${Math.round(c.p * 100)}%`}</span> : <span className="tc-muted">·</span>}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="tc-card tc-card--flush">
        <div className="ex-pad"><h2 className="ex-h2">Học sinh</h2><p className="tc-small tc-muted">Ghi chú chỉ để thầy cô tham khảo và trò chuyện với em — hệ thống không trừ điểm.</p></div>
        <div className="tc-tablewrap">
          <table className="tc-table">
            <thead><tr><th>Học sinh</th><th>Đề</th><th>Trạng thái</th><th className="ex-c">Điểm</th><th className="ex-c">Gợi ý mức</th><th>Ghi chú</th><th /></tr></thead>
            <tbody>
              {r.students.map((s) => {
                const a = s.attempt;
                return (
                  <tr key={s.student.id}>
                    <td><span className="tc-row"><Avatar mascot={s.student.avatarMascot} color={s.student.avatarColor} size={28} />{s.student.name}</span></td>
                    <td>{a?.variant ?? ''}{a && a.attemptNo > 1 ? <span className="tc-muted tc-small"> · lần {a.attemptNo}</span> : null}</td>
                    <td className="tc-small">{!a ? <span className="tc-muted">Chưa làm</span> : a.status === 'submitted' ? `${a.autoSubmitted ? 'Hết giờ, tự nộp' : 'Đã nộp'} ${fmtDateTime(a.submittedAt ?? undefined)}` : s.overdue ? 'Quá giờ' : 'Đang làm'}{a?.retakeAllowed ? <span className="tc-chip ex-ml">Được làm lại</span> : null}</td>
                    <td className="ex-c">{a?.status === 'submitted' ? <><b className="ex-score">{a.score10}</b><span className="tc-muted tc-small"> ({fmtPoints(a.score ?? 0)}/{fmtPoints(a.maxScore ?? 0)})</span></> : '–'}</td>
                    <td className="ex-c"><LevelBadge level={s.level ?? null} /></td>
                    <td className="ex-flags">{s.integrity?.lines.length ? s.integrity.lines.map((l) => <span key={l} className="ex-flag">{l}</span>) : a ? <span className="tc-muted tc-small">Không có</span> : null}</td>
                    <td className="ex-right"><span className="tc-row ex-endrow">
                      {a ? <Btn size="sm" onClick={() => setDetail(s)}>Chi tiết</Btn> : null}
                      {a?.status === 'submitted' && !a.retakeAllowed ? <Btn size="sm" disabled={retake.isPending} onClick={() => retake.mutate({ examId: e.id, studentId: s.student.id }, { onSuccess: () => setMsg(`Đã cho ${s.student.name} làm lại. Em sẽ thấy bài trên trang Hôm nay.`), onError: (x) => setMsg((x as Error).message) })}>Cho làm lại</Btn> : null}
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="tc-card tc-card--flush">
        <div className="ex-pad"><h2 className="ex-h2">Độ khó từng câu</h2><p className="tc-small tc-muted">p = điểm trung bình của câu (0–100%). Dưới 50%: câu khó với lớp — nên ôn lại kĩ năng này.</p></div>
        <div className="tc-tablewrap">
          <table className="tc-table">
            <thead><tr>{variants.length > 1 ? <th>Đề</th> : null}<th>Câu</th><th>Mức</th><th>Nội dung</th><th className="ex-c">Số em</th><th>Độ khó p</th></tr></thead>
            <tbody>
              {r.questions.map((q) => (
                <tr key={`${q.variant}${q.slotId}`}>
                  {variants.length > 1 ? <td>{q.variant}</td> : null}
                  <td>{q.no}</td><td><LevelTag level={q.level} /></td>
                  <td className="tc-small">{shorten(items.data?.[q.itemId]?.prompt.text ?? q.itemId, 90)}</td>
                  <td className="ex-c">{q.n}</td>
                  <td><span className="ex-pbar"><i className={`ex-p--${pTone(q.p)}`} style={{ width: `${Math.round((q.p ?? 0) * 100)}%` }} /></span> {q.p === null ? '–' : `${Math.round(q.p * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.student.name} — chi tiết bài làm` : ''} wide>
        {detail?.attempt ? (
          <div className="ex-detail">
            <p>Bắt đầu {fmtDateTime(detail.attempt.startedAt)}{detail.attempt.submittedAt ? ` · nộp ${fmtDateTime(detail.attempt.submittedAt)} (${formatDuration(Date.parse(detail.attempt.submittedAt) - Date.parse(detail.attempt.startedAt))})` : ''} · đề {detail.attempt.variant}</p>
            {detail.integrity?.lines.length ? <ul>{detail.integrity.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="tc-muted">Không có ghi chú nào.</p>}
            {detail.integrity?.timeline.length ? (
              <>
                <h3 className="tc-h3">Mốc thời gian</h3>
                <ul className="ex-timeline">{detail.integrity.timeline.map((x, i) => <li key={i}><span className="tc-muted">{new Date(x.at).toLocaleTimeString('vi-VN')}</span> {KIND_LABEL[x.kind] ?? x.kind}{x.awayMs ? ` — ${formatDuration(x.awayMs)}` : ''}</li>)}</ul>
              </>
            ) : null}
            {detail.attempt.results ? <p className="tc-small">Đúng {detail.attempt.results.filter((x) => x.correct).length}/{detail.attempt.results.length} câu.</p> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
