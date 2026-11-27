import { useState } from 'react';
import { MASCOTS, SUBJECTS, type ContentPackage, type GameKind, type Item, type Lesson, type MascotId, type Slide, type SlideLayout } from '@openedu/contracts';
import { Mascot, Media } from '@openedu/ui';
import { EMBED_PROVIDER_LABEL, toEmbed } from '@openedu/lesson-player';
import { useStudents } from '@openedu/data';
import { useClasses } from '../../lib/focusGrade';
import { Btn, Field, Seg } from '../../components/common';
import { TypeBadge } from '../../components/items';
import { cx, LAYOUTS, shorten } from '../../lib/format';

export const KID_EMOJI = ['🍎', '🍊', '🍌', '🍇', '🍉', '🍓', '🥕', '🌽', '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐟', '🐢', '🦋', '🐝', '🌸', '🌻', '🌳', '🌈', '☀️', '🌙', '⭐', '☁️', '💧', '🔥', '🏠', '🏫', '🚌', '🚲', '✈️', '⚽', '🎈', '🎁', '📚', '✏️', '🎨', '🎵', '⏰', '👋', '👍', '❤️', '➕', '➖', '🔢', '📘'];

function ImageField({ value, onChange, label = 'Ảnh' }: { value?: string; onChange: (v: string | undefined) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const isEmoji = value?.startsWith('emoji:');
  return (
    <div className="tc-field">
      <span className="tc-field__label">{label}</span>
      <div className="tc-imgfield">
        <span className="tc-imgfield__prev">{value ? <Media src={value} alt="" size={isEmoji ? 26 : 40} fit="cover" /> : null}</span>
        <input className="tc-input" placeholder="Dán URL ảnh (https://…)" value={value && !isEmoji ? value : ''} onChange={(e) => onChange(e.target.value.trim() || undefined)} spellCheck={false} />
        <Btn size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Emoji</Btn>
        {value ? <Btn size="sm" kind="ghost" icon="close" aria-label="Bỏ ảnh" onClick={() => onChange(undefined)} /> : null}
      </div>
      {open ? (
        <div className="tc-emojigrid" role="listbox" aria-label="Chọn emoji">
          {KID_EMOJI.map((e) => (
            <button key={e} type="button" role="option" aria-selected={value === `emoji:${e}`} onClick={() => { onChange(`emoji:${e}`); setOpen(false); }}>{e}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MascotPicker({ value, onChange }: { value?: MascotId; onChange: (m: MascotId | undefined) => void }) {
  return (
    <div className="tc-field">
      <span className="tc-field__label">Linh vật</span>
      <div className="tc-mascotgrid">
        {MASCOTS.map((m) => (
          <button key={m.id} type="button" aria-pressed={value === m.id} title={`${m.name} (${m.country})`} onClick={() => onChange(value === m.id ? undefined : m.id)}>
            <Mascot id={m.id} size={38} title="" />
            <small>{m.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface SlidePanelProps {
  lesson: Lesson;
  slide: Slide;
  items: Record<string, Item>;
  packages: ContentPackage[];
  classId?: string;
  onChange: (s: Slide) => void;
  onPickItem: (target: 'slide' | { videoQ: number }) => void;
  onNewItem: () => void;
  onEditItem: (it: Item) => void;
  onImportPackage: () => void;
}

export function SlidePanel({ lesson, slide, items, packages, classId, onChange, onPickItem, onNewItem, onEditItem, onImportPackage }: SlidePanelProps) {
  const up = (patch: Partial<Slide>) => {
    const next = { ...slide, ...patch } as Slide;
    (Object.keys(patch) as (keyof Slide)[]).forEach((k) => { if (next[k] === undefined || next[k] === '') delete next[k]; });
    onChange(next);
  };
  const L = slide.layout;
  const item = slide.item ?? (slide.itemId ? items[slide.itemId] : undefined);
  const classes = useClasses(lesson.ownerId);
  const cls = classes.data?.find((c) => c.id === classId) ?? classes.data?.[0];
  const students = useStudents(cls?.id);
  const cols = slide.columns ?? [{ title: 'Bên trái' }, { title: 'Bên phải' }];
  const setCol = (i: 0 | 1, patch: Partial<(typeof cols)[0]>) => {
    const next: [typeof cols[0], typeof cols[1]] = [{ ...cols[0] }, { ...cols[1] }];
    next[i] = { ...next[i], ...patch };
    up({ columns: next });
  };
  const vq = slide.video?.questions ?? [];

  return (
    <div className="tc-props">
      <section className="tc-props__sec">
        <Field label="Bố cục">
          <select className="tc-input" value={L} onChange={(e) => up({ layout: e.target.value as SlideLayout })}>
            {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label} — {l.hint}</option>)}
          </select>
        </Field>
        <Field label={L === 'activity' ? 'Tiêu đề (lời dẫn)' : 'Tiêu đề'}>
          <input className="tc-input" value={slide.title ?? ''} onChange={(e) => up({ title: e.target.value })} placeholder="Ngắn, dễ đọc" />
        </Field>
        {L !== 'package' ? (
          <Field label="Nội dung" help="Xuống dòng để tách ý; **chữ đậm** đặt giữa hai dấu sao.">
            <textarea className="tc-input" rows={L === 'summary' || L === 'image-text' ? 5 : 3} value={slide.text ?? ''} onChange={(e) => up({ text: e.target.value })} />
          </Field>
        ) : null}
      </section>

      {L === 'title' || L === 'image-text' || (L === 'fullscreen' && !slide.video) ? (
        <section className="tc-props__sec"><ImageField value={slide.image} onChange={(v) => up({ image: v })} /></section>
      ) : null}

      {L === 'title' || L === 'summary' ? (
        <section className="tc-props__sec"><MascotPicker value={slide.mascot} onChange={(m) => up({ mascot: m })} /></section>
      ) : null}

      {L === 'fullscreen' ? (
        <section className="tc-props__sec">
          <h3>Video</h3>
          <Field label="Link YouTube hoặc MP4" help="Bỏ trống để dùng ảnh toàn màn hình.">
            <input className="tc-input" value={slide.video?.url ?? ''} spellCheck={false} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => up({ video: e.target.value.trim() ? { url: e.target.value.trim(), ...(vq.length ? { questions: vq } : {}) } : undefined })} />
          </Field>
          {slide.video ? (
            <div className="tc-field">
              <span className="tc-field__label">Câu hỏi chen (video tự dừng)</span>
              {vq.map((q, i) => (
                <div key={i} className="tc-vq">
                  <input className="tc-input tc-input--num" type="number" min={0} value={q.atSec} aria-label="Giây" onChange={(e) => up({ video: { url: slide.video!.url, questions: vq.map((x, j) => (j === i ? { ...x, atSec: Math.max(0, Number(e.target.value) || 0) } : x)) } })} />
                  <span className="tc-small tc-muted">giây</span>
                  <button type="button" className="tc-vq__item" onClick={() => onPickItem({ videoQ: i })}>{items[q.itemId] ? shorten(items[q.itemId].prompt.text, 40) : q.itemId ? 'Hoạt động (đang tải…)' : 'Chọn hoạt động…'}</button>
                  <Btn size="sm" kind="ghost" icon="trash" aria-label="Xóa câu hỏi chen" onClick={() => up({ video: { url: slide.video!.url, questions: vq.filter((_, j) => j !== i) } })} />
                </div>
              ))}
              <Btn size="sm" icon="plus" onClick={() => up({ video: { url: slide.video!.url, questions: [...vq, { atSec: vq.length ? vq[vq.length - 1].atSec + 30 : 30, itemId: '' }] } })}>Thêm câu hỏi chen</Btn>
            </div>
          ) : null}
        </section>
      ) : null}

      {L === 'fullscreen' && !slide.video ? <EmbedField value={slide.embed?.url ?? ''} onChange={(url) => up({ embed: url ? { url } : undefined })} /> : null}

      {L === 'activity' ? (
        <section className="tc-props__sec">
          <h3>Hoạt động</h3>
          {item ? (
            <div className="tc-itemcard">
              <TypeBadge type={item.type} />
              <p>{shorten(item.prompt.text, 140)}</p>
              <span className="tc-muted tc-small">{SUBJECTS[item.subject]?.name} · Lớp {item.grade}{item.key ? '' : ' · chưa có đáp án'}</span>
              <div className="tc-row tc-wrap">
                <Btn size="sm" kind="primary" icon="pencil" onClick={() => onEditItem(item)}>Sửa hoạt động</Btn>
                <Btn size="sm" onClick={() => onPickItem('slide')}>Đổi</Btn>
                <Btn size="sm" kind="ghost" onClick={() => up({ itemId: undefined, item: undefined })}>Bỏ</Btn>
              </div>
            </div>
          ) : slide.itemId ? <p className="tc-muted">Đang tải hoạt động…</p> : (
            <div className="tc-stack">
              <Btn kind="primary" icon="plus" onClick={onNewItem}>Tạo hoạt động mới</Btn>
              <Btn icon="puzzle" onClick={() => onPickItem('slide')}>Chọn từ ngân hàng</Btn>
            </div>
          )}
        </section>
      ) : null}

      {L === 'compare' ? (
        <section className="tc-props__sec">
          <h3>Hai cột</h3>
          {([0, 1] as const).map((i) => (
            <div key={i} className="tc-col-ed">
              <Field label={`Cột ${i + 1} — tiêu đề`}><input className="tc-input" value={cols[i].title} onChange={(e) => setCol(i, { title: e.target.value })} /></Field>
              <Field label="Chữ"><textarea className="tc-input" rows={2} value={cols[i].text ?? ''} onChange={(e) => setCol(i, { text: e.target.value || undefined })} /></Field>
              <ImageField label="Ảnh" value={cols[i].image} onChange={(v) => setCol(i, { image: v })} />
            </div>
          ))}
        </section>
      ) : null}

      {L === 'game' ? (
        <section className="tc-props__sec">
          <h3>Trò chơi</h3>
          <Seg<GameKind> label="Loại trò chơi" value={slide.game?.kind ?? 'wheel'} onChange={(k) => up({ game: { ...(slide.game ?? {}), kind: k } })} options={[{ value: 'wheel', label: 'Vòng quay' }, { value: 'duck-race', label: 'Đua vịt' }, { value: 'time-bomb', label: 'Bom hẹn giờ' }]} />
          {(slide.game?.kind ?? 'wheel') !== 'time-bomb' ? (
            <Field label="Danh sách (mỗi dòng một tên)">
              <textarea className="tc-input" rows={5} value={(slide.game?.entries ?? []).join('\n')} onChange={(e) => up({ game: { kind: slide.game?.kind ?? 'wheel', ...(slide.game?.seconds ? { seconds: slide.game.seconds } : {}), entries: e.target.value.split('\n') } })} onBlur={() => up({ game: { kind: slide.game?.kind ?? 'wheel', entries: (slide.game?.entries ?? []).map((x) => x.trim()).filter(Boolean) } })} />
            </Field>
          ) : (
            <Field label="Số giây"><input className="tc-input tc-input--num" type="number" min={5} max={300} value={slide.game?.seconds ?? 30} onChange={(e) => up({ game: { kind: 'time-bomb', seconds: Number(e.target.value) || 30 } })} /></Field>
          )}
          {(slide.game?.kind ?? 'wheel') !== 'time-bomb' ? (
            <Btn size="sm" icon="team" disabled={!students.data?.length} onClick={() => up({ game: { kind: slide.game?.kind ?? 'wheel', entries: (students.data ?? []).map((s) => s.name) } })}>
              Lấy tên học sinh {cls ? `lớp ${cls.name}` : ''}
            </Btn>
          ) : null}
        </section>
      ) : null}

      {L === 'package' ? (
        <section className="tc-props__sec">
          <h3>Gói HTML5</h3>
          <Field label="Chọn gói">
            <select className="tc-input" value={slide.packageId ?? ''} onChange={(e) => up({ packageId: e.target.value || undefined })}>
              <option value="">— Chưa chọn —</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.kind.toUpperCase()})</option>)}
            </select>
          </Field>
          <Btn size="sm" icon="upload" onClick={onImportPackage}>Nhập gói HTML5…</Btn>
        </section>
      ) : null}

      <section className="tc-props__sec">
        <h3>Đọc to</h3>
        <Field label="Câu máy đọc" help="Bỏ trống thì đọc tiêu đề + nội dung.">
          <textarea className="tc-input" rows={2} value={slide.speak ?? ''} onChange={(e) => up({ speak: e.target.value })} />
        </Field>
        <Seg label="Ngôn ngữ" value={slide.lang ?? 'vi-VN'} onChange={(v) => up({ lang: v === 'vi-VN' ? undefined : v })} options={[{ value: 'vi-VN', label: 'Tiếng Việt' }, { value: 'en-US', label: 'Tiếng Anh' }]} />
      </section>

      <section className="tc-props__sec">
        <Field label="Ghi chú cho giáo viên" help="Chỉ hiện trên điện thoại điều khiển khi trình chiếu.">
          <textarea className={cx('tc-input', 'tc-notes')} rows={3} value={slide.teacherNotes ?? ''} onChange={(e) => up({ teacherNotes: e.target.value })} />
        </Field>
      </section>
    </div>
  );
}

export function LessonPanel({ lesson, onChange, onDelete }: { lesson: Lesson; onChange: (patch: Partial<Lesson>) => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="tc-props">
      <section className="tc-props__sec">
        <Field label="Mô tả ngắn"><textarea className="tc-input" rows={3} value={lesson.description ?? ''} onChange={(e) => onChange({ description: e.target.value || undefined })} /></Field>
        <Field label="Thời lượng (phút)"><input className="tc-input tc-input--num" type="number" min={5} max={120} value={lesson.minutes ?? ''} onChange={(e) => onChange({ minutes: Number(e.target.value) || undefined })} /></Field>
      </section>
      <section className="tc-props__sec"><MascotPicker value={lesson.mascot} onChange={(m) => onChange({ mascot: m })} /></section>
      <section className="tc-props__sec">
        {confirm ? <ConfirmInline onCancel={() => setConfirm(false)} onConfirm={onDelete} /> : <Btn kind="danger" icon="trash" onClick={() => setConfirm(true)}>Xóa bài giảng</Btn>}
      </section>
    </div>
  );
}

function ConfirmInline({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="tc-confirm" role="alertdialog">
      <span>Xóa hẳn bài giảng này? Không thể hoàn tác.</span>
      <span className="tc-row"><Btn size="sm" onClick={onCancel}>Hủy</Btn><Btn size="sm" kind="danger" onClick={onConfirm}>Xóa bài</Btn></span>
    </div>
  );
}

/** "Nhúng trang web": Google Trang trình bày / Biểu mẫu, GeoGebra, Wordwall, Quizizz… (danh sách cho phép trong lesson-player). */
function EmbedField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const r = value ? toEmbed(value) : null;
  return (
    <section className="tc-props__sec">
      <h3>Nhúng trang web</h3>
      <Field label="Link hoặc mã nhúng" help="Google Trang trình bày, Tài liệu, Biểu mẫu, Drive · YouTube · GeoGebra · Scratch · Quizizz · Wordwall · Canva · Padlet. Có link thì thay cho ảnh toàn màn hình.">
        <textarea className="tc-input" rows={2} value={value} spellCheck={false} placeholder="https://docs.google.com/presentation/d/…" onChange={(e) => onChange(e.target.value.trim())} />
      </Field>
      {r ? (r.ok ? <p className="tc-small tc-ok">Nhúng được ({EMBED_PROVIDER_LABEL[r.provider]}). Nhớ đặt quyền xem “Bất kì ai có đường liên kết” hoặc xuất bản lên web.</p> : <p className="tc-small tc-warn">{r.reason}</p>) : null}
    </section>
  );
}
