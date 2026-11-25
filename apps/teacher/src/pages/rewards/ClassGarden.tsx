/**
 * Vườn lớp (GV): xem tiến độ tuần, đặt mục tiêu sao + loại cây, mở màn hình TV; tặng "Huy hiệu của cô".
 */
import { useEffect, useState } from 'react';
import { BADGE_CATEGORIES, PLANTS, TEACHER_BADGE_GLYPHS, type BadgeGlyph, type PlantKind, type Profile } from '@openedu/contracts';
import { defaultGoalTarget, useClassGarden, useGardenTvKey, useGrantTeacherBadge, useRevokeTeacherBadge, useSetGardenGoal, useTeacherBadges } from '@openedu/data';
import { BadgeArt, GardenScene, Icon, Plant } from '@openedu/ui';
import { Btn, ConfirmBar, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { relTime } from '../../lib/format';
import '@openedu/ui/rewards.css';
import '../../styles/rewards.css';

function presentGardenUrl(classId: string, key?: string): string {
  const v = (import.meta.env as Record<string, unknown>).VITE_PRESENT_URL;
  const base = typeof v === 'string' && v.trim() ? v.trim() : `http://${typeof location !== 'undefined' ? location.hostname : 'localhost'}:5175/`;
  try {
    const u = new URL('vuon-lop', base.endsWith('/') ? base : base + '/');
    u.searchParams.set('lop', classId);
    if (key) u.searchParams.set('ma', key);
    return u.toString();
  } catch { return `${base}vuon-lop?lop=${encodeURIComponent(classId)}${key ? `&ma=${key}` : ''}`; }
}

/**
 * Nút "Mở trên TV": link mang khóa TV của lớp — màn hình lớp xem được mà không cần đăng nhập (chỉ tổng sao,
 * không tên HS). "Đổi link": khóa mới, link TV cũ ngừng hoạt động.
 */
function TvLink({ classId }: { classId: string }) {
  const key = useGardenTvKey();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => { setUrl(''); setCopied(false); setSure(false); }, [classId]);
  const open = (renew = false) => {
    // Mở cửa sổ ngay khi bấm (trình duyệt chặn cửa sổ mở sau khi chờ mạng), rồi gán địa chỉ.
    const w = renew ? null : window.open('about:blank', '_blank');
    key.mutate({ classId, renew }, {
      onSuccess: (k) => { const u = presentGardenUrl(classId, k); setUrl(u); setCopied(false); setSure(false); if (w) w.location.href = u; },
      onError: () => w?.close(),
    });
  };
  return (
    <>
      <Btn icon="tv" onClick={() => open()} disabled={!classId || key.isPending} data-testid="garden-tv-open">Mở trên TV</Btn>
      {url && (
        <span className="tc-row tc-garden__tvlink" data-testid="garden-tv-link">
          <Btn size="sm" onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)); }}>{copied ? 'Đã chép link' : 'Chép link TV'}</Btn>
          <Btn size="sm" kind={sure ? 'danger' : 'ghost'} onClick={() => (sure ? open(true) : setSure(true))} title="Màn hình đang mở link cũ sẽ ngừng hiện Vườn lớp">{sure ? 'Bấm lần nữa: link cũ ngừng hoạt động' : 'Đổi link'}</Btn>
        </span>
      )}
      {key.error ? <ErrorNote error={key.error} /> : null}
    </>
  );
}

const PINK = BADGE_CATEGORIES.find((c) => c.id === 'cua-co')?.color ?? '#ff5d8f';
const GLYPH_NAME: Partial<Record<BadgeGlyph, string>> = { heart: 'Trái tim', star: 'Ngôi sao', flower: 'Bông hoa', cup: 'Cúp', rainbow: 'Cầu vồng', sun: 'Mặt trời' };

export default function ClassGardenTeacher({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const garden = useClassGarden(classId || undefined);
  const setGoal = useSetGardenGoal();
  const g = garden.data;
  const [target, setTarget] = useState(0);
  const [plant, setPlant] = useState<PlantKind>('huong-duong');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (g) { setTarget(g.goal.targetStars); setPlant(g.goal.plant); } }, [g?.classId, g?.goal.targetStars, g?.goal.plant]);

  if (classes.isLoading) return <Loading />;
  if (!cls) return <Empty icon="team" title="Chưa có lớp">Khi thầy cô có lớp, Vườn lớp sẽ hiện ở đây.</Empty>;

  return (
    <div className="tc-page tc-garden">
      <PageHead title="Vườn lớp" sub="Sao cả lớp kiếm trong tuần tưới cây chung. Học sinh chỉ thấy cây của mình và tổng lớp — không có bảng xếp hạng."
        actions={<>
          <ClassPicker list={list} value={classId} onChange={setClassId} />
          <TvLink classId={classId} />
        </>} />
      {garden.isLoading ? <Loading /> : garden.error ? <ErrorNote error={garden.error} onRetry={() => void garden.refetch()} /> : g ? (
        <div className="tc-garden__grid">
          <div className="k-shell k-shell--plain tc-garden__scene"><GardenScene garden={g} variant="teacher" /></div>
          <aside className="tc-garden__side">
            <section className="tc-card">
              <h2 className="tc-garden__h">Mục tiêu tuần này</h2>
              <form onSubmit={(e) => { e.preventDefault(); setGoal.mutate({ classId, targetStars: target, plant }, { onSuccess: () => setSaved(true) }); }}>
                <Field label="Số sao cả lớp cần đạt" help={`Gợi ý: ${defaultGoalTarget(g.studentCount)} sao (25 sao × ${g.studentCount} học sinh).`}>
                  <input className="tc-input tc-input--num" type="number" min={10} max={5000} step={10} value={target || ''} onChange={(e) => { setSaved(false); setTarget(Number(e.target.value)); }} />
                </Field>
                <Field label="Cây sẽ nở hoa khi đạt mục tiêu">
                  <div className="tc-garden__plants" role="radiogroup" aria-label="Chọn cây">
                    {PLANTS.map((p) => (
                      <button key={p.id} type="button" role="radio" aria-checked={plant === p.id} className={`tc-garden__plant${plant === p.id ? ' is-on' : ''}`} onClick={() => { setSaved(false); setPlant(p.id); }} title={p.name}>
                        <Plant kind={p.id} stage={4} size={44} /><span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="tc-row">
                  <Btn kind="primary" type="submit" disabled={setGoal.isPending || target < 10}>{setGoal.isPending ? 'Đang lưu…' : 'Lưu mục tiêu'}</Btn>
                  {saved && <span className="tc-chip tc-chip--ok">Đã lưu</span>}
                  {!g.goal.custom && <span className="tc-small tc-muted">Đang dùng mục tiêu mặc định</span>}
                </div>
                <ErrorNote error={setGoal.error} />
              </form>
            </section>
            <section className="tc-card">
              <h2 className="tc-garden__h">Bộ sưu tập</h2>
              {g.collection.length ? <div className="tc-garden__pots">{g.collection.map((c) => <span key={c.weekStart} title={new Date(c.weekStart).toLocaleDateString('vi-VN')}><Plant kind={c.plant} stage={4} size={44} /></span>)}</div>
                : <p className="tc-muted">Tuần nào cả lớp đạt mục tiêu, một chậu hoa được cất vào đây.</p>}
            </section>
          </aside>
        </div>
      ) : null}
      <TeacherBadges classId={classId} cls={cls} />
    </div>
  );
}

function TeacherBadges({ classId, cls }: { classId: string; cls: NonNullable<ReturnType<typeof useClassPick>['cls']> }) {
  const { roster } = useRoster(cls);
  const given = useTeacherBadges(classId);
  const grant = useGrantTeacherBadge();
  const revoke = useRevokeTeacherBadge();
  const [askRevoke, setAskRevoke] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [glyph, setGlyph] = useState<BadgeGlyph>('heart');
  const [done, setDone] = useState('');
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const name = (id: string) => roster.find((r) => r.id === id)?.name ?? '';
  return (
    <section className="tc-card tc-tbadge">
      <h2 className="tc-garden__h">Huy hiệu của cô</h2>
      <p className="tc-muted tc-small">Tặng riêng một huy hiệu kèm lời khen. Học sinh sẽ thấy màn chúc mừng khi mở app.</p>
      <div className="tc-tbadge__grid">
        <div>
          <Field label="Tên huy hiệu (tối đa 40 kí tự)"><input className="tc-input" maxLength={40} value={title} placeholder="Ví dụ: Bạn nhỏ đọc to, rõ ràng" onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Biểu tượng">
            <div className="tc-tbadge__glyphs" role="radiogroup" aria-label="Biểu tượng">
              {TEACHER_BADGE_GLYPHS.map((gl) => (
                <button key={gl} type="button" role="radio" aria-checked={glyph === gl} className={`tc-tbadge__glyph${glyph === gl ? ' is-on' : ''}`} onClick={() => setGlyph(gl)} title={GLYPH_NAME[gl]}>
                  <BadgeArt glyph={gl} color={PINK} tier={2} size={48} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Lời khen (không bắt buộc)"><input className="tc-input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hôm nay em đọc bài rất hay!" /></Field>
        </div>
        <div>
          <span className="tc-field__label">Tặng cho ({sel.size} học sinh)</span>
          <div className="tc-tbadge__students">
            {roster.map((s) => (
              <label key={s.id} className={`tc-tbadge__st${sel.has(s.id) ? ' is-on' : ''}`}><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} /> {s.name}</label>
            ))}
          </div>
        </div>
      </div>
      <div className="tc-row">
        <Btn kind="primary" disabled={!title.trim() || !sel.size || grant.isPending} onClick={() => grant.mutate({ classId, studentIds: [...sel], title, glyph, note }, {
          onSuccess: (r) => { setDone(`Đã tặng “${title.trim()}” cho ${r.length} học sinh.`); setSel(new Set()); setTitle(''); setNote(''); },
        })}>Tặng huy hiệu</Btn>
        {done && <span className="tc-chip tc-chip--ok">{done}</span>}
      </div>
      <ErrorNote error={grant.error ?? revoke.error} />
      {(given.data ?? []).length > 0 && (
        <ul className="tc-tbadge__list">
          {(given.data ?? []).slice(0, showAll ? undefined : 12).map((b) => (
            <li key={b.id}>
              <BadgeArt glyph={b.glyph ?? 'heart'} color={PINK} tier={2} size={36} /><span><strong>{b.title}</strong> — {name(b.userId)}{b.note ? ` · “${b.note}”` : ''}</span><span className="tc-muted tc-small">{relTime(b.earnedAt)}{b.seen ? ' · em đã xem' : ''}</span>
              {askRevoke === b.id ? (
                <ConfirmBar text={`Thu hồi “${b.title}” của ${name(b.userId)}?`} confirmLabel="Thu hồi" busy={revoke.isPending} onCancel={() => setAskRevoke(null)} onConfirm={() => revoke.mutate({ id: b.id, classId }, { onSuccess: () => setAskRevoke(null) })} />
              ) : <Btn size="sm" kind="ghost" icon="trash" aria-label={`Thu hồi huy hiệu ${b.title} của ${name(b.userId)}`} title="Thu hồi (tặng nhầm)" onClick={() => setAskRevoke(b.id)} data-testid="tbadge-revoke" />}
            </li>
          ))}
        </ul>
      )}
      {(given.data ?? []).length > 12 && !showAll ? <Btn size="sm" kind="ghost" onClick={() => setShowAll(true)}>Xem tất cả {(given.data ?? []).length} huy hiệu đã tặng</Btn> : null}
    </section>
  );
}
