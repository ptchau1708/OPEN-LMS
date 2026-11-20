/** Vườn lớp (HS): cây chung của lớp lớn lên nhờ sao cả lớp kiếm trong tuần; em chỉ thấy cây của mình + tổng lớp. */
import { GROWTH_STAGE_NAMES, PLANTS } from '@openedu/contracts';
import { PERSONAL_STAGE_STARS, starsToGoal, useClassGarden } from '@openedu/data';
import { GardenScene, Icon, MascotBubble, Plant, SpeakButton } from '@openedu/ui';
import { AppTabs, EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { resolveSettings, useMe } from '../../lib/util';
import '@openedu/ui/rewards.css';
import '../../styles/rewards.css';

const plantName = (id: string) => PLANTS.find((p) => p.id === id)?.name ?? 'cây';

export default function ClassGardenPage() {
  const me = useMe();
  const q = useClassGarden(me.classId);
  const still = resolveSettings(me).reducedMotion;
  if (!me.classId) return <div className="ln-page"><TopBack title="Vườn lớp" /><EmptyState title="Em chưa có lớp" text="Khi thầy cô xếp em vào lớp, vườn của lớp sẽ hiện ở đây." /><AppTabs active="home" /></div>;
  if (q.isPending) return <><LoadingScreen label="Đang ra vườn" mascot="koala" /><AppTabs active="home" /></>;
  if (q.isError || !q.data) return <div className="ln-page"><ErrorState message="Chưa mở được Vườn lớp." onRetry={() => void q.refetch()} /><AppTabs active="home" /></div>;
  const g = q.data;
  const mine = g.me ?? { stars: 0, stage: 0 as const };
  const next = PERSONAL_STAGE_STARS.find((n) => n > mine.stars);
  const team = g.plots.find((p) => p.kind === 'team' && p.isMe);
  const left = starsToGoal(g);
  const line = g.stage === 4
    ? `Hoan hô! Cả lớp đã làm ${plantName(g.goal.plant).toLowerCase()} nở hoa tuần này!`
    : `Mỗi sao em kiếm được tuần này là một giọt nước tưới vườn. Cả lớp còn ${left} sao nữa là ${plantName(g.goal.plant).toLowerCase()} nở hoa!`;

  return (
    <div className="ln-page ln-page--wide ln-garden6">
      <TopBack title={`Vườn lớp ${g.className}`} />
      <MascotBubble mascot="koala" mood={g.stage === 4 ? 'cheer' : 'wave'} size={72}>
        <span>{line}</span> <SpeakButton text={line} size="sm" label="Nghe đọc" />
      </MascotBubble>
      <div className="ln-garden6__grid">
        <GardenScene garden={g} variant="kid" still={still} />
        <aside className="ln-garden6__side">
          <section className="k-card ln-garden6__mine" aria-labelledby="ln-mine-h">
            <h2 id="ln-mine-h" className="ln-h3">Cây của em</h2>
            <div className="ln-garden6__mine-row">
              <Plant kind={g.goal.plant} stage={mine.stage} size={86} sway={!still} />
              <div>
                <p className="ln-garden6__big">{mine.stars} <Icon name="star" size={26} /></p>
                <p className="k-muted">{GROWTH_STAGE_NAMES[mine.stage]}{next !== undefined ? ` · còn ${next - mine.stars} sao nữa để cây lớn thêm` : ' · cây của em đã nở hoa!'}</p>
              </div>
            </div>
          </section>
          {team && (
            <section className="k-card ln-garden6__team" aria-labelledby="ln-team-h" style={{ borderColor: team.color }}>
              <h2 id="ln-team-h" className="ln-h3">{team.name} của em</h2>
              <p>Cả tổ ({team.members} bạn) đã tưới <strong>{team.stars} sao</strong>. Cùng nhau chăm cây tổ mình nhé!</p>
            </section>
          )}
          <section className="k-card ln-garden6__col" aria-labelledby="ln-col-h">
            <h2 id="ln-col-h" className="ln-h3">Bộ sưu tập của lớp</h2>
            {g.collection.length === 0 ? <p className="k-muted">Tuần nào cả lớp đạt mục tiêu, một chậu hoa sẽ được cất vào đây.</p> : (
              <div className="ln-garden6__pots">
                {g.collection.slice(0, 8).map((c) => (
                  <span key={c.weekStart} className="ln-garden6__pot" title={plantName(c.plant)}><Plant kind={c.plant} stage={4} size={52} /></span>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <AppTabs active="home" />
    </div>
  );
}
