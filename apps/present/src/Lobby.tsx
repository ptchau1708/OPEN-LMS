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
      {state.game?.mode === 'paper' ? (
        <section className="pr-paperlobby" aria-label="Chế độ thẻ giấy">
          <p className="pr-paperlobby__big">🃏 Hôm nay chơi bằng <b>thẻ giấy</b></p>
          <ol className="pr-paperlobby__steps">
            <li>Mỗi bạn cầm đúng thẻ có <b>số và tên</b> của mình.</li>
            <li>Chọn đáp án: xoay thẻ cho <b>chữ em chọn (A, B, C, D) ở phía trên</b>.</li>
            <li>Giơ thẻ thẳng, không lấy tay che mã. Thầy/cô sẽ quét cả lớp.</li>
          </ol>
          <p className="pr-room__count"><strong>{state.game.cards?.length ?? 0}</strong> thẻ</p>
        </section>
      ) : null}
      {state.game?.mode === 'paper' ? null : <div className="pr-lobby__grid">
        <section className="pr-join" aria-label="Cách vào lớp">
          <p className="pr-join__label">Mã lớp</p>
          <p className="pr-join__pin" aria-label={state.pin.split('').join(' ')}>
            {state.pin.split('').map((d, i) => (
              <span key={i} className={`pr-join__digit${i === 3 ? ' is-gap' : ''}`}>{d}</span>
            ))}
          </p>
          <QrCode value={full} size={420} className="pr-join__qr" title="Quét mã để vào lớp (bấm để phóng to)" />
          <p className="pr-join__url">{short}</p>
          <p className="pr-join__zoom">Bấm vào mã QR (hoặc phím Q) để phóng to</p>
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
      </div>}
    </main>
  );
}
