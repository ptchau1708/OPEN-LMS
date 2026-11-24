import { useState } from 'react';
import { Link } from 'react-router';
import { MASTERY_LEVEL_LABEL, SUBJECTS, fitSubjectToGrade, subjectsForGrade, type Grade, type Profile, type SubjectId } from '@openedu/contracts';
import { useClasses, useGradeHeatmap } from '@openedu/data';
import { Btn, Empty, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { cx } from '../../lib/format';
import { levelOfP, pct } from './util';
import '../../styles/admin.css';


export default function GradeMap({ user }: { user: Profile }) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id).data ?? [];
  const grades = [...new Set(classes.map((c) => c.grade))].sort() as Grade[];
  const [grade, setGrade] = useState<Grade | null>(null);
  const [picked, setSubject] = useState<SubjectId>('toan');
  const g = grade ?? grades.find((x) => x === 4) ?? grades[0];
  const subjList = g ? subjectsForGrade(g, { periodic: true }) : subjectsForGrade(4, { periodic: true });
  const subject = g ? fitSubjectToGrade(picked, g, { periodic: true }) : picked;
  const q = useGradeHeatmap(g, subject);
  const hm = q.data;
  const [onlyWeak, setOnlyWeak] = useState(false);
  const skills = (hm?.skills ?? []).filter((s) => !onlyWeak || (hm?.total[s.code]?.avgP ?? 1) < 0.6);

  return (
    <div className="tc-page tc-page--wide ad-page">
      <PageHead title="Bản đồ kĩ năng theo khối" sub="Gộp bản đồ kiến thức của các lớp cùng khối: mỗi ô là mức thành thạo trung bình của lớp ở một kĩ năng." actions={<Link className="tc-btn tc-btn--ghost" to="/bao-cao"><span>← Báo cáo</span></Link>} />
      <div className="tc-row tc-wrap">
        {grades.length > 0 && <Seg label="Khối" value={g as Grade} onChange={(v) => setGrade(v)} options={grades.map((x) => ({ value: x, label: `Khối ${x}` }))} />}
        <Seg label="Môn" value={subject} onChange={setSubject} options={subjList.map((s) => ({ value: s, label: SUBJECTS[s].name }))} />
        <Btn size="sm" kind={onlyWeak ? 'primary' : 'default'} onClick={() => setOnlyWeak((v) => !v)}>Chỉ kĩ năng cả khối còn yếu</Btn>
      </div>
      <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
      {!g ? <Empty icon="map" title="Chưa có lớp" /> : q.isPending ? <Loading /> : !hm || hm.skills.length === 0 ? (
        <Empty icon="map" title={`Khối ${g} chưa có dữ liệu ${SUBJECTS[subject].name}`}>Khi học sinh luyện tập, bản đồ sẽ hiện ở đây.</Empty>
      ) : (
        <section className="tc-card tc-card--flush">
          <div className="ad-gm-scroll">
            <table className="ad-gm">
              <thead>
                <tr>
                  <th className="ad-gm__corner">Kĩ năng</th>
                  {hm.classes.map((c) => <th key={c.classId}><Link to={`/lop/${c.classId}/ban-do-kien-thuc`}>Lớp {c.name}</Link><small>{c.students} HS</small></th>)}
                  <th>Cả khối</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => {
                  const t = hm.total[s.code];
                  return (
                    <tr key={s.code}>
                      <th className="ad-gm__skill" title={s.code}><span>{s.short}</span><small>{s.topic}</small></th>
                      {hm.classes.map((c) => {
                        const cell = hm.cells[c.classId]?.[s.code];
                        const lv = levelOfP(cell?.avgP, cell?.n ?? 0);
                        return (
                          <td key={c.classId}>
                            <span className={cx('ad-gm__cell tc-lv', `tc-lv--${lv}`)} title={cell ? `${c.name}: ${pct(cell.avgP)} · ${cell.n} HS đã làm · ${cell.counts['can-on']} cần ôn · ${cell.counts.vung} vững` : `${c.name}: chưa ai làm`}>
                              {cell ? pct(cell.avgP, '') : ''}
                            </span>
                            {cell ? <small className="ad-gm__gap">{cell.n} HS{cell.counts['can-on'] ? ` · ${cell.counts['can-on']} cần ôn` : ''}</small> : null}
                          </td>
                        );
                      })}
                      <td><span className={cx('ad-gm__cell tc-lv', `tc-lv--${levelOfP(t?.avgP, t?.n ?? 0)}`)}>{t ? pct(t.avgP, '') : ''}</span><small className="ad-gm__gap">{t?.n ?? 0} HS{t?.counts['can-on'] ? ` · ${t.counts['can-on']} cần ôn` : ''}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="tc-legend ad-gm__legend">
            {(['vung', 'dang-hoc', 'can-on', 'chua-hoc'] as const).map((l) => <li key={l}><span className={cx('ad-gm__sw tc-lv', `tc-lv--${l}`)} />{l === 'vung' ? 'Vững (≥ 85%)' : l === 'dang-hoc' ? 'Đang học (60–84%)' : l === 'can-on' ? 'Cần ôn (< 60%)' : MASTERY_LEVEL_LABEL[l]}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
