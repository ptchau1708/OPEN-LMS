/** Cài đặt Đấu trường của lớp: bật / tắt, kiểu chơi, phạm vi ghép đấu, nguồn câu, giờ mở cửa, tên mùa. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ArenaHours, ArenaMode, ArenaScope, ArenaSettings, ClassInfo } from '@openedu/contracts';
import { arenaOpenAt, DAY_SHORT, hoursText, nextOpening, openingText, useArenaSettings, useItemsByIds, useSaveArenaSettings } from '@openedu/data';
import { Btn, ErrorNote, Field, Loading, Seg } from '../../components/common';
import { cx } from '../../lib/format';
import { GroupField } from './shared';

const PRESETS: { label: string; hours: ArenaHours[] }[] = [
  { label: 'Trong giờ học (T2–T6 7:00–17:00)', hours: [{ days: [1, 2, 3, 4, 5], from: '07:00', to: '17:00' }] },
  { label: 'Buổi tối (T2–T6 19:00–21:00)', hours: [{ days: [1, 2, 3, 4, 5], from: '19:00', to: '21:00' }] },
  { label: 'Cuối tuần (T7, CN 8:00–20:00)', hours: [{ days: [6, 7], from: '08:00', to: '20:00' }] },
];

export function ArenaSettingsPanel({ cls }: { cls: ClassInfo }) {
  const q = useArenaSettings(cls.id);
  const save = useSaveArenaSettings();
  const [draft, setDraft] = useState<ArenaSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setDraft(q.data); }, [q.data]);
  const pool = useItemsByIds(draft?.source === 'picked' || (draft?.itemIds.length ?? 0) > 0 ? draft?.itemIds.slice(0, 200) : []);
  if (q.isLoading || !draft) return q.error ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : <Loading />;
  const set = (p: Partial<ArenaSettings>) => { setDraft({ ...draft, ...p }); setSaved(false); };
  const setHour = (i: number, p: Partial<ArenaHours>) => set({ hours: draft.hours.map((w, k) => (k === i ? { ...w, ...p } : w)) });
  const toggleMode = (m: ArenaMode) => set({ modes: draft.modes.includes(m) ? draft.modes.filter((x) => x !== m) : [...draft.modes, m] });
  const open = draft.enabled && arenaOpenAt(draft.hours);
  const next = nextOpening(draft.hours);
  const bad = draft.hours.some((w) => !w.days.length || !w.from || !w.to || w.from >= w.to);
  const submit = () => save.mutate({ classId: cls.id, patch: {
    enabled: draft.enabled, scope: draft.scope, source: draft.source, itemIds: draft.itemIds, hours: draft.hours, modes: draft.modes,
    seasonTitle: draft.seasonTitle ?? '',
  } }, { onSuccess: () => setSaved(true) });

  return (
    <div className="tc-stack tc-arenaset" data-testid="arena-settings">
      <div className={cx('tc-alert', open ? 'tc-alert--ok' : 'tc-alert--warn')} role="status">
        <span>
          {!draft.enabled ? 'Đấu trường của lớp đang TẮT — học sinh chỉ xem được giải đấu và bảng xếp hạng.'
            : open ? `Đấu trường đang MỞ (${hoursText(draft.hours)}).`
              : `Đấu trường đang ĐÓNG — ${next ? `mở lại lúc ${openingText(next)}` : 'chưa có giờ mở'} (${hoursText(draft.hours)}).`}
          {' '}Giải đấu có khung giờ riêng của từng vòng.
        </span>
      </div>
      <label className="tc-switch"><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="arena-enabled" /> Mở Đấu trường cho lớp {cls.name} (Đấu 1–1, Leo tháp)</label>
      <GroupField label="Kiểu chơi tự do">
        <div className="tc-row tc-wrap">
          <label className="tc-switch"><input type="checkbox" checked={draft.modes.includes('duel')} onChange={() => toggleMode('duel')} /> Đấu 1–1</label>
          <label className="tc-switch"><input type="checkbox" checked={draft.modes.includes('tower')} onChange={() => toggleMode('tower')} /> Leo tháp</label>
        </div>
      </GroupField>
      <GroupField label="Đấu 1–1: ghép với ai" help="Cả khối: các em ghép được với bạn lớp khác cùng khối (lớp bạn ấy cũng phải chọn cả khối). Thách đấu và mã phòng vẫn dùng được như cũ.">
        <Seg label="Phạm vi ghép đấu" value={draft.scope} onChange={(v: ArenaScope) => set({ scope: v })} options={[
          { value: 'class', label: `Trong lớp ${cls.name}` }, { value: 'grade', label: `Cả khối ${cls.grade}` },
        ]} />
      </GroupField>
      <GroupField label="Câu hỏi khi chơi tự do">
        <Seg label="Nguồn câu" value={draft.source} onChange={(v) => set({ source: v })} options={[
          { value: 'auto', label: 'Tự động theo môn, khối' }, { value: 'picked', label: `Chỉ câu thầy cô đưa vào (${draft.itemIds.length})` },
        ]} />
      </GroupField>
      <div className="tc-arenapool">
        <p className="tc-small">
          <b>Bộ câu Đấu trường của lớp: {draft.itemIds.length} câu.</b> Thêm câu: vào <Link to="/ngan-hang">Ngân hàng câu hỏi</Link>, tích chọn câu → <b>Đưa vào Đấu trường</b>.
          {draft.source === 'picked' && draft.itemIds.length < 7 ? <b className="tc-warn"> Nên có ít nhất 7 câu mỗi môn để Đấu 1–1 đủ câu.</b> : null}
        </p>
        {draft.itemIds.length ? (
          <details>
            <summary className="tc-small">Xem / bớt câu</summary>
            <ul className="tc-arenapool__list">
              {Object.values(pool.data ?? {}).map((it) => (
                <li key={it.id}>
                  <span className="tc-small">{it.prompt.text.slice(0, 90)}</span>
                  <Btn size="sm" kind="ghost" icon="trash" aria-label="Bớt câu này" onClick={() => set({ itemIds: draft.itemIds.filter((x) => x !== it.id) })} />
                </li>
              ))}
            </ul>
            <Btn size="sm" kind="ghost" onClick={() => set({ itemIds: [] })}>Bớt hết</Btn>
          </details>
        ) : null}
      </div>
      <GroupField label="Giờ mở cửa (giờ Việt Nam)" help="Không có khung giờ nào = luôn mở. Ngoài giờ, học sinh vẫn xem được giải đấu và bảng xếp hạng.">
        <div className="tc-stack">
          {draft.hours.map((w, i) => (
            <div key={i} className="tc-row tc-wrap tc-hourrow" data-testid="arena-hour">
              <div className="tc-row tc-daychips" role="group" aria-label="Ngày trong tuần">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button key={d} type="button" className={cx('tc-daychip', w.days.includes(d) && 'is-on')} aria-pressed={w.days.includes(d)}
                    onClick={() => setHour(i, { days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })}>{DAY_SHORT[d]}</button>
                ))}
              </div>
              <input className="tc-input" type="time" value={w.from} onChange={(e) => setHour(i, { from: e.target.value })} aria-label="Từ giờ" />
              <span>–</span>
              <input className="tc-input" type="time" value={w.to} onChange={(e) => setHour(i, { to: e.target.value })} aria-label="Đến giờ" />
              <Btn size="sm" kind="ghost" icon="trash" aria-label="Bỏ khung giờ" onClick={() => set({ hours: draft.hours.filter((_, k) => k !== i) })} />
            </div>
          ))}
          <div className="tc-row tc-wrap">
            <Btn size="sm" icon="plus" onClick={() => set({ hours: [...draft.hours, { days: [1, 2, 3, 4, 5], from: '19:00', to: '21:00' }] })} data-testid="arena-hour-add">Thêm khung giờ</Btn>
            {PRESETS.map((p) => <Btn key={p.label} size="sm" kind="ghost" onClick={() => set({ hours: [...draft.hours, ...p.hours] })}>+ {p.label}</Btn>)}
            {draft.hours.length ? <Btn size="sm" kind="ghost" onClick={() => set({ hours: [] })}>Luôn mở</Btn> : null}
          </div>
          {bad ? <p className="tc-small tc-warn">Mỗi khung giờ cần chọn ngày và giờ bắt đầu trước giờ kết thúc.</p> : null}
        </div>
      </GroupField>
      <Field label="Tên mùa xếp hạng hiện tại" help="Ví dụ: Mùa học kì I. Kết thúc mùa ở thẻ Bảng xếp hạng.">
        <input className="tc-input" value={draft.seasonTitle ?? ''} maxLength={80} onChange={(e) => set({ seasonTitle: e.target.value })} placeholder="Mùa hiện tại" />
      </Field>
      <ErrorNote error={save.error} />
      <div className="tc-row">
        <Btn kind="primary" icon="check" disabled={bad || save.isPending} onClick={submit} data-testid="arena-save">{save.isPending ? 'Đang lưu…' : 'Lưu cài đặt'}</Btn>
        {saved ? <span className="tc-small" role="status">Đã lưu.</span> : null}
      </div>
    </div>
  );
}
