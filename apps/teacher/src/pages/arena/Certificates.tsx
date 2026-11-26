/**
 * In giấy khen Đấu trường (A4 ngang, mỗi em một trang):
 *  ?giai=<id>                 → Vô địch, Á quân, Hạng ba của giải
 *  ?lop=<id>&mua=hien-tai     → top 10 bảng xếp hạng mùa đang diễn ra
 *  ?lop=<id>&mua=<idMùa>      → top 10 mùa đã kết thúc
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { useArenaBoard, useArenaSeasons, useClasses, useCup, useSchoolSettings } from '@openedu/data';
import { Btn, Empty, Field, Loading } from '../../components/common';
import '../../styles/arena.css';

interface Recipient { userId: string; name: string; className?: string; honor: string; detail: string }

const RANK_HONOR = (rank: number) => (rank === 1 ? 'HẠNG NHẤT' : rank === 2 ? 'HẠNG NHÌ' : rank === 3 ? 'HẠNG BA' : `TOP 10 (HẠNG ${rank})`);

export default function Certificates({ user }: { user: Profile }) {
  const [sp] = useSearchParams();
  const cupId = sp.get('giai') ?? undefined;
  const classId = sp.get('lop') ?? undefined;
  const seasonId = sp.get('mua') ?? undefined;
  const cup = useCup(cupId);
  const board = useArenaBoard(classId, !!classId && seasonId === 'hien-tai');
  const seasons = useArenaSeasons(classId && seasonId !== 'hien-tai' ? classId : undefined);
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const school = useSchoolSettings();
  const clsName = (id?: string) => classes.data?.find((c) => c.id === id)?.name;
  const today = new Date();
  const [f, setF] = useState({
    school: '', signerRole: 'GIÁO VIÊN CHỦ NHIỆM', signer: user.name, place: '',
    date: `ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`,
  });
  const schoolName = f.school || school.data?.schoolName || '';
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const list: Recipient[] = useMemo(() => {
    if (cupId && cup.data) {
      const c = cup.data;
      const P = new Map(c.players.map((p) => [p.userId, p]));
      const make = (u: string | undefined, honor: string): Recipient | null => {
        const p = u ? P.get(u) : undefined;
        return p ? { userId: p.userId, name: p.name, className: p.className ?? c.className, honor, detail: `Giải đấu “${c.title}”` } : null;
      };
      return [make(c.champion, 'VÔ ĐỊCH'), make(c.runnerUp, 'Á QUÂN'), ...c.thirds.map((t) => make(t, 'HẠNG BA'))].filter((x): x is Recipient => !!x);
    }
    if (seasonId === 'hien-tai' && board.data) {
      const title = board.data.seasonTitle || 'Mùa hiện tại';
      return board.data.rows.filter((r) => r.points > 0).slice(0, 10)
        .map((r) => ({ userId: r.userId, name: r.name, className: clsName(classId), honor: RANK_HONOR(r.rank), detail: `Bảng xếp hạng Đấu trường “${title}”` }));
    }
    const s = seasons.data?.find((x) => x.id === seasonId);
    if (s) return s.top.map((r) => ({ userId: r.userId, name: r.name, className: clsName(classId), honor: RANK_HONOR(r.rank), detail: `Bảng xếp hạng Đấu trường “${s.title}”` }));
    return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupId, cup.data, seasonId, board.data, seasons.data, classes.data, classId]);

  if (cup.isLoading || board.isLoading || seasons.isLoading) return <Loading />;
  const shown = list.filter((r) => !skip.has(r.userId));
  return (
    <div className="tc-page tc-certpage">
      <div className="tc-noprint tc-stack">
        <div className="tc-row tc-wrap">
          <h1 className="tc-h2">In giấy khen Đấu trường</h1>
          <span className="tc-spacer" />
          <Link className="tc-btn tc-btn--ghost" to={cupId ? `/dau-truong/giai/${cupId}` : '/dau-truong?the=xep-hang'}><span>Quay lại</span></Link>
          <Btn kind="primary" icon="print" disabled={!shown.length} onClick={() => window.print()} data-testid="cert-print">In {shown.length} giấy khen</Btn>
        </div>
        {!list.length ? <Empty icon="trophy" title="Chưa có ai để khen">Giải cần kết thúc (có Vô địch), hoặc bảng xếp hạng cần có bạn đạt điểm.</Empty> : (
          <>
            <div className="tc-grid2">
              <Field label="Tên trường"><input className="tc-input" value={schoolName} onChange={(e) => setF({ ...f, school: e.target.value })} placeholder="TRƯỜNG TIỂU HỌC …" /></Field>
              <Field label="Địa danh, ngày tháng"><div className="tc-row"><input className="tc-input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Địa danh" /><input className="tc-input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div></Field>
              <Field label="Chức danh người kí"><input className="tc-input" value={f.signerRole} onChange={(e) => setF({ ...f, signerRole: e.target.value })} /></Field>
              <Field label="Họ tên người kí"><input className="tc-input" value={f.signer} onChange={(e) => setF({ ...f, signer: e.target.value })} /></Field>
            </div>
            <div className="tc-row tc-wrap" role="group" aria-label="Chọn học sinh để in">
              {list.map((r) => (
                <label key={r.userId} className="tc-switch tc-small">
                  <input type="checkbox" checked={!skip.has(r.userId)} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(r.userId)) n.delete(r.userId); else n.add(r.userId); return n; })} />
                  {r.name} ({r.honor.toLowerCase()})
                </label>
              ))}
            </div>
            <p className="tc-small tc-muted">Mẹo: chọn khổ A4, hướng ngang, tỉ lệ 100%; bật "In hình nền" để in viền màu.</p>
          </>
        )}
      </div>
      <div className="tc-certs">
        {shown.map((r) => (
          <article key={r.userId} className="tc-cert" data-testid="cert">
            <div className="tc-cert__top">
              <div className="tc-cert__school">{schoolName.toUpperCase() || ' '}</div>
              <div className="tc-cert__nation"><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><span>Độc lập – Tự do – Hạnh phúc</span></div>
            </div>
            <div className="tc-cert__cup" aria-hidden="true">🏆</div>
            <h2 className="tc-cert__title">GIẤY KHEN</h2>
            <p className="tc-cert__by">{f.signerRole.toUpperCase()} khen tặng</p>
            <p className="tc-cert__name">Em: <b>{r.name}</b>{r.className ? <> &nbsp;·&nbsp; Lớp: <b>{r.className}</b></> : null}</p>
            <p className="tc-cert__honor">Đã đạt <b>{r.honor}</b></p>
            <p className="tc-cert__detail">{r.detail}</p>
            <div className="tc-cert__sign">
              <p><i>{f.place ? `${f.place}, ` : ''}{f.date}</i></p>
              <p><b>{f.signerRole.toUpperCase()}</b></p>
              <p className="tc-cert__space" />
              <p><b>{f.signer}</b></p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
