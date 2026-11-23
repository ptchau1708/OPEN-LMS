import { useEffect, useMemo, useState } from 'react';
import type { AnyResponse, Item, Lesson, LiveChannel, LiveState } from '@openedu/contracts';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { gameLeaderboard, gameQuestionSlides, slideItemIdOf } from '@openedu/data';
import { Button, Confetti, Icon, Mascot, MascotBubble } from '@openedu/ui';

const fmt = (n: number) => n.toLocaleString('vi-VN');

function readJson<T>(k: string): T | null {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function writeJson(k: string, v: unknown) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ }
}

/** Thanh điểm thi đua của em (chế độ class): điểm, hạng, điểm vừa cộng. */
export function GameBar({ state, userId }: { state: LiveState; userId: string }) {
  const rows = gameLeaderboard(state);
  const mine = rows.find((r) => r.userId === userId);
  const gain = state.game?.lastGain?.[userId];
  if (!state.game || !mine) return null;
  return (
    <div className="ln-gamebar" role="status" data-testid="game-bar">
      <span>⭐ <b>{fmt(mine.points)}</b> điểm</span>
      <span>Hạng <b>{mine.rank}</b>/{rows.length}</span>
      {mine.streak >= 2 ? <span>🔥 {mine.streak}</span> : null}
      {gain ? <span key={`${state.updatedAt}`} className="ln-gamebar__gain">+{fmt(gain)}</span> : null}
    </div>
  );
}

/** Màn kết thúc trò chơi trên máy em. */
export function GameOver({ state, userId, mascot }: { state: LiveState; userId: string; mascot: string }) {
  const rows = gameLeaderboard(state);
  const mine = rows.find((r) => r.userId === userId);
  const top3 = !!mine && mine.points > 0 && mine.rank <= 3;
  return (
    <div className="ln-gameover" data-testid="game-over">
      <Confetti show={top3} durationMs={4000} />
      <Mascot id={mascot as never} mood="cheer" size={150} animate />
      <h1>{top3 ? ['Em về nhất!', 'Em về nhì!', 'Em về ba!'][mine!.rank - 1] : 'Trò chơi kết thúc!'}</h1>
      {mine ? <p className="ln-gameover__big"><b>{fmt(mine.points)}</b> điểm · hạng {mine.rank}/{rows.length} · đúng {mine.correct} câu</p> : null}
      <p>Cảm ơn em đã chơi thật hăng hái!</p>
    </div>
  );
}

interface Done { correct?: boolean }

/** Chế độ self (kiểu Quizizz): em tự làm lần lượt các câu, biết đúng/sai ngay. */
export function SelfPlay({ channel, state, lesson, items, me, mascot, bigText }: {
  channel: LiveChannel; state: LiveState; lesson: Lesson | undefined; items: Record<string, Item>;
  me: { id: string; name: string }; mascot: string; bigText: boolean;
}) {
  const g = state.game!;
  const qs = useMemo(() => gameQuestionSlides(lesson).map((s) => ({ slideIndex: s, itemId: slideItemIdOf(lesson, s) ?? '' })).filter((x) => x.itemId), [lesson]);
  const key = `oe-self:${channel.sessionId}:${me.id}`;
  const [done, setDone] = useState<Record<string, Done>>(() => readJson<Record<string, Done>>(key) ?? {});
  useEffect(() => writeJson(key, done), [key, done]);
  const serverDone = new Set(g.done?.[me.id] ?? []);
  const nextQ = qs.find((x) => !done[x.slideIndex] && !serverDone.has(x.slideIndex));
  const item = nextQ ? items[nextQ.itemId] ?? lesson?.slides[nextQ.slideIndex]?.item : undefined;
  const [draft, setDraft] = useState<AnyResponse | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(false);
  const [flash, setFlash] = useState<null | boolean>(null);
  useEffect(() => { setDraft(undefined); setErr(false); }, [nextQ?.slideIndex]);
  useEffect(() => { if (flash === null) return; const t = window.setTimeout(() => setFlash(null), 1100); return () => window.clearTimeout(t); }, [flash]);

  const rows = gameLeaderboard(state);
  const mine = rows.find((r) => r.userId === me.id);
  const answered = qs.filter((x) => done[x.slideIndex] || serverDone.has(x.slideIndex)).length;
  const timeUp = !!g.endsAt && Date.now() >= Date.parse(g.endsAt);

  const bar = (
    <div className="ln-gamebar" role="status" data-testid="game-bar">
      <span>Câu <b>{Math.min(answered + 1, qs.length)}</b>/{qs.length}</span>
      <span>⭐ <b>{fmt(mine?.points ?? 0)}</b></span>
      {mine ? <span>Hạng <b>{mine.rank}</b>/{rows.length}</span> : null}
      {mine && mine.streak >= 2 ? <span>🔥 {mine.streak}</span> : null}
    </div>
  );

  if (!g.startedAt) {
    return (
      <div className="ln-gamecenter">
        <MascotBubble mascot={mascot as never} mood="wave" size={150}><strong>Chờ cô bấm “Bắt đầu” nhé!</strong></MascotBubble>
        <p>Em sẽ tự làm {qs.length} câu. Đúng và nhanh được nhiều điểm!</p>
      </div>
    );
  }

  if (flash !== null) {
    return (
      <div className={`ln-gamecenter ln-gameflash ${flash ? 'is-ok' : 'is-try'}`} data-testid="self-flash">
        {bar}
        <Icon name={flash ? 'check' : 'close'} size={96} />
        <h1>{flash ? 'Đúng rồi!' : 'Chưa đúng'}</h1>
        <Confetti show={flash} durationMs={1100} />
      </div>
    );
  }

  if (!nextQ || timeUp) {
    return (
      <div className="ln-gamecenter" data-testid="self-finished">
        {bar}
        <Mascot id={mascot as never} mood="cheer" size={140} animate />
        <h1>{timeUp && nextQ ? 'Hết giờ rồi!' : 'Em đã làm xong!'}</h1>
        <p>Nhìn lên bảng xem bảng xếp hạng nhé.</p>
      </div>
    );
  }

  if (!item) return <div className="ln-gamecenter">{bar}<p>Đang tải câu hỏi…</p></div>;

  let ready = false;
  try { ready = isComplete(item, draft); } catch { ready = draft !== undefined; }
  const send = async () => {
    if (!draft || sending) return;
    setSending(true);
    setErr(false);
    try {
      const r = await channel.respond({ sessionId: channel.sessionId, userId: me.id, itemId: item.id, slideIndex: nextQ.slideIndex, response: draft });
      setDone((d) => ({ ...d, [nextQ.slideIndex]: { correct: r.correct } }));
      if (typeof r.correct === 'boolean') setFlash(r.correct);
    } catch {
      setErr(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ln-selfplay" data-testid="self-play">
      {bar}
      <div className="lp-card lp-live__card">
        <ActivityView key={nextQ.slideIndex} item={item} value={draft} onChange={setDraft} disabled={sending} bigText={bigText} />
      </div>
      {err ? <p className="lp-live__err">Chưa gửi được. Em kiểm tra mạng rồi bấm “Gửi” lại nhé!</p> : null}
      <Button variant="primary" size="xl" className="lp-cta" disabled={!ready || sending} onClick={() => void send()} icon={<Icon name="upload" size={28} />}>
        {sending ? 'Đang gửi…' : 'Gửi'}
      </Button>
    </div>
  );
}

/** Chế độ thẻ giấy: máy em không cần làm gì. */
export function PaperNotice({ mascot }: { mascot: string }) {
  return (
    <div className="ln-gamecenter">
      <MascotBubble mascot={mascot as never} mood="happy" size={150}><strong>Hôm nay lớp chơi bằng thẻ giấy!</strong></MascotBubble>
      <p>Em cầm thẻ có tên mình, xoay chữ em chọn lên trên rồi giơ thẻ nhé.</p>
    </div>
  );
}
