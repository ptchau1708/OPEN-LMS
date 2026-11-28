/**
 * Khay thẻ + các ô có nhãn — dùng cho DRAG_DROP (thẻ hình) và WORD_CLASSIFY (thẻ chữ).
 * Kéo thẻ vào ô, hoặc chạm thẻ (chọn) rồi chạm ô. Chạm thẻ đã đặt → trả về khay.
 */
import { useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { ActivityMode, Choice } from '@openedu/contracts';
import { Media, sfx } from '@openedu/ui';
import { seededShuffle } from '../../shared/shuffle';
import { speakChoice, useDragDrop, useFlip } from '../../shared/drag';
import './style.css';

export interface BoardZone {
  id: string;
  label: string;
  image?: string;
  /** Giá trị CSS màu (vd var(--k-nat)). */
  color: string;
}

export interface ZoneBoardProps {
  tokens: Choice[];
  zones: BoardZone[];
  seed: string;
  placement: Record<string, string>;
  onChange: (p: Record<string, string>) => void;
  disabled: boolean;
  reveal: boolean;
  /** Đúng/sai theo id thẻ (khi hiện đáp án). */
  parts?: Record<string, boolean>;
  /** Đáp án đúng (khi hiện đáp án) để ghi chú "→ ô đúng" dưới thẻ đặt chưa đúng. */
  correct?: Record<string, string>;
  variant: 'card' | 'word';
  subject?: string;
  bigText: boolean;
  mode: ActivityMode;
  /** Tên gọi thẻ trong câu thông báo ("thẻ" / "từ"). */
  noun?: string;
  /** Có thẻ nhiễu: được để thẻ lại khay (thẻ nhiễu ở khay là đúng). */
  leftover?: boolean;
}

const TRAY = '__tray';

export function ZoneBoard(p: ZoneBoardProps) {
  const { tokens, zones, placement, onChange, variant, parts, correct } = p;
  const rootRef = useRef<HTMLDivElement>(null);
  const shuffled = useMemo(() => seededShuffle(tokens, p.seed), [tokens, p.seed]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const locked = p.disabled || p.reveal;
  const placedIn = (id: string): string | undefined => (zoneById.has(placement[id]) ? placement[id] : undefined);

  const place = (tokenId: string, zoneId: string | null) => {
    const next = { ...placement };
    if (zoneId) next[tokenId] = zoneId;
    else delete next[tokenId];
    onChange(next);
  };

  const dnd = useDragDrop({
    disabled: locked,
    onDrop: (e) => {
      if (!e.targetId) return;
      if (e.targetId === TRAY) {
        if (placedIn(e.dragId)) {
          place(e.dragId, null);
          sfx.tap();
        }
        return;
      }
      if (placedIn(e.dragId) === e.targetId) return;
      place(e.dragId, e.targetId);
      sfx.drop();
    },
  });
  useFlip(rootRef, [placement], dnd.takeDropRect);

  const armed = !locked && (dnd.selected !== null || dnd.dragging !== null);
  const trayTokens = shuffled.filter((t) => !placedIn(t.id));
  const placedCount = tokens.length - trayTokens.length;
  const noun = p.noun ?? 'thẻ';

  const renderToken = (t: Choice, where: 'tray' | 'zone') => {
    const sel = dnd.selected === t.id;
    const mark = p.reveal && parts ? (parts[t.id] ? 'ok' : 'try') : null;
    const fixZone = mark === 'try' && correct ? zoneById.get(correct[t.id]) : undefined;
    const fixOut = mark === 'try' && correct && p.leftover && where === 'zone' && correct[t.id] === undefined;
    const cls = [
      'ae-tok',
      'ae-zb-tok',
      `ae-zb-tok--${variant}`,
      where === 'zone' ? 'is-placed' : '',
      sel ? 'is-selected' : '',
      dnd.dragging === t.id ? 'is-drag-source' : '',
      mark ? `is-${mark}` : '',
    ].filter(Boolean).join(' ');
    const label = t.text || '';
    return (
      <button
        key={t.id}
        type="button"
        data-flip={t.id}
        className={cls}
        aria-pressed={where === 'tray' ? sel : undefined}
        aria-disabled={locked || undefined}
        aria-label={where === 'zone' ? `${label} — ở ô ${zoneById.get(placedIn(t.id) || '')?.label ?? ''}. Chạm để lấy ra` : label || undefined}
        {...dnd.draggable(t.id)}
        onClick={(e) => {
          e.stopPropagation();
          if (locked) return;
          if (where === 'tray') {
            if (sel) dnd.select(null);
            else {
              dnd.select(t.id);
              sfx.tap();
              speakChoice(t, { bigText: p.bigText, subject: p.subject });
            }
            return;
          }
          const z = placedIn(t.id);
          if (dnd.selected && dnd.selected !== t.id && z) {
            dnd.placeSelected(z);
            return;
          }
          place(t.id, null);
          sfx.tap();
        }}
      >
        {t.image ? <Media src={t.image} alt={label} /> : null}
        {label ? <span className="ae-zb-tok__text">{label}</span> : null}
        {fixZone ? <span className="ae-zb-tok__fix">→ {fixZone.label}</span> : null}
        {fixOut ? <span className="ae-zb-tok__fix">→ không thuộc nhóm nào</span> : null}
        {mark ? <span className="ae-tok__mark" aria-hidden="true">{mark === 'ok' ? '✓' : '↻'}</span> : null}
      </button>
    );
  };

  const zoneKey = (zoneId: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dnd.placeSelected(zoneId);
    }
  };

  const tray = dnd.dropTarget(TRAY);
  const many = zones.length > 2;
  const cols = zones.length <= 2 ? Math.max(zones.length, 1) : zones.length === 4 ? 2 : 3;

  return (
    <div
      ref={rootRef}
      className={`ae-zb ae-zb--${variant}${armed ? ' is-armed' : ''}`}
      data-ae-dnd-scope=""
      onKeyDown={(e) => {
        if (e.key === 'Escape') dnd.select(null);
      }}
    >
      <div {...tray} className={`ae-zb-tray${dnd.over === TRAY ? ' is-over' : ''}`} aria-label={`Khay ${noun}`}>
        {trayTokens.map((t) => renderToken(t, 'tray'))}
        {trayTokens.length === 0 ? (
          <span className="ae-zb-tray__done ae-pop-in">{p.reveal ? '' : `Em đã xếp hết ${noun} rồi! 🎉`}</span>
        ) : null}
      </div>
      {p.leftover && !p.reveal ? <p className="ae-tip ae-zb-note">Có {noun} không thuộc nhóm nào. Em để {noun} đó lại trong khay nhé.</p> : null}

      <p className="ae-zb-status" aria-live="polite">
        {dnd.selected ? `Chạm vào ô để đặt ${noun} nhé` : `Đã xếp ${placedCount}/${tokens.length} ${noun}`}
      </p>

      <div className={`ae-zb-zones${many ? ' ae-zb-zones--many' : ''}`} style={{ ['--cols' as string]: String(cols) }}>
        {zones.map((z) => {
          const inZone = shuffled.filter((t) => placedIn(t.id) === z.id);
          const t = dnd.dropTarget(z.id);
          return (
            <div
              key={z.id}
              {...t}
              role="button"
              tabIndex={locked ? -1 : 0}
              aria-label={`Ô ${z.label}, có ${inZone.length} ${noun}`}
              onKeyDown={zoneKey(z.id)}
              className={`ae-zb-zone${dnd.over === z.id ? ' is-over' : ''}${armed ? ' is-armed' : ''}`}
              style={{ ['--c' as string]: z.color }}
            >
              <div className="ae-zb-zone__head">
                {z.image ? <Media src={z.image} alt="" className="ae-zb-zone__img" /> : null}
                <span>{z.label}</span>
                <span className="ae-zb-zone__count" aria-hidden="true">{inZone.length}</span>
              </div>
              <div className="ae-zb-zone__body">
                {inZone.map((tok) => renderToken(tok, 'zone'))}
                {inZone.length === 0 ? <span className="ae-zb-zone__empty">{armed ? 'Thả vào đây' : ''}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
