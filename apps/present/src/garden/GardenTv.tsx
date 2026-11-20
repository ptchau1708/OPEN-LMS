/**
 * Vườn lớp trên TV (đầu giờ học): /vuon-lop?lop=<classId>. Chữ rất to, tự làm mới mỗi 60 giây.
 * Không xếp hạng, không tên HS — chỉ tổng sao cả lớp, cây chung và cây theo tổ (lớp 1–3).
 */
import { useSearchParams } from 'react-router';
import { PLANTS } from '@openedu/contracts';
import { starsToGoal, useClassGarden } from '@openedu/data';
import { GardenScene, Mascot, Plant } from '@openedu/ui';
import '@openedu/ui/rewards.css';
import './garden-tv.css';

export default function GardenTv() {
  const [sp] = useSearchParams();
  const classId = sp.get('lop') ?? '';
  const q = useClassGarden(classId || undefined, { refetchMs: 60_000, display: 'tv' });
  const still = sp.get('tinh') === '1' || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (!classId) return <main className="pr-gtv pr-gtv--msg"><Mascot id="koala" mood="think" size={200} /><h1>Thiếu mã lớp</h1><p>Mở từ trang Vườn lớp trong Bàn làm việc giáo viên nhé.</p></main>;
  if (q.isPending) return <main className="pr-gtv pr-gtv--msg"><Mascot id="koala" mood="wave" size={200} animate /><h1>Đang ra vườn…</h1></main>;
  if (q.isError || !q.data) return <main className="pr-gtv pr-gtv--msg"><Mascot id="koala" mood="sad" size={200} /><h1>Chưa mở được Vườn lớp</h1><p>{q.error instanceof Error ? q.error.message : 'Thử lại sau nhé.'}</p></main>;
  const g = q.data;
  const name = PLANTS.find((p) => p.id === g.goal.plant)?.name ?? 'Cây';
  const left = starsToGoal(g);
  return (
    <main className="pr-gtv">
      <header className="pr-gtv__head">
        <Mascot id="koala" mood={g.stage === 4 ? 'cheer' : 'wave'} size={150} animate={!still} />
        <div>
          <h1 className="pr-gtv__title">Vườn lớp {g.className}</h1>
          <p className="pr-gtv__sub">{g.stage === 4 ? `Hoan hô! ${name} của lớp đã nở hoa!` : `Cả lớp còn ${left} sao nữa là ${name.toLowerCase()} nở hoa!`}</p>
        </div>
      </header>
      <GardenScene garden={g} variant="tv" still={still} />
      {g.collection.length > 0 && (
        <footer className="pr-gtv__col">
          <span>Bộ sưu tập:</span>
          {g.collection.slice(0, 10).map((c) => <Plant key={c.weekStart} kind={c.plant} stage={4} size={70} />)}
        </footer>
      )}
    </main>
  );
}
