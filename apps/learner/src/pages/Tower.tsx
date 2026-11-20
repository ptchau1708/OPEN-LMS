import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { AnyResponse, Item, ItemType, MascotId, ScoreResult } from '@openedu/contracts';
import { usePassport, useItems, useSubmitAnswer } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Icon, Mascot, MascotBubble, StarBurst, StarCount, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, Heart, LoadingScreen, TopBack } from '../components/Common';
import { useUi } from '../lib/store';
import { resolveSettings, safeGet, safeSet, shuffle, useMe } from '../lib/util';
import { bestFloorKey } from './Play';
import '../styles/tower.css';

const FAST: ItemType[] = ['MCQ', 'LISTEN_CHOOSE', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'ORDERING', 'MATCHING'];
const PER_FLOOR = 3;
const HEARTS = 3;
type Phase = 'intro' | 'play' | 'climb' | 'over';

export default function Tower() {
  const me = useMe();
  const settings = resolveSettings(me);
  const itemsQ = useItems(me.grade ? { grade: me.grade } : undefined);
  const companion: MascotId = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const pool = useMemo(() => (itemsQ.data ?? []).filter((i) => FAST.indexOf(i.type) >= 0), [itemsQ.data]);

  if (itemsQ.isPending) return <LoadingScreen label="Đang dựng tháp" mascot={companion} />;
  if (itemsQ.isError) return <ErrorState message="Chưa tải được câu hỏi." onRetry={() => void itemsQ.refetch()} />;
  if (!pool.length) return <div className="ln-page"><TopBack title="Leo tháp" to="/choi" /><EmptyState title="Tháp đang xây" text="Chưa có câu hỏi cho lớp của em. Em quay lại sau nhé!" mascot={companion} /></div>;
  return <TowerGame pool={pool} companion={companion} bigText={settings.bigText} />;
}

function TowerGame({ pool, companion, bigText }: { pool: Item[]; companion: MascotId; bigText: boolean }) {
  const me = useMe();
  const nav = useNavigate();
  const submit = useSubmitAnswer();
  const toast = useUi((s) => s.toast);
  const queueUnlocks = useUi((s) => s.queueUnlocks);
  const deck = useRef<Item[]>([]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [floor, setFloor] = useState(1);
  const [q, setQ] = useState(0);
  const [hearts, setHearts] = useState(HEARTS);
  const [item, setItem] = useState<Item | null>(null);
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [result, setResult] = useState<{ r: ScoreResult; stars: number } | null>(null);
  const [burst, setBurst] = useState(false);
  const [earned, setEarned] = useState(0);
  const [best, setBest] = useState(() => Number(safeGet(bestFloorKey(me.id)) ?? 0) || 0);
  const [newBest, setNewBest] = useState(false);

  const draw = () => {
    if (!deck.current.length) deck.current = shuffle(pool);
    const next = deck.current.shift() as Item;
    setItem(next);
    setValue(undefined);
    setResult(null);
  };

  const start = () => { sfx.tap(); setFloor(1); setQ(0); setHearts(HEARTS); setEarned(0); setNewBest(false); deck.current = shuffle(pool); draw(); setPhase('play'); };

  const ready = (() => { if (!item) return false; try { return isComplete(item, value); } catch { return value !== undefined; } })();

  const check = () => {
    if (!item || !ready || submit.isPending || result) return;
    submit.mutate({ userId: me.id, item, response: value as AnyResponse, context: { source: 'arena' }, attempt: 1 }, {
      onSuccess: (res) => {
        setResult({ r: res.result, stars: res.starsAwarded });
        if (res.award?.newlyUnlocked.length) queueUnlocks(res.award.newlyUnlocked);
        if (res.result.correct) { sfx.correct(); setBurst(true); setEarned((e) => e + res.starsAwarded); }
        else { sfx.tryAgain(); setHearts((h) => h - 1); }
      },
      onError: () => toast('Chưa gửi được câu trả lời. Em kiểm tra mạng rồi bấm lại nhé!', 'try'),
    });
  };

  const finish = (reached: number) => {
    if (reached > best) { setBest(reached); setNewBest(true); safeSet(bestFloorKey(me.id), String(reached)); }
    setPhase('over');
  };

  const cont = () => {
    if (!result) return;
    const cleared = floor - 1;
    if (hearts <= 0) { finish(cleared); return; }
    if (q + 1 >= PER_FLOOR) {
      setPhase('climb');
      sfx.star();
      window.setTimeout(() => { setFloor((f) => f + 1); setQ(0); draw(); setPhase('play'); }, 1700);
      return;
    }
    setQ(q + 1);
    draw();
  };

  // Enter = hành động chính (máy tính phòng tin).
  const keyRef = useRef<() => void>(() => undefined);
  keyRef.current = () => { if (phase !== 'play') return; if (result) cont(); else check(); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); keyRef.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const heartsRow = <span className="ln-hearts" aria-label={`Còn ${hearts} trái tim`}>{Array.from({ length: HEARTS }, (_, i) => <Heart key={i} full={i < hearts} />)}</span>;

  if (phase === 'intro' || phase === 'over') {
    const reached = floor - 1;
    return (
      <div className="ln-page ln-tower-page">
        <TopBack title="Leo tháp" to="/choi" />
        <div className="ln-tower-intro">
          <TowerArt floor={phase === 'over' ? Math.max(1, reached) : 1} mascot={companion} />
          <div className="ln-tower-intro__text">
            {phase === 'intro' ? (
              <>
                <MascotBubble mascot={companion} mood="wave" size={80}>Mỗi tầng có <strong>3 câu hỏi</strong>. Em có <strong>3 trái tim</strong>. Mình cùng leo thật cao nhé!</MascotBubble>
                {best > 0 && <p className="ln-tower-best"><Icon name="trophy" size={22} /> Kỷ lục của em: tầng {best}</p>}
                <Button size="xl" block onClick={start} icon={<Icon name="play" size={30} />}>Bắt đầu leo</Button>
              </>
            ) : (
              <>
                <h2 className="ln-h1">{reached > 0 ? `Em leo được ${reached} tầng!` : 'Mình thử lại nhé!'}</h2>
                {newBest && reached > 0 && <p className="ln-tower-new">Kỷ lục mới! Tuyệt vời!</p>}
                <p className="k-muted">{earned > 0 ? `Em nhận thêm ${earned} sao.` : 'Trả lời đúng câu mới để nhận sao nhé.'} Mỗi lần chơi, em lại giỏi hơn!</p>
                <Button size="xl" block onClick={start} icon={<Icon name="retry" size={28} />}>Leo lại</Button>
                <Button size="lg" block variant="secondary" onClick={() => nav('/choi')}>Về Đấu trường</Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'climb') {
    return (
      <div className="ln-page ln-tower-page">
        <div className="ln-climb" role="status">
          <TowerArt floor={floor + 1} mascot={companion} climbing />
          <h2 className="ln-climb__title">Lên tầng {floor + 1}!</h2>
          {heartsRow}
        </div>
      </div>
    );
  }

  const ok = result?.r.correct;
  return (
    <div className="ln-tower-play">
      <header className="ln-tower-bar">
        <Button variant="secondary" icon={<Icon name="close" size={26} />} aria-label="Dừng leo tháp" onClick={() => finish(floor - 1)} />
        <span className="ln-floor-badge"><Icon name="tower" size={24} /> Tầng {floor}</span>
        <span className="ln-qdots" aria-label={`Câu ${q + 1} trên ${PER_FLOOR}`}>{Array.from({ length: PER_FLOOR }, (_, i) => <i key={i} className={i < q ? 'is-done' : i === q ? 'is-on' : ''} />)}</span>
        {heartsRow}
        <StarCount value={earned} size="sm" />
      </header>
      <div className="ln-tower-main">
        <aside className="ln-tower-side"><TowerArt floor={floor} mascot={companion} /></aside>
        <section className="ln-tower-q">
          {item && (
            <div className="ln-qcard" key={item.id + floor + q}>
              <ActivityView item={item} value={value} onChange={setValue} disabled={!!result || submit.isPending} reveal={!!result && item.key != null} result={result?.r} bigText={bigText} />
            </div>
          )}
        </section>
      </div>
      <footer className={`ln-tower-foot${result ? (ok ? ' is-ok' : ' is-try') : ''}`}>
        <StarBurst show={burst} onDone={() => setBurst(false)} />
        {result ? (
          <>
            <MascotBubble mascot={companion} mood={ok ? 'cheer' : 'happy'} size={64} className="ln-tower-feedback">
              <strong>{ok ? 'Đúng rồi! Giỏi quá!' : hearts > 0 ? 'Chưa đúng rồi, mất một trái tim. Cố lên!' : 'Hết trái tim rồi. Em đã cố gắng lắm!'}</strong>
              {ok && result.stars > 0 && <span> +{result.stars} sao</span>}
            </MascotBubble>
            <Button size="xl" onClick={cont} icon={<Icon name="next" size={28} />}>{hearts <= 0 ? 'Xem kết quả' : 'Tiếp'}</Button>
          </>
        ) : (
          <Button size="xl" className="ln-tower-check" onClick={check} disabled={!ready || submit.isPending} icon={<Icon name="check" size={28} />}>
            {submit.isPending ? 'Đang chấm…' : 'Kiểm tra'}
          </Button>
        )}
      </footer>
    </div>
  );
}

/** Tháp vẽ bằng SVG: hiện 5 tầng quanh tầng hiện tại, linh vật đứng ở tầng đang leo. */
function TowerArt({ floor, mascot, climbing }: { floor: number; mascot: MascotId; climbing?: boolean }) {
  const SHOW = 5;
  const base = Math.max(1, floor - 2);
  const floors = Array.from({ length: SHOW }, (_, i) => base + i);
  const FH = 56;
  const H = SHOW * FH + 70;
  const yOf = (f: number) => H - 20 - (f - base + 1) * FH;
  return (
    <div className={`ln-tower-art${climbing ? ' is-climbing' : ''}`}>
      <svg viewBox={`0 0 200 ${H}`} className="ln-tower-svg" aria-hidden="true">
        <rect x="0" y={H - 24} width="200" height="24" rx="12" fill="#7bd39d" />
        {floors.map((f) => {
          const y = yOf(f);
          const on = f === floor;
          const past = f < floor;
          return (
            <g key={f}>
              <rect x="34" y={y} width="132" height={FH - 4} rx="10" fill={on ? '#ffc22e' : past ? '#ffe2c4' : '#ffffff'} stroke="#e0b48a" strokeWidth="2" />
              <rect x="48" y={y + 14} width="22" height="22" rx="6" fill={on ? '#fff3c4' : '#cfe3ff'} />
              <rect x="130" y={y + 14} width="22" height="22" rx="6" fill={on ? '#fff3c4' : '#cfe3ff'} />
              <text x="100" y={y + 34} textAnchor="middle" className="ln-tower-num">{f}</text>
            </g>
          );
        })}
        <path d={`M26 ${yOf(base + SHOW - 1)} h148 l-16 -28 h-116 z`} fill="#ff8a3d" />
        <path d={`M100 ${yOf(base + SHOW - 1) - 28} v-26 l20 8 -20 8`} fill="#e8485f" />
      </svg>
      <span className="ln-tower-climber" style={{ top: `${((yOf(floor) - 50) / H) * 100}%` }}>
        <Mascot id={mascot} mood={climbing ? 'cheer' : 'happy'} size={64} title="" animate />
      </span>
    </div>
  );
}
