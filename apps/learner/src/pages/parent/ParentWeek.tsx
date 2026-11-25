/** Bản tin tuần (getParentDigest) + kết quả TT27 đã chốt + "Lời nhắn của cô" + bài viết đã duyệt. */
import { useState } from 'react';
import { SUBJECTS, TT27_COMPETENCY_LABEL, TT27_LEVEL_LABEL, TT27_QUALITY_LABEL, TT27_RATING_LABEL, TT27_TERM_LABEL, type ParentTt27, type Profile, type Tt27Competency, type Tt27Quality } from '@openedu/contracts';
import { NOTE_CATEGORY_LABEL, useParentDigest, useStudentNotes, vnWeekStart } from '@openedu/data';
import { Icon } from '@openedu/ui';

const DAY = 86_400_000;
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };

export function ParentWeek({ child }: { child: Profile }) {
  const [offset, setOffset] = useState(0);
  const weekStart = new Date(Date.parse(vnWeekStart(new Date())) - offset * 7 * DAY).toISOString();
  const q = useParentDigest(child.id, weekStart);
  const d = q.data;
  const last = new Date(Date.parse(weekStart) + 6 * DAY).toISOString();
  return (
    <>
      <section className="ln-pp-card ln-pw" aria-label="Bản tin tuần">
        <header className="ln-pw__head">
          <h2 className="ln-pp-h">Bản tin tuần {fmt(weekStart)} – {fmt(last)}</h2>
          <div className="ln-pw__nav">
            <button type="button" className="ln-pw__btn" onClick={() => setOffset((o) => Math.min(o + 1, 12))} aria-label="Tuần trước"><Icon name="back" size={20} /></button>
            <button type="button" className="ln-pw__btn" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))} aria-label="Tuần sau"><Icon name="next" size={20} /></button>
          </div>
        </header>
        {q.isError ? <p className="ln-pp-muted">Chưa tải được bản tin. <button type="button" className="ln-link" onClick={() => void q.refetch()}>Thử lại</button></p> : !d ? <p className="ln-pp-muted">Đang tải…</p> : (
          <>
            <p className="ln-pw__lead">{d.headline}</p>
            <ol className="ln-pw__days" aria-label="Các ngày trong tuần">
              {d.days.map((x) => (
                <li key={x.date} className={x.active ? 'is-on' : ''} title={x.active ? `${x.answered} câu · ${x.stars} sao` : 'Không học'}>
                  <span className="ln-pw__dot">{x.active ? <Icon name="check" size={16} /> : null}</span>
                  <span className="ln-pw__lbl">{x.label}</span>
                </li>
              ))}
            </ol>
            <dl className="ln-pw__totals">
              <div><dt>Câu đã làm</dt><dd>{d.totals.answered}{d.totals.correctRate !== null ? <small> · đúng {Math.round(d.totals.correctRate * 100)}%</small> : null}</dd></div>
              <div><dt>Bài hoàn thành</dt><dd>{d.totals.lessonsCompleted}</dd></div>
              <div><dt>Sao</dt><dd>{d.totals.stars}</dd></div>
              {d.attendance ? <div><dt>Đi học</dt><dd>{d.attendance.present + d.attendance.late}/{d.attendance.days}<small>{d.attendance.late ? ` · muộn ${d.attendance.late}` : ''}{d.attendance.excused + d.attendance.unexcused ? ` · vắng ${d.attendance.excused + d.attendance.unexcused}` : ''}</small></dd></div> : null}
              {d.behavior ? <div><dt>Thi đua</dt><dd>{d.behavior.points >= 0 ? '+' : ''}{d.behavior.points}<small>{d.behavior.topPositive ? ` · ${d.behavior.topPositive.toLowerCase()}` : ''}</small></dd></div> : null}
            </dl>
            {d.works.length > 0 && (
              <div className="ln-pw__works">
                <h3 className="ln-pw__h3">Bài viết thầy cô đã chấm</h3>
                <ul className="ln-pp-list">
                  {d.works.map((w) => (
                    <li key={w.submissionId} className="ln-pp-row ln-pw__work">
                      <span className="ln-pp-ic"><Icon name="pencil" size={18} /></span>
                      <span className="ln-pp-row__main"><strong>{w.title}</strong><span className="ln-pp-muted">{SUBJECTS[w.subject]?.name ?? ''} · {fmt(w.at)}</span>{w.parentComment ? <span className="ln-pw__pc">{w.parentComment}</span> : null}</span>
                      <span className={`ln-pp-lvl ln-pp-lvl--${w.level}`}>{TT27_LEVEL_LABEL[w.level]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.tips.length > 0 && <div className="ln-pw__tips"><strong><Icon name="hint" size={18} /> Gợi ý ở nhà</strong><ul className="ln-pp-tips">{d.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
          </>
        )}
      </section>
      {d?.tt27 ? <Tt27Card t={d.tt27} /> : null}
      <TeacherNotes childId={child.id} />
    </>
  );
}

function Tt27Card({ t }: { t: ParentTt27 }) {
  return (
    <section className="ln-pp-card ln-pt" aria-label="Kết quả đánh giá">
      <h2 className="ln-pp-h">Kết quả {TT27_TERM_LABEL[t.termId].replace(/^G/, 'g').replace(/^C/, 'c')} · năm học {t.schoolYear}</h2>
      {t.generalComment ? (
        <blockquote className="ln-pt__note">
          <span className="ln-pt__note-k">Lời nhắn của {t.teacherName ?? 'cô'}</span>
          <p>{t.generalComment}</p>
        </blockquote>
      ) : null}
      <ul className="ln-pp-list">
        {t.subjects.map((s) => (
          <li key={s.subject} className="ln-pp-row">
            <span className="ln-pp-row__main"><strong>{SUBJECTS[s.subject]?.name ?? s.subject}{s.score !== undefined ? ` · điểm ${String(s.score).replace('.', ',')}` : ''}</strong>{s.comment ? <span className="ln-pp-muted">{s.comment}</span> : null}</span>
            <span className={`ln-pp-lvl ln-pp-lvl--${s.level}`}>{TT27_LEVEL_LABEL[s.level]}</span>
          </li>
        ))}
      </ul>
      {(t.qualities.length > 0 || t.competencies.length > 0) && (
        <div className="ln-pt__chips">
          {t.qualities.map((x) => <span key={x.key} className="ln-pp-chip">{TT27_QUALITY_LABEL[x.key as Tt27Quality]}: {TT27_RATING_LABEL[x.rating]}</span>)}
          {t.competencies.map((x) => <span key={x.key} className="ln-pp-chip">{TT27_COMPETENCY_LABEL[x.key as Tt27Competency]}: {TT27_RATING_LABEL[x.rating]}</span>)}
        </div>
      )}
    </section>
  );
}

/** Ghi chép thầy cô cho phụ huynh xem (Thông tin bổ sung — chỉ những mục thầy cô đánh dấu chia sẻ). */
function TeacherNotes({ childId }: { childId: string }) {
  const q = useStudentNotes(childId);
  const list = (q.data ?? []).filter((n) => n.shareParent).slice(0, 10);
  if (!list.length) return null;
  const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s);
  return (
    <section className="ln-pp-card" aria-label="Thầy cô ghi chép">
      <h2 className="ln-pp-h">Thầy cô ghi chép</h2>
      <ul className="ln-pp-list">
        {list.map((n) => (
          <li key={n.id} className="ln-pp-row">
            <span className="ln-pp-row__main">
              <strong>{n.title}</strong>
              <span className="ln-pp-muted">{NOTE_CATEGORY_LABEL[n.category]} · {ymd(n.date)}</span>
              {Object.keys(n.fields).length ? <span className="ln-pp-muted">{Object.entries(n.fields).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span> : null}
              {n.body ? <span style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
