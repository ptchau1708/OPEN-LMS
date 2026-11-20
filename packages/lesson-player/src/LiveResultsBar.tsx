import { badgeColor, badgeLetter } from '@openedu/activity-engine';
import { useEffect, useState } from 'react';
import type { Item, LiveResponse } from '@openedu/contracts';
import { Icon, Media } from '@openedu/ui';
import { computeLiveStats } from './liveStats';
import { cx } from './util';
import './base.css';
import './live.css';

export interface LiveResultsBarProps {
  item: Item;
  /** Câu trả lời của slide hiện tại (lọc theo item bên trong). */
  responses: LiveResponse[];
  /** Tổng số học sinh trong phòng (y trong "x/y bạn đã trả lời"). */
  total?: number;
  /** Tô đáp án đúng (pha 'reveal'). */
  reveal?: boolean;
  /** 'lg' cho TV. */
  size?: 'md' | 'lg';
  className?: string;
}

const BAR_COLORS = ['--k-math', '--k-viet', '--k-nat', '--k-eng', '--k-art', '--k-sci', '--k-music', '--k-other'];
const LETTERS = 'ABCDEFGHIJKLMNOP';

/** Bảng kết quả trực tiếp: cột ngang theo lựa chọn (MCQ, LISTEN_CHOOSE, MCQ_MULTIPLE, POLL) hoặc đếm số bạn trả lời. */
export function LiveResultsBar({ item, responses, total, reveal = false, size = 'lg', className }: LiveResultsBarProps) {
  const stats = computeLiveStats(item, responses);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const y = Math.max(total ?? 0, stats.answered);
  const denom = Math.max(1, stats.answered);
  const showCorrect = stats.graded && item.type !== 'POLL';

  return (
    <div className={cx('lp-results', `lp-results--${size}`, reveal && 'is-reveal', className)} aria-live="polite">
      <div className="lp-results__count">
        <span className="lp-results__big">
          {stats.answered}
          {y > 0 && <small>/{y}</small>}
        </span>
        <span className="lp-results__label">bạn đã trả lời</span>
        {showCorrect && (stats.kind === 'other' || reveal) && (
          <span className="lp-results__ok">
            <Icon name="check" size={size === 'lg' ? 28 : 20} /> {stats.correct} bạn đúng
          </span>
        )}
      </div>
      {stats.kind === 'other' ? (
        <div className="lp-results__meter" role="img" aria-label={`${stats.answered} trên ${y} bạn đã trả lời${showCorrect ? `, ${stats.correct} bạn đúng` : ''}`}>
          <i className="lp-results__meter-all" style={{ transform: `scaleX(${grown ? stats.answered / Math.max(1, y) : 0})` }} />
          {showCorrect && <i className="lp-results__meter-ok" style={{ transform: `scaleX(${grown ? stats.correct / Math.max(1, y) : 0})` }} />}
        </div>
      ) : (
        <ol className="lp-results__bars">
          {stats.options.map((o, i) => {
            const frac = o.count / denom;
            const hl = reveal && o.correct;
            const dim = reveal && showCorrect && !o.correct;
            return (
              <li key={o.id} className={cx('lp-results__row', hl && 'is-correct', dim && 'is-dim')}>
                <span className="lp-results__letter" style={{ background: `${hl ? 'var(--k-ok)' : badgeColor(i)}` }}>
                  {hl ? <Icon name="check" size={size === 'lg' ? 28 : 20} /> : badgeLetter(i)}
                </span>
                <span className="lp-results__opt">
                  {o.image && <Media src={o.image} alt={o.label} size={o.image.startsWith('emoji:') ? (size === 'lg' ? '1.6em' : '1.3em') : '2.2em'} />}
                  <span className="lp-results__opt-text">{o.label}</span>
                </span>
                <span className="lp-results__track">
                  <i
                    className="lp-results__fill"
                    style={{ transform: `scaleX(${grown ? frac : 0})`, background: `${hl ? 'var(--k-ok)' : badgeColor(i)}` }}
                  />
                </span>
                <span className="lp-results__num">{o.count}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
