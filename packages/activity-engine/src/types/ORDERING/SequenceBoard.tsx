/**
 * Kiểu Duolingo: kho thẻ + hàng trả lời. Dùng cho ORDERING (ô số thứ tự) và SENTENCE_SCRAMBLE (dòng kẻ câu).
 * - Chạm thẻ trong kho → lên hàng trả lời; chạm thẻ ở hàng trả lời → về kho.
 * - Kéo để chèn vào giữa / đổi chỗ trong hàng trả lời; kéo về kho để bỏ ra.
 * - Thẻ trượt mượt bằng FLIP (chỉ transform); kho giữ chỗ trống để bố cục không nhảy.
 */
import { useMemo, useRef, useState } from 'react';
import type { ActivityMode, Choice } from '@openedu/contracts';
import { Media, SpeakButton, sfx } from '@openedu/ui';
import { seededShuffle } from '../../shared/shuffle';
import { speakChoice, useDragDrop, useFlip } from '../../shared/drag';
import type { DropEvent } from '../../shared/drag';
import './style.css';

export interface SequenceBoardProps {
  items: Choice[];
  seed: string;
  order: string[];
  onChange: (order: string[]) => void;
  disabled: boolean;
  reveal: boolean;
  parts?: Record<string, boolean>;
  /** Thứ tự đúng — chỉ truyền khi hiện đáp án và em làm chưa đúng. */
  correctOrder?: string[];
  variant: 'slots' | 'sentence';
  direction: 'horizontal' | 'vertical';
  subject?: string;
  bigText: boolean;
  mode: ActivityMode;
}

const ANSWER = '__answer';
const BANK = '__bank';

export function SequenceBoard(p: SequenceBoardProps) {
  const { items, order, onChange, variant, direction, parts } = p;
  const rootRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
  const bank = useMemo(() => seededShuffle(items, p.seed), [items, p.seed]);
  const answer = order.filter((id) => byId.has(id));
  const used = new Set(answer);
  const locked = p.disabled || p.reveal;
  const vertical = direction === 'vertical';
  const short = items.every((c) => !c.image && (c.text || '').length <= 3);
  const [ins, setIns] = useState<{ id: string; after: boolean } | null>(null);

  const isAfter = (pt: { x: number; y: number } | undefined, r: DOMRect | undefined) => {
    if (!pt || !r) return true;
    return vertical ? pt.y > r.top + r.height / 2 : pt.x > r.left + r.width / 2;
  };

  const commit = (next: string[], sound: 'tap' | 'drop' = 'drop') => {
    onChange(next);
    if (sound === 'drop') sfx.drop();
    else sfx.tap();
  };

  const onDrop = (e: DropEvent) => {
    setIns(null);
    const { dragId, targetId } = e;
    if (!targetId) return;
    const inAns = used.has(dragId);
    if (targetId === BANK) {
      if (inAns) commit(answer.filter((x) => x !== dragId), 'tap');
      return;
    }
    if (targetId === dragId) return;
    const next = answer.filter((x) => x !== dragId);
    if (targetId === ANSWER) next.push(dragId);
    else {
      let idx = next.indexOf(targetId);
      if (idx < 0) idx = next.length;
      else if (isAfter(e.point, e.targetRect)) idx++;
      next.splice(idx, 0, dragId);
    }
    if (next.join('|') !== answer.join('|')) commit(next);
  };

  const dnd = useDragDrop({
    disabled: locked,
    onDrop,
    onDragEnd: () => setIns(null),
    accepts: (_d, t) => t === ANSWER || t === BANK || used.has(t),
    onDragOver: (e) => {
      const t = e.targetId && e.targetId !== ANSWER && e.targetId !== BANK && e.targetId !== e.dragId ? e.targetId : null;
      const after = t ? isAfter(e.point, e.targetRect) : false;
      setIns((cur) => (t === null ? (cur ? null : cur) : cur && cur.id === t && cur.after === after ? cur : { id: t, after }));
    },
  });
  useFlip(rootRef, [order.join('|')], dnd.takeDropRect);

  const chipContent = (c: Choice) => (
    <>
      {c.image ? <Media src={c.image} alt={c.text || ''} /> : null}
      {c.text ? <span className="ae-seq-chip__text">{c.text}</span> : null}
    </>
  );

  const answerChip = (id: string, i: number) => {
    const c = byId.get(id) as Choice;
    const mark = p.reveal && parts ? (parts[id] ? 'ok' : 'try') : null;
    const target = dnd.dropTarget(id, { tap: false });
    const cls = [
      'ae-tok',
      'ae-seq-chip',
      'is-placed',
      dnd.dragging === id ? 'is-drag-source' : '',
      ins && ins.id === id ? (ins.after ? 'is-ins-after' : 'is-ins-before') : '',
      mark ? `is-${mark}` : '',
    ].filter(Boolean).join(' ');
    return (
      <button
        key={id}
        ref={target.ref}
        data-ae-drop={id}
        type="button"
        data-flip={id}
        className={cls}
        aria-disabled={locked || undefined}
        aria-label={`${c.text || ''} — vị trí ${i + 1}. Chạm để bỏ ra`}
        {...dnd.draggable(id)}
        onClick={() => {
          if (locked) return;
          commit(answer.filter((x) => x !== id), 'tap');
        }}
      >
        {chipContent(c)}
        {mark ? <span className="ae-tok__mark" aria-hidden="true">{mark === 'ok' ? '✓' : '↻'}</span> : null}
      </button>
    );
  };

  const ansTarget = dnd.dropTarget(ANSWER, { tap: false });
  const bankTarget = dnd.dropTarget(BANK, { tap: false });
  const sentence = answer.map((id) => byId.get(id)?.text || '').join(' ');
  const rootCls = [
    'ae-seq',
    `ae-seq--${variant}`,
    vertical ? 'ae-seq--vertical' : 'ae-seq--horizontal',
    short ? 'ae-seq--short' : '',
    dnd.dragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={rootCls} data-ae-dnd-scope="">
      <div className="ae-seq-answer-wrap">
        <div
          ref={ansTarget.ref}
          data-ae-drop={ANSWER}
          className={`ae-seq-answer${dnd.over === ANSWER ? ' is-over' : ''}`}
          aria-label="Hàng trả lời"
        >
          {variant === 'slots'
            ? items.map((_, i) => (
                <div className={`ae-seq-slot${answer[i] ? ' is-filled' : ''}`} key={i}>
                  <span className="ae-seq-slot__num" aria-hidden="true">{i + 1}</span>
                  {answer[i] ? answerChip(answer[i], i) : null}
                </div>
              ))
            : answer.map((id, i) => answerChip(id, i))}
          {variant === 'sentence' && answer.length === 0 ? (
            <span className="ae-seq-empty">Chạm vào các từ bên dưới để xếp câu nhé</span>
          ) : null}
        </div>
        {variant === 'sentence' && answer.length > 0 ? (
          <SpeakButton text={sentence} label="Nghe câu" size="sm" className="ae-seq-say" />
        ) : null}
      </div>

      <div
        ref={bankTarget.ref}
        data-ae-drop={BANK}
        className={`ae-seq-bank${dnd.over === BANK ? ' is-over' : ''}`}
        aria-label="Kho thẻ"
      >
        {bank.map((c) =>
          used.has(c.id) ? (
            <span key={`ph-${c.id}`} className="ae-tok ae-seq-chip ae-seq-ph" aria-hidden="true">
              {chipContent(c)}
            </span>
          ) : (
            <button
              key={c.id}
              type="button"
              data-flip={c.id}
              className={`ae-tok ae-seq-chip${dnd.dragging === c.id ? ' is-drag-source' : ''}`}
              aria-disabled={locked || undefined}
              aria-label={c.text ? `${c.text}. Chạm để xếp vào` : undefined}
              {...dnd.draggable(c.id)}
              onClick={() => {
                if (locked) return;
                speakChoice(c, { bigText: p.bigText, subject: p.subject });
                commit([...answer, c.id], 'tap');
              }}
            >
              {chipContent(c)}
            </button>
          ),
        )}
      </div>

      {p.correctOrder && p.correctOrder.length ? (
        <div className="ae-answer-key ae-pop-in">
          <span>{variant === 'sentence' ? 'Câu đúng:' : 'Thứ tự đúng:'}</span>
          {variant === 'sentence' ? (
            <span className="ae-answer-key__chip">{p.correctOrder.map((id) => byId.get(id)?.text || '').join(' ')}</span>
          ) : (
            p.correctOrder.map((id) => (
              <span className="ae-answer-key__chip" key={id}>
                {byId.get(id)?.image ? <Media src={byId.get(id)!.image!} size={24} /> : null}
                {byId.get(id)?.text}
              </span>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
