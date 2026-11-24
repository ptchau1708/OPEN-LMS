import { useState } from 'react';
import type { ClassInfo, Profile } from '@openedu/contracts';
import {
  COMMON_ROOM, discussionProblem, DISCUSSION_MAX_ROOMS, DISCUSSION_MAX_TABS, roomsFromTeams, slugId, TAB_COLORS, useSaveDiscussion,
  type Discussion, type DiscussionInput,
} from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field, Seg } from '../../components/common';
import { teamsFor, useTeamsStore } from '../../lib/teams';
import { cx } from '../../lib/format';

/** datetime-local ↔ ISO (giờ máy). */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** Tạo / sửa phòng thảo luận: lời dẫn, duyệt bài, giờ mở, PHÒNG NHỎ (ai vào phòng nào), TAB đăng bài kiểu Padlet. */
export function DiscussEditor({ value, cls, roster, onClose, onSaved }: {
  value: DiscussionInput | Discussion; cls: ClassInfo; roster: Profile[]; onClose: () => void; onSaved: (d: Discussion) => void;
}) {
  const [d, setD] = useState<DiscussionInput>(() => JSON.parse(JSON.stringify(value)) as DiscussionInput);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const save = useSaveDiscussion();
  const localTeams = useTeamsStore((s) => s.byClass);
  const set = (p: Partial<DiscussionInput>) => setD((x) => ({ ...x, ...p }));
  const problem = discussionProblem(d);
  const teams = teamsFor(cls, localTeams).filter((t) => t.studentIds.length);
  const name = (id: string) => roster.find((s) => s.id === id)?.name ?? 'HS';

  const addRoom = () => set({ rooms: [...d.rooms, { id: slugId(`Phòng ${d.rooms.length}`, d.rooms.map((r) => r.id), 'phong'), name: `Phòng ${d.rooms.length}`, members: [] }] });
  const addTab = () => {
    const nm = `Tab ${d.tabs.length + 1}`;
    set({ tabs: [...d.tabs, { id: slugId(nm, d.tabs.map((t) => t.id)), name: nm, color: TAB_COLORS[d.tabs.length % TAB_COLORS.length] }] });
  };
  const moveTab = (i: number, dir: -1 | 1) => {
    const t = [...d.tabs];
    const j = i + dir;
    if (j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j], t[i]];
    set({ tabs: t });
  };
  const toggleMember = (roomId: string, uid: string) => set({
    rooms: d.rooms.map((r) => (r.id !== roomId ? r : { ...r, members: r.members.includes(uid) ? r.members.filter((x) => x !== uid) : [...r.members, uid] })),
  });

  return (
    <Dialog open wide title={`${'id' in d && d.id ? 'Sửa' : 'Tạo'} ${d.kind === 'chat' ? 'phòng trò chuyện nhóm' : 'bảng thảo luận'}`} onClose={onClose} footer={<>
      {problem ? <span className="tc-small tc-warn">{problem}</span> : null}
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" icon="check" disabled={!!problem || save.isPending} onClick={() => save.mutate(d, { onSuccess: onSaved })} data-testid="dc-save">{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
    </>}>
      <div className="tc-stack tc-dceditor">
        <Field label="Tên phòng (chủ đề)"><input className="tc-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Vd: Em làm gì để bảo vệ môi trường?" data-testid="dc-title" /></Field>
        {d.kind === 'chat' ? <p className="tc-alert tc-alert--info"><span>Mỗi nhóm (phòng nhỏ) nhắn tin với nhau, GV xem được mọi nhóm. Phòng mới tạo đang <b>khóa</b>: khi bắt đầu hoạt động nhóm, bấm <b>Mở 15 phút</b> trên trang phòng.</span></p> : null}
        <Field label="Lời dẫn / câu hỏi cho học sinh"><textarea className="tc-input" rows={3} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="Các em kể một việc… Có thể chụp ảnh gửi kèm." /></Field>
        <div className="tc-row tc-wrap">
          <Seg label="Duyệt bài" value={d.moderation} onChange={(v) => set({ moderation: v })} options={[{ value: 'pre', label: 'Duyệt trước khi hiện' }, { value: 'post', label: 'Hiện ngay (GV ẩn sau)' }]} />
          {d.kind !== 'chat' ? <label className="tc-row tc-small"><input type="checkbox" checked={d.hideOthers} onChange={(e) => set({ hideOthers: e.target.checked })} /> Em chỉ thấy bài bạn sau khi đã đăng bài</label> : null}
          <label className="tc-row tc-small"><input type="checkbox" checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} /> Ghim lên đầu</label>
          {'id' in d && d.id ? <label className="tc-row tc-small"><input type="checkbox" checked={d.archived} onChange={(e) => set({ archived: e.target.checked })} /> Lưu trữ (HS không thấy nữa)</label> : null}
        </div>
        <div className="tc-row tc-wrap">
          <Field label="Mở lúc (bỏ trống = mở ngay)"><input className="tc-input" type="datetime-local" value={toLocal(d.opensAt)} onChange={(e) => set({ opensAt: fromLocal(e.target.value) })} /></Field>
          <Field label="Đóng lúc (bỏ trống = không đóng)"><input className="tc-input" type="datetime-local" value={toLocal(d.closesAt)} onChange={(e) => set({ closesAt: fromLocal(e.target.value) })} /></Field>
        </div>

        <section className="tc-card tc-card--flat tc-stack">
          <div className="tc-row tc-wrap">
            <h3 className="tc-h3" style={{ margin: 0 }}>{d.kind === 'chat' ? 'Nhóm' : 'Phòng nhỏ'} ({d.rooms.length}/{DISCUSSION_MAX_ROOMS})</h3>
            <span className="tc-ebar__spacer" />
            {teams.length ? <Btn size="sm" onClick={() => set({ rooms: d.kind === 'chat' ? roomsFromTeams(teams).slice(1) : roomsFromTeams(teams) })} data-testid="dc-rooms-teams">Chia theo {teams.length} tổ của lớp</Btn> : null}
            <Btn size="sm" icon="plus" disabled={d.rooms.length >= DISCUSSION_MAX_ROOMS} onClick={addRoom} data-testid="dc-room-add">Thêm phòng nhỏ</Btn>
          </div>
          <p className="tc-small tc-muted">Phòng không chọn thành viên thì cả lớp vào được. Mỗi phòng nhỏ có đủ các tab bên dưới. GV thấy mọi phòng.</p>
          <ul className="tc-dcrooms">
            {d.rooms.map((r, i) => (
              <li key={r.id}>
                <div className="tc-row tc-wrap">
                  <input className="tc-input tc-input--sm" aria-label={`Tên phòng nhỏ ${i + 1}`} value={r.name} onChange={(e) => set({ rooms: d.rooms.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} />
                  <span className="tc-small tc-muted">{r.members.length ? `${r.members.length} em` : 'Cả lớp'}</span>
                  <Btn size="sm" kind="ghost" onClick={() => setPickFor(pickFor === r.id ? null : r.id)} aria-expanded={pickFor === r.id}>Chọn thành viên</Btn>
                  {d.rooms.length > 1 && r.id !== COMMON_ROOM.id ? <Btn size="sm" kind="ghost" icon="trash" aria-label={`Bỏ phòng ${r.name}`} onClick={() => set({ rooms: d.rooms.filter((x) => x.id !== r.id) })} /> : null}
                </div>
                {r.members.length && pickFor !== r.id ? <p className="tc-small tc-muted">{r.members.map(name).join(', ')}</p> : null}
                {pickFor === r.id ? (
                  <div className="tc-chips tc-dcmembers">
                    {roster.map((s) => <button key={s.id} type="button" aria-pressed={r.members.includes(s.id)} className={cx('tc-chipbtn', r.members.includes(s.id) && 'is-on')} onClick={() => toggleMember(r.id, s.id)}>{s.name}</button>)}
                    {r.members.length ? <Btn size="sm" kind="ghost" onClick={() => set({ rooms: d.rooms.map((x) => (x.id === r.id ? { ...x, members: [] } : x)) })}>Bỏ chọn (cả lớp)</Btn> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {d.kind !== 'chat' ? <section className="tc-card tc-card--flat tc-stack">
          <div className="tc-row tc-wrap">
            <h3 className="tc-h3" style={{ margin: 0 }}>Tab đăng bài ({d.tabs.length}/{DISCUSSION_MAX_TABS})</h3>
            <span className="tc-ebar__spacer" />
            <Btn size="sm" icon="plus" disabled={d.tabs.length >= DISCUSSION_MAX_TABS} onClick={addTab} data-testid="dc-tab-add">Thêm tab</Btn>
          </div>
          <p className="tc-small tc-muted">Như các cột trên Padlet: HS chọn tab rồi đăng bài vào tab đó (vd “Ý kiến”, “Câu hỏi”, “Hình ảnh sản phẩm”).</p>
          <ul className="tc-dctabs">
            {d.tabs.map((t, i) => (
              <li key={t.id} className="tc-row">
                <input type="color" aria-label={`Màu tab ${t.name}`} value={t.color} onChange={(e) => set({ tabs: d.tabs.map((x) => (x.id === t.id ? { ...x, color: e.target.value } : x)) })} />
                <input className="tc-input tc-input--sm tc-grow" aria-label={`Tên tab ${i + 1}`} value={t.name} onChange={(e) => set({ tabs: d.tabs.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} />
                <Btn size="sm" kind="ghost" aria-label="Lên" disabled={i === 0} onClick={() => moveTab(i, -1)}>↑</Btn>
                <Btn size="sm" kind="ghost" aria-label="Xuống" disabled={i === d.tabs.length - 1} onClick={() => moveTab(i, 1)}>↓</Btn>
                {d.tabs.length > 1 ? <Btn size="sm" kind="ghost" icon="trash" aria-label={`Bỏ tab ${t.name}`} onClick={() => set({ tabs: d.tabs.filter((x) => x.id !== t.id) })} /> : null}
              </li>
            ))}
          </ul>
          <p className="tc-small tc-muted">Bỏ tab đã có bài thì các bài đó tạm ẩn khỏi bảng (không mất) — thêm lại tab cùng tên để hiện lại.</p>
        </section> : null}
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  );
}
