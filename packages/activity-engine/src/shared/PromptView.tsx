import { useState } from 'react';
import type { ActivityMode, Item } from '@openedu/contracts';
import { SUBJECTS } from '@openedu/contracts';
import { Media, SpeakButton } from '@openedu/ui';
import '../styles.css';

/** Biến CSS màu môn học, dùng làm màu nhấn cho hoạt động. */
export function subjectColorVar(item: Item): string {
  const s = SUBJECTS[item.subject] ?? SUBJECTS.khac;
  return `var(${s.colorVar})`;
}

/**
 * Đề bài: chữ to đậm, ảnh/emoji minh hoạ, nút loa đọc to.
 * Với LISTEN_CHOOSE: nút loa ở đây đọc lời dặn (prompt.text); nội dung phải nghe (prompt.speak) do nút "Nghe" của Player đọc.
 * Lớp 1 làm bài nghe: chữ ẩn sau nút "Xem chữ" — em nghe là chính.
 */
export function PromptView({ item, mode }: { item: Item; mode: ActivityMode }) {
  const p = item.prompt;
  const listen = item.type === 'LISTEN_CHOOSE';
  const hideText = listen && item.grade === 1;
  const [showText, setShowText] = useState(false);
  const text = (p.text ?? '').trim();
  const speakText = listen ? text : (p.speak ?? text);
  const big = mode === 'bigscreen';
  const textVisible = !!text && (!hideText || showText);

  return (
    <div className={`ae-prompt${big ? ' ae-prompt--big' : ''}`} style={{ ['--ae-accent' as string]: subjectColorVar(item) }}>
      <div className="ae-prompt__row">
        {speakText && !(hideText && !showText) ? (
          <SpeakButton
            className="ae-prompt__speak"
            text={speakText}
            lang={p.lang}
            audioUrl={listen ? undefined : p.audio}
            size={big ? 'lg' : 'md'}
            label="Nghe đề"
          />
        ) : null}
        {textVisible ? (
          <p className="ae-prompt__text" lang={p.lang === 'en-US' ? 'en' : 'vi'}>{text}</p>
        ) : null}
        {hideText && text ? (
          <button type="button" className="ae-prompt__peek" aria-pressed={showText} onClick={() => setShowText((v) => !v)}>
            {showText ? 'Ẩn chữ' : 'Xem chữ'}
          </button>
        ) : null}
      </div>
      {p.image ? (
        <div className="ae-prompt__figure">
          <Media src={p.image} alt="" className="ae-prompt__media" />
        </div>
      ) : null}
    </div>
  );
}
