import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { MASTERY_LEVEL_LABEL, MISCONCEPTIONS, SKILL_BY_CODE, STRAND_LABEL, SUBJECTS, type ClassHeatmap, type GapGroup, type HeatmapCell, type MascotId, type Profile, type SubjectId } from '@openedu/contracts';
import { useClasses, useClassHeatmap, useGapGroups, useItemsByIds, useRemediationSets, useSkillMastery, useStudentProfile } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Loading, PageHead, Seg } from '../components/common';
import { cx, relTime, shorten } from '../lib/format';
import { LevelLegend, LevelSwatch, pct } from '../lib/mastery';
import { useRemediate } from '../lib/remediate';

const SUBJECT_OPTS: SubjectId[] = ['toan', 'tieng-viet', 'tieng-anh', 'tnxh'];
const EMPTY: HeatmapCell = { level: 'chua-hoc', p: 0, attempts: 0 };

/** /kien-thuc → bản đồ của lớp đầu tiên. */
export function KnowledgeRedirect({ user }: { user: Profile }) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  if (classes.isLoading) return <Loading />;
  const id = classes.data?.[0]?.id;
  return id ? <Navigate to={`/lop/${id}/ban-do-kien-thuc`} replace /> : <div className="tc-page"><Empty icon="team" title="Chưa có lớp nào" /></div>;
}

const cellOf = (hm: ClassHeatmap, sid: string, code: string) => hm.cells[sid]?.[code] ?? EMPTY;

export default function Heatmap({ user }: { user: Profile }) {
  const { classId = '' } = useParams();
  const nav = useNavigate();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const [subject, setSubject] = useState<SubjectId>('toan');
  const [sort, setSort] = useState<'gaps' | 'name'>('gaps');
  const [onlyData, setOnlyData] = useState(true);
  const [open, setOpen] = useState<{ sid: string; code: string } | null>(null);
  const [tip, setTip] = useState<{ code: string; x: number; y: number } | null>(null);
  const hm = useClassHeatmap(classId, subject);
  const groups = useGapGroups(classId, subject);
  const cls = classes.data?.find((c) => c.id === classId);
  const data = hm.data;

  const cols = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const by: Record<string, typeof data.skills> = {};
    const rank = (g: number) => (g === data.grade ? 0 : g < data.grade ? 1 : 2);
    const used = (code: string) => data.students.some((st) => (data.cells[st.id]?.[code]?.attempts ?? 0) > 0);
    const list = data.skills.filter((s) => !onlyData || used(s.code)).map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.grade) - rank(b.s.grade) || b.s.grade - a.s.grade || a.i - b.i).map((x) => x.s);
    for (const s of list) {
      const k = `${s.strand}|${s.grade}|${s.topic}`;
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(s);
    }
    return order.map((k) => ({ key: k, ...by[k][0], skills: by[k] }));
  }, [data, onlyData]);
  const shown = cols.reduce((n, g) => n + g.skills.length, 0);

  const gapsOf = useMemo(() => {
    const m: Record<string, number> = {};
    data?.students.forEach((s) => { m[s.id] = data.skills.filter((k) => cellOf(data, s.id, k.code).level === 'can-on').length; });
    return m;
  }, [data]);
  const students = useMemo(() => {
    const list = [...(data?.students ?? [])];
    return sort === 'gaps' ? list.sort((a, b) => (gapsOf[b.id] ?? 0) - (gapsOf[a.id] ?? 0) || a.name.localeCompare(b.name, 'vi')) : list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [data, sort, gapsOf]);

  const showTip = (code: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); setTip({ code, x: Math.min(r.left, window.innerWidth - 330), y: r.bottom + 6 }); };
  const tipSkill = tip ? SKILL_BY_CODE[tip.code] : undefined;

  return (
    <div className="tc-page tc-page--wide">
      <PageHead title={`Bản đồ kiến thức${cls ? ` — Lớp ${cls.name}` : ''}`} sub="Mỗi ô: một em × một yêu cầu cần đạt. Bấm ô để xem bằng chứng, gốc rễ và cách hỗ trợ." actions={<>
        {(classes.data?.length ?? 0) > 1 ? <Seg label="Chọn lớp" value={classId} onChange={(v) => nav(`/lop/${v}/ban-do-kien-thuc`)} options={(classes.data ?? []).map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} /> : null}
        <Seg label="Môn" value={subject} onChange={(v) => { setSubject(v); setOpen(null); }} options={SUBJECT_OPTS.map((s) => ({ value: s, label: SUBJECTS[s].name }))} />
      </>} />

      <div className="tc-hmbar">
        <LevelLegend />
        <span className="tc-ebar__spacer" />
        <label className="tc-switch tc-small"><input type="checkbox" checked={onlyData} onChange={(e) => setOnlyData(e.target.checked)} /> Ẩn kĩ năng chưa em nào làm</label>
        <Seg label="Sắp xếp học sinh" value={sort} onChange={setSort} options={[{ value: 'gaps', label: 'Nhiều lỗ hổng trước' }, { value: 'name', label: 'Theo tên' }]} />
      </div>

      <ErrorNote error={hm.error} onRetry={() => void hm.refetch()} />
      {hm.isLoading ? <Loading /> : !data || !data.students.length ? <Empty icon="team" title="Lớp chưa có học sinh" /> : !shown ? <Empty icon="map" title="Chưa có dữ liệu kĩ năng cho môn này">{onlyData ? 'Chưa em nào làm câu hỏi có gắn kĩ năng của môn này.' : null}</Empty> : (
        <section className="tc-card tc-card--flush">
          <div className="tc-hm-scroll" onScroll={() => setTip(null)}>
            <table className="tc-hm">
              <thead>
                <tr className="tc-hm__r1">
                  <th className="tc-hm__corner" rowSpan={3} scope="col">
                    <span>Học sinh</span><small className="tc-muted">{data.students.length} em · {shown}/{data.skills.length} kĩ năng</small>
                  </th>
                  {cols.map((g, i) => (
                    <th key={g.key} colSpan={g.skills.length} scope="colgroup" className={cx('tc-hm__group', i > 0 && cols[i - 1].strand !== g.strand && 'is-strand')} title={STRAND_LABEL[g.strand]}>
                      <span>{g.topic}{g.grade !== data.grade ? ` · L${g.grade}` : ''}</span>
                    </th>
                  ))}
                </tr>
                <tr className="tc-hm__r2">
                  {cols.flatMap((g) => g.skills.map((s, j) => (
                    <th key={s.code} scope="col" className={cx('tc-hm__skill', j === 0 && 'is-first')}>
                      <button type="button" aria-describedby="tc-hm-tip" onMouseEnter={(e) => showTip(s.code, e.currentTarget)} onMouseLeave={() => setTip(null)} onFocus={(e) => showTip(s.code, e.currentTarget)} onBlur={() => setTip(null)}>
                        <span>{s.short}</span>
                      </button>
                    </th>
                  )))}
                </tr>
                <tr className="tc-hm__r3">
                  {cols.flatMap((g) => g.skills.map((s, j) => {
                    const c = data.skillSummary[s.code]?.counts;
                    const n = c?.['can-on'] ?? 0;
                    return <th key={s.code} scope="col" className={cx('tc-hm__sum', n > 0 && 'has-gap', j === 0 && 'is-first')} title={`${n}/${data.students.length} em cần ôn`}><span className="tc-sr">{s.short}: </span>{n ? `${n}/${data.students.length}` : '–'}<span className="tc-sr"> em cần ôn</span></th>;
                  }))}
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id}>
                    <th scope="row" className="tc-hm__name">
                      <Link to={`/hoc-sinh/${st.id}`}>
                        <Avatar mascot={st.avatarMascot as MascotId} color={st.avatarColor} size={26} />
                        <span>{st.name}</span>
                        {gapsOf[st.id] ? <em className="tc-gapcount" title={`${gapsOf[st.id]} kĩ năng cần ôn`}>{gapsOf[st.id]}</em> : null}
                      </Link>
                    </th>
                    {cols.flatMap((g) => g.skills.map((s, j) => {
                      const c = cellOf(data, st.id, s.code);
                      const isOpen = open?.sid === st.id && open.code === s.code;
                      return (
                        <td key={s.code} className={cx(j === 0 && 'is-first')}>
                          <button type="button" className={cx('tc-hm__cell', `tc-lv--${c.level}`, isOpen && 'is-open')} aria-label={`${st.name} · ${s.short}: ${MASTERY_LEVEL_LABEL[c.level]}${c.attempts ? `, ${pct(c.p)}, ${c.attempts} lần làm` : ''}`} onClick={() => setOpen({ sid: st.id, code: s.code })}>
                            <span className="tc-hm__glyph" aria-hidden="true">{c.level === 'can-on' ? '!' : c.level === 'vung' ? '✓' : c.level === 'dang-hoc' ? '•' : ''}</span>
                            <span className="tc-hm__p" aria-hidden="true">{c.attempts ? Math.round(c.p * 100) : '–'}</span>
                          </button>
                        </td>
                      );
                    }))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tip && tipSkill ? (
        <div id="tc-hm-tip" role="tooltip" className="tc-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tipSkill.short}</strong>
          <span>{tipSkill.text}</span>
          <small className="tc-muted">{tipSkill.code} · Lớp {tipSkill.grade} · {STRAND_LABEL[tipSkill.strand]}{tipSkill.provisional ? ' · kĩ năng tạm' : ''}</small>
          {data?.skillSummary[tip.code] ? <small className="tc-muted">{data.skillSummary[tip.code].counts['can-on']}/{data.students.length} em cần ôn{data.skillSummary[tip.code].avgP !== null ? ` · đúng TB ${pct(data.skillSummary[tip.code].avgP ?? 0)}` : ''}</small> : null}
        </div>
      ) : null}

      <GapGroups user={user} classId={classId} subject={subject} grade={data?.grade ?? cls?.grade ?? 1} groups={groups.data} loading={groups.isLoading} error={groups.error} />

      {open && data ? <CellPanel user={user} hm={data} sid={open.sid} code={open.code} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function GapGroups({ user, classId, subject, grade, groups, loading, error }: { user: Profile; classId: string; subject: SubjectId; grade: ClassHeatmap['grade']; groups?: GapGroup[]; loading: boolean; error: unknown }) {
  const r = useRemediate(user);
  return (
    <section className="tc-stack" aria-labelledby="tc-groups-h">
      <h2 id="tc-groups-h">Nhóm cần ôn</h2>
      <p className="tc-muted tc-small" style={{ marginTop: -8 }}>Các em có chung gốc lỗ hổng — dạy lại theo nhóm nhỏ sẽ nhanh hơn từng em.</p>
      <ErrorNote error={error} />
      {loading ? <Loading /> : !groups?.length ? <Empty icon="team" title="Chưa có nhóm nào">Chưa có từ 2 em trở lên cùng gốc lỗ hổng.</Empty> : (
        <div className="tc-groups">
          {groups.map((g) => {
            const t = { key: g.id, title: `Ôn: ${g.rootShort}`, note: g.suggestion, itemIds: g.itemIds, studentIds: g.students.map((s) => s.id), classId, subject, grade };
            return (
              <article key={g.id} className="tc-card tc-group">
                <header>
                  <h3>Nhóm {g.rootShort}: {g.students.map((s) => s.name.split(' ').pop()).join(', ')}</h3>
                  <span className="tc-chip">{g.students.length} em · {g.itemIds.length} câu</span>
                </header>
                <p className="tc-small"><span className="tc-muted">Kĩ năng gốc: </span>{SKILL_BY_CODE[g.rootSkill]?.text ?? g.rootShort}</p>
                {g.gapSkills.length ? <div className="tc-chips">{g.gapSkills.map((c) => <span key={c} className="tc-chip"><LevelSwatch level="can-on" />{SKILL_BY_CODE[c]?.short ?? c}</span>)}</div> : null}
                <div className="tc-chips">{g.students.map((s) => <Link key={s.id} to={`/hoc-sinh/${s.id}`} className="tc-chip tc-chip--link">{s.name} · {pct(s.p)}</Link>)}</div>
                {g.topMisconceptions.length ? (
                  <ul className="tc-miscs">{g.topMisconceptions.slice(0, 3).map((m) => <li key={m.code}><strong>{m.count}×</strong> {m.text}</li>)}</ul>
                ) : null}
                <p className="tc-small tc-group__tip">{g.suggestion}</p>
                <ErrorNote error={r.errorFor(g.id)} />
                {r.done[g.id] ? <div className="tc-alert tc-alert--ok"><span>{r.done[g.id]}</span><Link to="/giao-bai">Xem bài đã giao</Link></div> : null}
                <div className="tc-row tc-wrap">
                  <Btn kind="primary" icon="check" disabled={!!r.busy} onClick={() => void r.run(t, 'assign')}>{r.busy === `${g.id}:assign` ? 'Đang giao…' : 'Giao bộ ôn cho nhóm'}</Btn>
                  <Btn icon="tv" disabled={!!r.busy} onClick={() => void r.run(t, 'live')}>{r.busy === `${g.id}:live` ? 'Đang mở…' : 'Mở tiết ôn trực tiếp'}</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CellPanel({ user, hm, sid, code, onClose }: { user: Profile; hm: ClassHeatmap; sid: string; code: string; onClose: () => void }) {
  const st = hm.students.find((s) => s.id === sid);
  const skill = SKILL_BY_CODE[code];
  const cell = cellOf(hm, sid, code);
  const mastery = useSkillMastery(sid);
  const profile = useStudentProfile(sid);
  const sets = useRemediationSets(sid);
  const m = mastery.data?.find((x) => x.skillCode === code);
  const gap = profile.data?.gaps.find((g) => g.skillCode === code || g.rootChain.includes(code));
  const chain = gap?.rootChain ?? [code, ...(skill?.prereqs ?? [])];
  const evidence = m?.recentWrong ?? [];
  const items = useItemsByIds(evidence.map((e) => e.itemId));
  const set = sets.data?.find((s) => s.skillCode === code || s.rootSkill === code || (gap && s.rootSkill === gap.rootSkill));
  const r = useRemediate(user);
  const miscs = Object.entries(m?.misconceptions ?? {}).sort((a, b) => b[1] - a[1]);
  const key = `cell:${sid}:${code}`;

  return (
    <aside className="tc-drawer tc-cellpanel" aria-label="Chi tiết kĩ năng của học sinh">
      <header className="tc-drawer__head">
        {st ? <Avatar mascot={st.avatarMascot as MascotId} color={st.avatarColor} size={30} /> : null}
        <span className="tc-stack0"><strong>{st?.name}</strong><small className="tc-muted">{skill?.short ?? code}</small></span>
        <span className="tc-ebar__spacer" />
        <Btn kind="ghost" icon="close" aria-label="Đóng" onClick={onClose} />
      </header>
      <div className="tc-drawer__body">
        <div className={cx('tc-lvhead', `tc-lvhead--${cell.level}`)}>
          <LevelSwatch level={cell.level} />
          <strong>{MASTERY_LEVEL_LABEL[cell.level]}</strong>
          <span className="tc-muted tc-small">{cell.attempts ? `Đúng ${pct(cell.p)} · ${cell.attempts} lần làm${m ? ` · ${m.distinctDays} ngày` : ''}` : 'Chưa làm câu nào'}</span>
        </div>
        <p className="tc-small">{skill?.text}<br /><span className="tc-muted">{code} · Lớp {skill?.grade} · {skill ? STRAND_LABEL[skill.strand] : ''}</span></p>
        {m?.nextReviewAt ? <p className="tc-small tc-muted">Chặng ôn {m.reviewStage}/3 · ôn lại {relTime(m.nextReviewAt).replace(' trước', '')}{new Date(m.nextReviewAt).getTime() > Date.now() ? ` (${new Date(m.nextReviewAt).toLocaleDateString('vi-VN')})` : ' — đã đến hạn'}</p> : null}

        <section>
          <h3 className="tc-h3">Bằng chứng — câu làm chưa đúng gần đây</h3>
          {mastery.isLoading ? <Loading /> : !evidence.length ? <p className="tc-muted tc-small">Không có câu sai gần đây.</p> : (
            <ul className="tc-evidence">
              {evidence.map((e) => {
                const it = items.data?.[e.itemId];
                const mc = e.misconception ? MISCONCEPTIONS[e.misconception] : undefined;
                return (
                  <li key={`${e.itemId}${e.at}`}>
                    <span>{it ? shorten(it.prompt.text, 120) : e.itemId}</span>
                    {mc ? <span className="tc-misc"><b>Quan niệm sai:</b> {mc.text}</span> : null}
                    <small className="tc-muted">{relTime(e.at)}</small>
                  </li>
                );
              })}
            </ul>
          )}
          {miscs.length ? <ul className="tc-miscs">{miscs.map(([c, n]) => <li key={c}><strong>{n}×</strong> {MISCONCEPTIONS[c]?.text ?? c}</li>)}</ul> : null}
        </section>

        <section>
          <h3 className="tc-h3">{gap ? 'Chuỗi gốc rễ' : 'Kĩ năng nền'}</h3>
          <ol className="tc-chain">
            {chain.map((c, i) => {
              const cc = cellOf(hm, sid, c);
              const isRoot = gap ? c === gap.rootSkill : false;
              return (
                <li key={c} className={cx(isRoot && 'is-root')}>
                  <LevelSwatch level={cc.level} />
                  <span><strong>{SKILL_BY_CODE[c]?.short ?? c}</strong>{isRoot ? <em className="tc-new">Gốc</em> : null}{i === 0 && !gap ? null : null}<br /><small className="tc-muted">{MASTERY_LEVEL_LABEL[cc.level]}{cc.attempts ? ` · ${pct(cc.p)}` : ''}</small></span>
                </li>
              );
            })}
          </ol>
          {gap ? <p className="tc-small tc-muted">Nên củng cố “{SKILL_BY_CODE[gap.rootSkill]?.short}” trước rồi mới quay lại “{skill?.short}”.</p> : null}
        </section>

        <section>
          <h3 className="tc-h3">Hành động</h3>
          {set ? <p className="tc-small">Bộ ôn gợi ý: <strong>{set.title}</strong> · {set.itemIds.length} câu · {set.minutes} phút<br /><span className="tc-muted">{set.reason}</span></p> : <p className="tc-muted tc-small">Chưa có bộ ôn tự động cho kĩ năng này.</p>}
          <ErrorNote error={r.errorFor(key)} />
          {r.done[key] ? <div className="tc-alert tc-alert--ok"><span>{r.done[key]}</span></div> : null}
          <div className="tc-row tc-wrap">
            {set ? <Btn kind="primary" icon="check" disabled={!!r.busy} onClick={() => void r.run({ key, title: set.title, note: set.reason, itemIds: set.itemIds, studentIds: [sid], classId: hm.classId, subject: hm.subject, grade: hm.grade }, 'assign')}>{r.busy ? 'Đang giao…' : 'Giao bộ ôn cho em'}</Btn> : null}
            <Link className="tc-btn tc-btn--default" to={`/hoc-sinh/${sid}`}>Mở hồ sơ 360°</Link>
          </div>
        </section>
      </div>
    </aside>
  );
}
