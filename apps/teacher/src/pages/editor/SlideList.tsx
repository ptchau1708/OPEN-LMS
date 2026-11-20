import { useState } from 'react';
import type { ContentPackage, Item, Lesson, SlideLayout } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { lessonMascot } from '@openedu/lesson-player';
import { SlideThumb } from '../../components/SlideThumb';
import { Btn, ConfirmBar } from '../../components/common';
import { cx, layoutMeta, LAYOUTS } from '../../lib/format';

export function AddSlideMenu({ onAdd, onClose }: { onAdd: (l: SlideLayout) => void; onClose: () => void }) {
  return (
    <div className="tc-menu tc-addmenu" role="menu" onMouseLeave={onClose}>
      {LAYOUTS.map((l) => (
        <button key={l.id} type="button" role="menuitem" onClick={() => { onAdd(l.id); onClose(); }}>
          <span className="tc-addmenu__icon"><Icon name={l.icon} size={20} /></span>
          <span><strong>{l.label}</strong><small>{l.hint}</small></span>
        </button>
      ))}
    </div>
  );
}

export function SlideList({ lesson, items, packages, selectedId, onSelect, onMove, onDuplicate, onDelete, onAdd }: {
  lesson: Lesson;
  items: Record<string, Item>;
  packages: Record<string, ContentPackage>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  onAdd: (l: SlideLayout) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const mascot = lessonMascot(lesson);
  const n = lesson.slides.length;
  return (
    <div className="tc-slides">
      <div className="tc-slides__head">
        <strong>{n} slide</strong>
        <div className="tc-rel">
          <Btn size="sm" kind="primary" icon="plus" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>Thêm slide</Btn>
          {adding ? <AddSlideMenu onAdd={onAdd} onClose={() => setAdding(false)} /> : null}
        </div>
      </div>
      <ol className="tc-slides__list">
        {lesson.slides.map((s, i) => {
          const meta = layoutMeta(s.layout);
          const active = s.id === selectedId;
          return (
            <li
              key={s.id}
              className={cx('tc-slide', active && 'is-active', over === i && drag !== null && drag !== i && 'is-over')}
              draggable
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
            >
              <button type="button" className="tc-slide__pick" onClick={() => onSelect(s.id)} aria-current={active ? 'true' : undefined}>
                <span className="tc-slide__num">{i + 1}</span>
                <SlideThumb slide={s} items={items} packages={packages} mascot={mascot} width={176} />
              </button>
              <div className="tc-slide__meta">
                <span className="tc-slide__title" title={s.title}>{s.title || <em className="tc-muted">(chưa có tiêu đề)</em>}</span>
                <span className="tc-slide__layout"><Icon name={meta.icon} size={12} /> {meta.label}</span>
              </div>
              {active ? (
                confirm === s.id ? (
                  <ConfirmBar text="Xóa slide này?" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); onDelete(i); }} />
                ) : (
                  <div className="tc-slide__tools">
                    <Btn size="sm" kind="ghost" aria-label="Chuyển lên" title="Chuyển lên" disabled={i === 0} onClick={() => onMove(i, i - 1)}>▲</Btn>
                    <Btn size="sm" kind="ghost" aria-label="Chuyển xuống" title="Chuyển xuống" disabled={i === n - 1} onClick={() => onMove(i, i + 1)}>▼</Btn>
                    <Btn size="sm" kind="ghost" title="Nhân bản" onClick={() => onDuplicate(i)}>Nhân bản</Btn>
                    <Btn size="sm" kind="ghost" icon="trash" aria-label="Xóa slide" title="Xóa slide" disabled={n <= 1} onClick={() => setConfirm(s.id)} />
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="tc-muted tc-small tc-slides__hint"><Icon name="drag" size={14} /> Kéo thả để đổi thứ tự</p>
    </div>
  );
}
