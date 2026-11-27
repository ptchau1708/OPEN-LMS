import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import type { MasteryLevel, RemediationSet, Skill, SkillMastery, SubjectId } from '@openedu/contracts';
import { SKILLS, SKILL_BY_CODE, SUBJECTS } from '@openedu/contracts';
import { useRemediationSets, useSkillMastery } from '@openedu/data';
import { Button, Icon, ProgressBar, sfx } from '@openedu/ui';
import { remPath } from '../lib/remediation';
import { subjectColor, useMe } from '../lib/util';
import '../styles/garden.css';

const ORDER: MasteryLevel[] = ['can-on', 'dang-hoc', 'vung', 'chua-hoc'];
const KID_LABEL: Record<MasteryLevel, string> = { vung: 'Nở hoa', 'dang-hoc': 'Đang lớn', 'can-on': 'Cần tưới', 'chua-hoc': 'Hạt giống' };

interface Plant { skill: Skill; level: MasteryLevel; p: number; set?: RemediationSet }

/** Vườn kĩ năng: vững = hoa · đang học = mầm · cần ôn = cây khát nước (nút Tưới cây) · chưa học = hạt. */
export default function SkillGarden() {
  const me = useMe();
  const nav = useNavigate();
  const mq = useSkillMastery(me.id);
  const sets = useRemediationSets(me.id).data ?? [];
  const [openSeeds, setOpenSeeds] = useState<Record<string, boolean>>({});
  const [openBed, setOpenBed] = useState<Record<string, boolean>>({});
  const big = (me.grade ?? 1) >= 4;

  const groups = useMemo(() => {
    const byCode: Record<string, SkillMastery> = {};
    (mq.data ?? []).forEach((m) => (byCode[m.skillCode] = m));
    const setFor: Record<string, RemediationSet> = {};
    sets.forEach((s) => { if (!setFor[s.rootSkill]) setFor[s.rootSkill] = s; if (!setFor[s.skillCode]) setFor[s.skillCode] = s; });
    const codes: string[] = SKILLS.filter((s) => s.grade === me.grade).map((s) => s.code);
    sets.forEach((s) => { if (codes.indexOf(s.rootSkill) < 0 && SKILL_BY_CODE[s.rootSkill]) codes.unshift(s.rootSkill); });
    const out: Record<string, Plant[]> = {};
    codes.forEach((c) => {
      const skill = SKILL_BY_CODE[c];
      const m = byCode[c];
      (out[skill.subject] = out[skill.subject] || []).push({ skill, level: m?.level ?? 'chua-hoc', p: m?.p ?? 0, set: setFor[c] });
    });
    return Object.keys(out).map((subj) => ({ subject: subj as SubjectId, plants: out[subj].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level)) }));
  }, [mq.data, sets, me.grade]);

  if (mq.isPending) return <div className="ln-skeleton-list"><i /><i /></div>;
  if (mq.isError) return <p className="k-muted">Chưa tải được vườn cây. <button type="button" className="ln-link" onClick={() => void mq.refetch()}>Thử lại</button></p>;

  // Mặc định chỉ mở luống cần tưới; không có thì mở luống đầu tiên đã có cây mọc. Các luống khác thu gọn thành một dòng.
  const autoOpen = (() => {
    const need = groups.filter((g) => g.plants.some((x) => x.level === 'can-on')).map((g) => g.subject as string);
    if (need.length) return need;
    const grown = groups.find((g) => g.plants.some((x) => x.level !== 'chua-hoc'));
    return grown ? [grown.subject as string] : groups.length ? [groups[0].subject as string] : [];
  })();
  const isOpen = (subj: string) => (openBed[subj] === undefined ? autoOpen.indexOf(subj) >= 0 : openBed[subj]);

  return (
    <div className="ln-garden">
      {groups.map(({ subject, plants }) => {
        const count = (l: MasteryLevel) => plants.filter((x) => x.level === l).length;
        const grown = plants.filter((x) => x.level !== 'chua-hoc');
        const seeds = plants.length - grown.length;
        const color = subjectColor(subject);
        const open = isOpen(subject);
        const total = Math.max(1, plants.length);
        const name = SUBJECTS[subject]?.name ?? 'Môn khác';
        return (
          <section key={subject} className={`ln-bed k-card${open ? ' is-open' : ''}`} style={{ ['--subj' as string]: color } as CSSProperties}>
            <button type="button" className="ln-bed__head" aria-expanded={open} onClick={() => { sfx.tap(); setOpenBed((o) => ({ ...o, [subject]: !open })); }}>
              <span className="ln-bed__title">
                <h3 className="ln-bed__h">{name}</h3>
                <span className="ln-bed__mini" aria-label={`${count('vung')} nở hoa, ${count('dang-hoc')} đang lớn, ${count('can-on')} cần tưới, ${seeds} hạt giống`}>
                  <span className="is-vung"><PlantArt level="vung" size={22} />{count('vung')}</span>
                  <span className="is-dang-hoc"><PlantArt level="dang-hoc" size={22} />{count('dang-hoc')}</span>
                  {count('can-on') ? <span className="is-can-on"><PlantArt level="can-on" size={22} />{count('can-on')}</span> : null}
                  <span className="is-chua-hoc"><PlantArt level="chua-hoc" size={22} />{seeds}</span>
                </span>
                <span className="ln-bed__seg" aria-hidden="true">
                  <i className="is-vung" style={{ width: `${(count('vung') / total) * 100}%` }} />
                  <i className="is-dang-hoc" style={{ width: `${(count('dang-hoc') / total) * 100}%` }} />
                  <i className="is-can-on" style={{ width: `${(count('can-on') / total) * 100}%` }} />
                </span>
              </span>
              <span className="ln-bed__chev" aria-hidden="true"><Icon name="next" size={22} /></span>
            </button>
            {open ? (
              <div className="ln-bed__body">
                <div className="ln-bed__counts">
                  {(['vung', 'dang-hoc', 'can-on', 'chua-hoc'] as MasteryLevel[]).map((l) => (
                    <span key={l} className={`ln-bed__count is-${l}`}><PlantArt level={l} size={34} /><strong>{count(l)}</strong><span>{KID_LABEL[l]}</span></span>
                  ))}
                </div>
                {big && <ProgressBar value={count('vung') / total} color="var(--k-ok)" label={`Đã nở hoa ${count('vung')} trên ${plants.length} cây`} className="ln-bed__bar" />}
                {grown.length > 0 && (
                  <ul className="ln-plants">
                    {grown.map((x) => (
                      <li key={x.skill.code} className={`ln-plant is-${x.level}`}>
                        <PlantArt level={x.level} size={64} />
                        <span className="ln-plant__name">{x.skill.short}</span>
                        {big && x.level !== 'can-on' && <ProgressBar value={x.p} color={x.level === 'vung' ? 'var(--k-ok)' : color} label={`${Math.round(x.p * 100)}%`} className="ln-plant__bar" />}
                        {x.level === 'can-on' && (x.set
                          ? <Button size="md" variant="subject" color="var(--k-sea)" className="ln-plant__water" onClick={() => { sfx.tap(); nav(remPath((x.set as RemediationSet).id)); }} icon={<Icon name="play" size={20} />}>Tưới cây</Button>
                          : <span className="ln-plant__wait">Sắp tưới</span>)}
                      </li>
                    ))}
                  </ul>
                )}
                {seeds > 0 && (
                  <div className="ln-seeds">
                    <button type="button" className="ln-seeds__btn" aria-expanded={!!openSeeds[subject]} onClick={() => setOpenSeeds((o) => ({ ...o, [subject]: !o[subject] }))}>
                      <PlantArt level="chua-hoc" size={28} /> {seeds} hạt giống đang chờ em gieo <Icon name={openSeeds[subject] ? 'close' : 'next'} size={18} />
                    </button>
                    {openSeeds[subject] && <ul className="ln-seeds__list">{plants.filter((x) => x.level === 'chua-hoc').map((x) => <li key={x.skill.code}>{x.skill.short}</li>)}</ul>}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** Minh họa cây theo mức (SVG, màu minh họa). */
export function PlantArt({ level, size = 56 }: { level: MasteryLevel; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`ln-plant-art is-${level}`}>
      <path d="M14 50h36l-4 12H18z" fill="#c9774a" /><rect x="11" y="46" width="42" height="7" rx="3" fill="#e08a58" />
      {level === 'chua-hoc' && <><ellipse cx="32" cy="45" rx="6" ry="4" fill="#8a5a3b" /><path d="M30 44q2-3 4 0" stroke="#b07a52" strokeWidth="1.5" fill="none" /></>}
      {level === 'dang-hoc' && <><path d="M32 46V30" stroke="#3aa760" strokeWidth="3.5" strokeLinecap="round" /><path d="M32 34c-8 0-12-6-12-10 6 0 12 3 12 10zM32 31c6-1 10-6 10-10-6 0-10 4-10 10z" fill="#5cc48a" /></>}
      {level === 'can-on' && <><path d="M32 46c0-8-2-12-8-16" stroke="#9aa66a" strokeWidth="3.5" fill="none" strokeLinecap="round" /><path d="M24 30c-7 2-10 8-9 12 6-1 10-5 9-12zM29 38c6 0 9 4 9 7-5 0-9-2-9-7z" fill="#b9c27a" /><path className="ln-drop" d="M46 8c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#52a8ff" /></>}
      {level === 'vung' && <><path d="M32 46V24" stroke="#3aa760" strokeWidth="3.5" strokeLinecap="round" /><path d="M32 40c-8 0-12-5-12-9 6 0 12 3 12 9zM32 36c7 0 11-5 11-9-6 0-11 3-11 9z" fill="#5cc48a" />
        <g transform="translate(32 18)">{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} rx="5.5" ry="8" cy="-8" fill="#ff7aa8" transform={`rotate(${a})`} />)}<circle r="5.5" fill="#ffc22e" /></g></>}
    </svg>
  );
}
