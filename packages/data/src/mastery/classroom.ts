/**
 * Tổng hợp theo lớp: bản đồ nhiệt HS × kĩ năng và nhóm HS chung gốc lỗ hổng. THUẦN.
 */
import { MISCONCEPTIONS, SKILL_BY_CODE, SKILLS, type ClassHeatmap, type GapGroup, type Grade, type HeatmapCell, type MasteryLevel, type Misconception, type Skill, type SkillMastery, type SubjectId } from '@openedu/contracts';
import { findGaps, topMisconceptions } from './gaps';
import type { ItemLike } from './observe';
import { pickSetItems } from './remediation';

export interface StudentLite {
  id: string;
  name: string;
  avatarMascot: string;
  avatarColor: string;
}

export interface HeatmapInput {
  classId: string;
  grade: Grade;
  subject?: SubjectId;
  students: StudentLite[];
  masteriesByUser: Record<string, SkillMastery[]>;
  now: Date;
  skills?: Skill[];
}

const emptyCounts = (): Record<MasteryLevel, number> => ({ 'chua-hoc': 0, 'dang-hoc': 0, 'can-on': 0, vung: 0 });

export function classHeatmap(input: HeatmapInput): ClassHeatmap {
  const subject = input.subject ?? 'toan';
  const catalog = input.skills ?? SKILLS;
  const byCode: Record<string, Skill> = Object.fromEntries(catalog.map((s) => [s.code, s]));
  const wanted = new Set<string>();
  for (const s of catalog) if (s.subject === subject && s.grade === input.grade) {
    wanted.add(s.code);
    for (const p of s.prereqs) wanted.add(p);
  }
  for (const st of input.students)
    for (const m of input.masteriesByUser[st.id] ?? []) if (m.attempts > 0 && byCode[m.skillCode]?.subject === subject) wanted.add(m.skillCode);
  const order = new Map(catalog.map((s, i) => [s.code, i]));
  const skills = [...wanted]
    .filter((c) => byCode[c])
    .sort((a, b) => byCode[a].grade - byCode[b].grade || (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map((c) => {
      const s = byCode[c];
      return { code: c, short: s.short, topic: s.topic, strand: s.strand, grade: s.grade, ...(s.provisional ? { provisional: true } : {}) };
    });

  const cells: Record<string, Record<string, HeatmapCell>> = {};
  const summary: ClassHeatmap['skillSummary'] = {};
  for (const sk of skills) summary[sk.code] = { counts: emptyCounts(), avgP: null };
  for (const st of input.students) {
    const row: Record<string, HeatmapCell> = {};
    const mine: Record<string, SkillMastery> = {};
    for (const m of input.masteriesByUser[st.id] ?? []) mine[m.skillCode] = m;
    for (const sk of skills) {
      const m = mine[sk.code];
      const level: MasteryLevel = m?.level ?? 'chua-hoc';
      summary[sk.code].counts[level]++;
      if (!m || m.attempts === 0) continue;
      const top = Object.entries(m.misconceptions).sort((a, b) => b[1] - a[1])[0];
      row[sk.code] = { level, p: m.p, attempts: m.attempts, ...(top ? { topMisconception: top[0] } : {}) };
    }
    cells[st.id] = row;
  }
  for (const sk of skills) {
    const ps = input.students.map((st) => cells[st.id][sk.code]?.p).filter((p): p is number => typeof p === 'number');
    summary[sk.code].avgP = ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 1000) / 1000 : null;
  }
  return { classId: input.classId, subject, grade: input.grade, generatedAt: input.now.toISOString(), students: input.students, skills, cells, skillSummary: summary };
}

export interface GroupInput {
  students: StudentLite[];
  masteriesByUser: Record<string, SkillMastery[]>;
  items?: ItemLike[];
  skills?: Record<string, Skill>;
  misconceptions?: Record<string, Misconception>;
  /** Số HS tối thiểu của một nhóm (mặc định 2). */
  minSize?: number;
}

/** Nhóm HS chung gốc lỗ hổng, đông trước. */
export function studentGroupsByGap(input: GroupInput): GapGroup[] {
  const skills = input.skills ?? SKILL_BY_CODE;
  const mis = input.misconceptions ?? MISCONCEPTIONS;
  const groups = new Map<string, { students: Map<string, { id: string; name: string; p: number }>; gapSkills: Set<string>; mis: Record<string, number> }>();
  for (const st of input.students) {
    const list = input.masteriesByUser[st.id] ?? [];
    const rootP = (code: string) => list.find((m) => m.skillCode === code)?.p ?? 0;
    for (const g of findGaps(list, skills, mis)) {
      let grp = groups.get(g.rootSkill);
      if (!grp) {
        grp = { students: new Map(), gapSkills: new Set(), mis: {} };
        groups.set(g.rootSkill, grp);
      }
      grp.students.set(st.id, { id: st.id, name: st.name, p: rootP(g.rootSkill) });
      grp.gapSkills.add(g.skillCode);
      for (const mc of g.topMisconceptions) grp.mis[mc.code] = (grp.mis[mc.code] ?? 0) + mc.count;
    }
  }
  const out: GapGroup[] = [];
  for (const [root, grp] of groups) {
    if (grp.students.size < (input.minSize ?? 2)) continue;
    const short = skills[root]?.short ?? root;
    const tops = topMisconceptions(grp.mis, mis);
    const gapSkills = [...grp.gapSkills].sort();
    const other = gapSkills.filter((c) => c !== root).map((c) => `“${skills[c]?.short ?? c}”`);
    out.push({
      id: `grp:${root}`,
      rootSkill: root,
      rootShort: short,
      gapSkills,
      students: [...grp.students.values()].sort((a, b) => a.p - b.p || a.name.localeCompare(b.name, 'vi')),
      topMisconceptions: tops,
      suggestion:
        `Dạy lại nhóm nhỏ ${grp.students.size} HS phần “${short}”` +
        (other.length ? ` (đang kéo theo ${other.join(', ')})` : '') +
        '. Bắt đầu bằng đồ dùng trực quan và 2–3 ví dụ mẫu, rồi cho nhóm làm các câu gợi ý.' +
        (tops[0] ? ` Chú ý lỗi hay gặp: ${tops[0].text.charAt(0).toLowerCase()}${tops[0].text.slice(1)}` : ''),
      itemIds: input.items ? pickSetItems(gapSkills.find((c) => c !== root) ?? root, root, input.items, 0, skills[root]?.prereqs ?? []) : [],
    });
  }
  return out.sort((a, b) => b.students.length - a.students.length || a.rootSkill.localeCompare(b.rootSkill));
}
