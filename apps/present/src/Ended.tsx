import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LiveState } from '@openedu/contracts';
import { Confetti, Mascot, StarCount, sfx } from '@openedu/ui';
import { Avatar } from './Lobby';
import { firstName } from './util';

export function Ended({ state }: { state: LiveState }) {
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    setBurst(true);
    try {
      sfx.fanfare();
    } catch {
      /* bỏ qua */
    }
    const t = window.setInterval(() => setBurst((b) => !b), 3500);
    return () => window.clearInterval(t);
  }, []);
  const teams = [...state.teams].sort((a, b) => b.stars - a.stars);
  const stars = state.participants
    .map((p) => ({ p, stars: state.studentStars[p.userId] ?? 0 }))
    .filter((x) => x.stars > 0)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 8);
  // Bục: 2 · 1 · 3
  const podium = [teams[1], teams[0], teams[2]].map((t, i) => (t ? { t, rank: [2, 1, 3][i] } : null)).filter((x) => !!x);

  return (
    <main className="pr-end">
      <Confetti show={burst} durationMs={3200} count={56} />
      <div className="pr-end__head">
        <Mascot id={state.lesson?.mascot ?? 'nghe'} mood="cheer" size={200} animate className="pr-end__mascot" />
        <div>
          <h1 className="pr-end__title">Cảm ơn các bạn!</h1>
          <p className="pr-end__sub">{state.lesson?.title ? `Bài “${state.lesson.title}” đã xong. Cả lớp giỏi lắm!` : 'Cả lớp giỏi lắm!'}</p>
        </div>
      </div>
      {teams.length > 0 ? (
        <>
          <ol className="pr-podium">
            {podium.map((x, i) =>
              x ? (
                <li key={x.t.id} className={`pr-podium__col is-${x.rank}`} style={{ '--team': x.t.color } as CSSProperties}>
                  <span className="pr-podium__name">{x.t.name}</span>
                  <StarCount value={x.t.stars} size="lg" className="pr-podium__stars" />
                  <span className="pr-podium__block">{x.rank}</span>
                </li>
              ) : null,
            )}
          </ol>
          {teams.length > 3 && (
            <p className="pr-end__rest">
              {teams.slice(3).map((t) => (
                <span key={t.id} className="pr-end__chip" style={{ '--team': t.color } as CSSProperties}>
                  {t.name} · {t.stars} sao
                </span>
              ))}
            </p>
          )}
        </>
      ) : stars.length > 0 ? (
        <>
          <h2 className="pr-end__h2">Những ngôi sao hôm nay</h2>
          <ul className="pr-starcards">
            {stars.map(({ p, stars: s }) => (
              <li key={p.userId} className="pr-starcard">
                <span className="pr-av__disc" style={{ background: p.color }}>
                  <Mascot id={p.mascot} mood="cheer" size={80} className="pr-av__m" title="" />
                </span>
                <span className="pr-starcard__name">{firstName(p.name)}</span>
                <StarCount value={s} size="lg" />
              </li>
            ))}
          </ul>
        </>
      ) : state.participants.length > 0 ? (
        <ul className="pr-room__avs pr-end__all" style={{ '--av': '10vmin' } as CSSProperties}>
          {state.participants.map((p) => (
            <Avatar key={p.userId} p={p} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
