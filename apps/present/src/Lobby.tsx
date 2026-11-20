import type { CSSProperties } from 'react';
import type { LiveParticipant, LiveState } from '@openedu/contracts';
import { Mascot, MascotBubble, QrCode } from '@openedu/ui';
import { firstName, joinUrls } from './util';

function avatarSize(n: number): string {
  return n <= 8 ? '15vmin' : n <= 15 ? '12vmin' : n <= 24 ? '10vmin' : n <= 36 ? '8.4vmin' : '7vmin';
}

export function Avatar({ p }: { p: LiveParticipant }) {
  return (
    <li className="pr-av">
      <span className="pr-av__disc" style={{ background: p.color }}>
        <Mascot id={p.mascot} mood="wave" size={80} className="pr-av__m" title="" />
      </span>
      <span className="pr-av__name">{firstName(p.name)}</span>
    </li>
  );
}

export function Lobby({ state }: { state: LiveState }) {
  const { full, short } = joinUrls(state.pin);
  const n = state.participants.length;
  return (
    <main className="pr-lobby">
      <h1 className="pr-lobby__title">{state.lesson?.title ?? 'Lớp học trực tiếp'}</h1>
      <div className="pr-lobby__grid">
        <section className="pr-join" aria-label="Cách vào lớp">
          <p className="pr-join__label">Mã lớp</p>
          <p className="pr-join__pin" aria-label={state.pin.split('').join(' ')}>
            {state.pin.split('').map((d, i) => (
              <span key={i} className={`pr-join__digit${i === 3 ? ' is-gap' : ''}`}>{d}</span>
            ))}
          </p>
          <QrCode value={full} size={300} className="pr-join__qr" title="Quét mã để vào lớp" />
          <p className="pr-join__url">{short}</p>
        </section>
        <section className="pr-room">
          <MascotBubble mascot={state.lesson?.mascot ?? 'nghe'} mood="wave" size={140} className="pr-room__bubble">
            Các bạn vào lớp nào!
          </MascotBubble>
          <p className="pr-room__count">
            <strong>{n}</strong> bạn đã vào lớp
          </p>
          <ul className="pr-room__avs" style={{ '--av': avatarSize(n) } as CSSProperties}>
            {state.participants.map((p) => (
              <Avatar key={p.userId} p={p} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
