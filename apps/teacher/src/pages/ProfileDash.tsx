import { useMemo, useState } from 'react';
import { MASTERY_LEVEL_LABEL, SKILL_BY_CODE, type MasteryLevel, type StudentProfile } from '@openedu/contracts';
import { useEvents } from '@openedu/data';
import { cx } from '../lib/format';
import { GROUP_BY_ID, groupOf } from '../lib/groups';
import { Card, Legend, LevelBar, Tile } from './Dashboard';
import '../styles/dashboard.css';

const DAY = 86_400_000;
const LEVELS: MasteryLevel[] = ['vung', 'dang-hoc', 'can-on', 'chua-hoc'];
const LV: Record<MasteryLevel, string> = { vung: 'vung', 'dang-hoc': 'dang', 'can-on': 'canon', 'chua-hoc': 'chua' };
const pctText = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
function monday(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

interface Week { start: Date; correct: number; wrong: number; days: number }

/** Phần đầu hồ sơ: nhóm phân hóa, ô chỉ số, tiến bộ 8 tuần, việc nên làm tiếp. */
export function ProfileDash({ p }: { p: StudentProfile }) {
  const events = useEvents({ userId: p.student.id, limit: 2000 });
  const [hover, setHover] = useState<number | null>(null);

  const weeks = useMemo(() => {
    const cur = monday(new Date()).getTime();
    const ws: Week[] = Array.from({ length: 8 }, (_, i) => ({ start: new Date(cur - (7 - i) * 7 * DAY), correct: 0, wrong: 0, days: 0 }));
    const dayset = ws.map(() => new Set<string>());
    for (const e of events.data ?? []) {
      const t = new Date(e.at);
      const i = Math.round((monday(t).getTime() - ws[0]!.start.getTime()) / (7 * DAY));
      if (i < 0 || i > 7) continue;
      dayset[i]!.add(t.toDateString());
      if (e.verb !== 'answered') continue;
      if (e.result?.correct === true) ws[i]!.correct++;
      else if (e.result?.correct === false) ws[i]!.wrong++;
    }
    ws.forEach((w, i) => { w.days = dayset[i]!.size; });
    return ws;
  }, [events.data]);

  const acc = (w: Week) => (w.correct + w.wrong ? w.correct / (w.correct + w.wrong) : null);
  const recent = weeks.slice(4).reduce((a, w) => ({ c: a.c + w.correct, n: a.n + w.correct + w.wrong }), { c: 0, n: 0 });
  const before = weeks.slice(0, 4).reduce((a, w) => ({ c: a.c + w.correct, n: a.n + w.correct + w.wrong }), { c: 0, n: 0 });
  const accRecent = recent.n ? recent.c / recent.n : null;
  const accBefore = before.n >= 5 ? before.c / before.n : null;
  const delta = accRecent !== null && accBefore !== null ? Math.round((accRecent - accBefore) * 100) : null;
  const max = Math.max(1, ...weeks.map((w) => w.correct + w.wrong));

  const c = p.mastery.counts;
  const done = c.vung + c['dang-hoc'] + c['can-on'];
  const group = GROUP_BY_ID[groupOf(c)];
  const lessonsDone = p.lessons.filter((l) => l.status === 'hoan-thanh').length;
  const overdue = p.lessons.filter((l) => l.status !== 'hoan-thanh' && l.dueAt && new Date(l.dueAt).getTime() < Date.now()).length;
  const short = (code: string) => SKILL_BY_CODE[code]?.short ?? code;

  // Việc nên làm tiếp — suy từ dữ liệu, tối đa 4 dòng, việc gấp trước.
  const next: { t: string; d?: string }[] = [];
  for (const g of p.gaps.slice(0, 2)) {
    const root = g.rootSkill !== g.skillCode ? short(g.rootSkill) : null;
    const mis = g.topMisconceptions[0]?.text;
    next.push({ t: root ? `Ôn lại từ gốc “${root}” trước, rồi mới tới “${short(g.skillCode)}”` : `Giao bộ ôn “${short(g.skillCode)}”`, d: mis ? `Lỗi hay mắc: ${mis}` : `Đúng ${Math.round(g.p * 100)}% sau ${g.attempts} lần làm` });
  }
  if (overdue) next.push({ t: `Nhắc em làm ${overdue} bài đã quá hạn`, d: 'Xem mục “Bài giảng và bài được giao” bên dưới.' });
  if (p.work.pending) next.push({ t: `Duyệt ${p.work.pending} bài viết em đã nộp`, d: 'Điểm và nhận xét chỉ vào hồ sơ sau khi thầy/cô duyệt.' });
  if (weeks[7]!.days === 0 && weeks[6]!.days === 0) next.push({ t: 'Hai tuần nay em chưa học trên app', d: 'Hỏi thăm em hoặc nhắn phụ huynh.' });
  if (next.length < 4 && p.strengths.length && !p.gaps.length) next.push({ t: `Giao bài nâng cao về “${p.strengths[0]!.short}”`, d: 'Em đã vững kĩ năng này — có thể nhờ em kèm bạn.' });
  if (next.length < 4 && p.attendance && p.attendance.rate !== null && p.attendance.rate < 0.9) next.push({ t: `Chuyên cần ${pctText(p.attendance.rate)} trong 30 ngày`, d: `Vắng không phép ${p.attendance.unexcused} buổi, có phép ${p.attendance.excused} buổi.` });

  const h = hover === null ? null : weeks[hover]!;
  const wk = (w: Week) => `${w.start.getDate()}/${w.start.getMonth() + 1}`;

  return (
    <div className="pf-dash">
      <section className="db-tiles" aria-label="Chỉ số chính của học sinh">
        <Tile icon="user" label="Nhóm phân hóa" value={<span style={{ fontSize: 18 }}>{group.label}</span>} sub={group.hint} tone={group.id === 'ho-tro' ? 'warn' : undefined} />
        <Tile icon="check" label="Kĩ năng đã vững" value={<>{c.vung}<em>/{done || 0}</em></>} sub={done ? `trong ${done} kĩ năng đã làm` : 'Chưa làm kĩ năng nào'} />
        <Tile icon="retry" label="Kĩ năng cần ôn" value={c['can-on']} sub={c['can-on'] ? 'Xem “Lỗ hổng cần quan tâm”' : 'Không có'} tone={c['can-on'] ? 'warn' : undefined} />
        <Tile icon="star" label="Trả lời đúng (4 tuần)" value={pctText(accRecent)} sub={delta === null ? `${recent.n} câu` : `${delta > 0 ? '▲ tăng' : delta < 0 ? '▼ giảm' : 'giữ nguyên'} ${Math.abs(delta)} điểm % so với 4 tuần trước`} tone={delta !== null && delta <= -10 ? 'warn' : undefined} />
        <Tile icon="book" label="Bài hoàn thành" value={<>{lessonsDone}<em>/{p.lessons.length}</em></>} sub={overdue ? `${overdue} bài quá hạn` : 'Không có bài quá hạn'} tone={overdue ? 'warn' : undefined} />
        <Tile icon="passport" label="Chuyên cần" value={pctText(p.attendance?.rate ?? null)} sub={p.attendance ? `${p.attendance.days} buổi gần nhất` : 'Chưa điểm danh'} />
      </section>

      <div className="pf-two">
        <Card title="Tiến bộ 8 tuần" sub="Số câu em trả lời mỗi tuần. Rê chuột vào cột để xem tỉ lệ đúng.">
          {events.isLoading ? <p className="tc-muted">Đang tải…</p> : !weeks.some((w) => w.correct + w.wrong) ? <p className="tc-muted">Chưa có câu trả lời nào trong 8 tuần qua.</p> : (
            <div className="db-act">
              <div className="db-act__top">
                <Legend items={[{ cls: 'db-lv db-lv--vung', label: 'Trả lời đúng' }, { cls: 'db-lv db-lv--canon', label: 'Chưa đúng' }]} />
                <p className="db-readout" aria-live="polite">
                  {h ? <><strong>Tuần {wk(h)}</strong> · {h.correct + h.wrong} câu · đúng {pctText(acc(h))} · học {h.days} ngày</> : <>8 tuần: <strong>{recent.n + before.n}</strong> câu · đúng {pctText(recent.n + before.n ? (recent.c + before.c) / (recent.n + before.n) : null)}</>}
                </p>
              </div>
              <div className="db-cols pf-weeks" onMouseLeave={() => setHover(null)}>
                {weeks.map((w, i) => (
                  <button key={i} type="button" className={cx('db-col', i === 7 && 'is-today', hover === i && 'is-hover')} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                    aria-label={`Tuần bắt đầu ${wk(w)}: ${w.correct} đúng, ${w.wrong} chưa đúng, học ${w.days} ngày`}>
                    <span className="db-col__bar" style={{ height: `${((w.correct + w.wrong) / max) * 100}%` }}>
                      {w.wrong ? <i className="db-lv db-lv--canon" style={{ flexGrow: w.wrong }} /> : null}
                      {w.correct ? <i className="db-lv db-lv--vung" style={{ flexGrow: w.correct }} /> : null}
                    </span>
                    <small>{i === 7 ? 'Tuần này' : wk(w)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <h3 className="db-h3">Em nắm được gì</h3>
          <LevelBar counts={c} label="Mức thành thạo các kĩ năng" />
          <Legend items={LEVELS.map((l) => ({ cls: `db-lv db-lv--${LV[l]}`, label: `${MASTERY_LEVEL_LABEL[l]} ${c[l]}` }))} />
          {p.strengths.length ? <p className="tc-small" style={{ margin: '10px 0 0' }}><span className="tc-muted">Vững nhất: </span>{p.strengths.slice(0, 4).map((s) => s.short).join(' · ')}</p> : null}
        </Card>

        <Card title="Nên làm gì tiếp" sub="Gợi ý tự động từ dữ liệu của em, việc gấp trước">
          {!next.length ? <p className="tc-muted">Chưa có gợi ý — em đang học đều, hoặc chưa có đủ dữ liệu.</p> : (
            <ol className="pf-next">
              {next.slice(0, 4).map((n, i) => <li key={i}><span className="pf-next__n">{i + 1}</span><span><strong>{n.t}</strong>{n.d ? <small>{n.d}</small> : null}</span></li>)}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
