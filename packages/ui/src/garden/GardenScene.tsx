/**
 * Cảnh Vườn lớp: cây chung giữa vườn lớn theo tổng sao cả lớp; các ô nhỏ bên dưới (ô tổ với lớp 1–3).
 * Không xếp hạng: ô HS không có tên/số sao trên màn hình lớp; HS chỉ thấy ô của mình.
 * variant: 'kid' (app HS) · 'tv' (màn hình lớp, chữ to) · 'teacher' (có tên từng HS).
 */
import type { CSSProperties } from 'react';
import { GROWTH_STAGE_NAMES, PLANTS, type ClassGarden, type GardenPlot } from '@openedu/contracts';
import { Plant } from './Plant';

export interface GardenSceneProps {
  garden: ClassGarden;
  variant?: 'kid' | 'tv' | 'teacher';
  /** Tắt lắc lư. */
  still?: boolean;
}

const plantName = (id: string) => PLANTS.find((p) => p.id === id)?.name ?? 'Cây';

/** Thứ tự ổn định không theo số sao (tránh lộ "ai ít nhất"). */
function stableShuffle<T extends { id: string }>(list: T[]): T[] {
  const h = (s: string) => { let x = 7; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; };
  return [...list].sort((a, b) => h(a.id) - h(b.id));
}

export function GardenScene({ garden: g, variant = 'kid', still }: GardenSceneProps) {
  const big = variant === 'tv' ? 380 : variant === 'teacher' ? 170 : 190;
  const plotSize = variant === 'tv' ? 92 : 64;
  const showStudents = variant === 'teacher' || variant === 'tv';
  const students = g.plots.filter((p) => p.kind === 'student');
  const teams = g.plots.filter((p) => p.kind === 'team');
  const plots: GardenPlot[] = variant === 'teacher' ? [...teams, ...students] : g.teamMode ? teams : showStudents ? stableShuffle(students) : [];
  const pct = Math.round(g.progress * 100);
  return (
    <div className={`k-gd k-gd--${variant}${g.stage === 4 ? ' is-bloom' : ''}`} style={{ ['--gd-p' as string]: `${pct}%` } as CSSProperties}>
      <div className="k-gd__sky" aria-hidden="true">
        <span className="k-gd__sun" />
        <span className="k-gd__cloud k-gd__cloud--a" />
        <span className="k-gd__cloud k-gd__cloud--b" />
      </div>
      <div className="k-gd__main">
        <div className="k-gd__tree">
          <Plant kind={g.goal.plant} stage={g.stage} size={big} sway={!still} title={`${plantName(g.goal.plant)} của lớp: ${GROWTH_STAGE_NAMES[g.stage]}`} />
          {g.stage === 4 && <span className="k-gd__sparkle" aria-hidden="true">✦</span>}
        </div>
        <div className="k-gd__goal">
          <span className="k-gd__goal-label">{plantName(g.goal.plant)} · {GROWTH_STAGE_NAMES[g.stage]}</span>
          <div className="k-gd__bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.goal.targetStars} aria-valuenow={Math.min(g.classStars, g.goal.targetStars)} aria-label="Sao cả lớp tuần này">
            <i />
          </div>
          <span className="k-gd__goal-num"><b>{g.classStars}</b> / {g.goal.targetStars} sao</span>
        </div>
      </div>
      {plots.length > 0 && (
        <div className={`k-gd__plots${g.teamMode ? ' is-teams' : ''}`}>
          {plots.map((p) => (
            <div key={p.id} className={`k-gd__plot${p.isMe ? ' is-me' : ''}`} style={p.color ? ({ ['--tc' as string]: p.color } as CSSProperties) : undefined}>
              <Plant kind={g.goal.plant} stage={p.stage} size={plotSize} sway={!still} />
              {p.kind === 'team' ? <span className="k-gd__tag">{p.name} · {p.stars} sao</span>
                : variant === 'teacher' ? <span className="k-gd__tag k-gd__tag--plain">{p.name} · {p.stars}</span> : null}
            </div>
          ))}
        </div>
      )}
      <div className="k-gd__soil" aria-hidden="true" />
    </div>
  );
}
