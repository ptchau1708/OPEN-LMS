import { useNavigate } from 'react-router';
import { ARENA_TASK_ID, useTodayTasks, useWallet } from '@openedu/data';
import { Button, Icon, StarCount } from '@openedu/ui';
import { AppTabs } from '../components/Common';
import { useUi } from '../lib/store';
import { safeGet, useMe } from '../lib/util';
import { ArenaClosedNote, BoardCard, CupStrip, useArenaGate } from './arena/ArenaWidgets';

export function bestFloorKey(userId: string) { return `ln-tower-best:${userId}`; }

export default function Play() {
  const me = useMe();
  const nav = useNavigate();
  const stars = useWallet(me.id).data?.stars ?? 0;
  const arena = (useTodayTasks(me.id).data ?? []).find((t) => t.id === ARENA_TASK_ID);
  const best = Number(safeGet(bestFloorKey(me.id)) ?? 0) || 0;
  const toast = useUi((s) => s.toast);
  const gate = useArenaGate();
  const towerGate = useArenaGate('tower');
  const duelGate = useArenaGate('duel');
  const go = (path: string, g: typeof gate) => (g.closed ? toast(g.closed.text, 'try') : nav(path));
  return (
    <div className="ln-page ln-play">
      <header className="ln-learn__head">
        <div>
          <h1 className="ln-h1">Đấu trường</h1>
          <p className="k-muted ln-learn__sub">Chơi mà học, học mà chơi!</p>
        </div>
        <StarCount value={stars} />
      </header>
      <CupStrip />
      <ArenaClosedNote gate={gate} />
      <div className="ln-arena-grid">
        <article className={`ln-arena ln-arena--tower${towerGate.closed ? ' is-locked' : ''}`} onClick={() => go('/choi/thap', towerGate)}>
          <MiniTower />
          <div className="ln-arena__body">
            <span className="ln-arena__tag"><Icon name="user" size={18} /> Một mình</span>
            <h2 className="ln-arena__title">Leo tháp</h2>
            <p>Mỗi tầng 3 câu hỏi nhanh. Em có 3 trái tim, leo càng cao càng giỏi!</p>
            {best > 0 && <p className="ln-arena__best"><Icon name="trophy" size={20} /> Kỷ lục của em: tầng {best}</p>}
            {arena && <p className="ln-arena__hint">{arena.subtitle}</p>}
            <Button size="lg" variant="subject" color="var(--k-viet)" icon={<Icon name={towerGate.closed ? 'lock' : 'play'} size={26} />} onClick={(e) => { e.stopPropagation(); go('/choi/thap', towerGate); }}>Leo ngay</Button>
          </div>
        </article>
        <article className="ln-arena ln-arena--team">
          <div className="ln-arena__art" aria-hidden="true"><Icon name="team" size={76} strokeWidth={1.8} /></div>
          <div className="ln-arena__body">
            <span className="ln-arena__tag"><Icon name="team" size={18} /> Cả tổ</span>
            <h2 className="ln-arena__title">Đấu đội</h2>
            <p>Thầy/cô mở trận đấu trên TV. Em vào lớp bằng mã 6 số, cùng tổ mình giành sao nhé!</p>
            <Button size="lg" variant="subject" color="var(--k-eng)" icon={<Icon name="tv" size={26} />} onClick={() => nav('/lop')}>Vào lớp</Button>
          </div>
        </article>
        <article className={`ln-arena ln-arena--duel${duelGate.closed ? ' is-locked' : ''}`} onClick={() => go('/choi/doi-dau', duelGate)}>
          <div className="ln-arena__art ln-arena__art--duel" aria-hidden="true"><Icon name="user" size={52} /><b>VS</b><Icon name="user" size={52} /></div>
          <div className="ln-arena__body">
            <span className="ln-arena__tag"><Icon name="team" size={18} /> Hai bạn</span>
            <h2 className="ln-arena__title">Đấu 1–1</h2>
            <p>Thi tài cùng một bạn trong lớp: 7 câu, ai đúng và nhanh hơn sẽ thắng. Không có bạn thì đấu với bạn Robo!</p>
            <Button size="lg" variant="subject" color="var(--k-math)" icon={<Icon name={duelGate.closed ? 'lock' : 'play'} size={26} />} onClick={(e) => { e.stopPropagation(); go('/choi/doi-dau', duelGate); }}>Đấu ngay</Button>
          </div>
        </article>
      </div>
      <BoardCard />
      <AppTabs active="play" />
    </div>
  );
}

function MiniTower() {
  return (
    <svg className="ln-arena__art ln-minitower" viewBox="0 0 120 150" aria-hidden="true">
      <path d="M30 140 V40 H90 V140 Z" fill="#ffd8b5" />
      <path d="M24 40 h72 v-14 h-12 v8 h-12 v-8 h-24 v8 h-12 v-8 h-12 z" fill="#ff8a3d" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x="36" y={52 + i * 22} width="48" height="16" rx="5" fill={i === 1 ? '#ffc22e' : '#ffffff'} opacity="0.95" />)}
      <path d="M52 140 v-14 a8 8 0 0 1 16 0 v14 z" fill="#b0784a" />
      <path d="M60 26 V6 l16 6 -16 6" fill="#e8485f" stroke="#a03040" strokeWidth="1.5" />
    </svg>
  );
}
