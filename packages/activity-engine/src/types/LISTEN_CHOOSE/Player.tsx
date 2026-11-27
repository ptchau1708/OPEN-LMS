import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, MascotBubble, speak, stopSpeaking, voicesReady } from '@openedu/ui';
import type { TypePlayerProps } from '../../shared/typeApi';
import { subjectColorVar } from '../../shared/PromptView';
import { OptionGrid } from '../MCQ/OptionGrid';
import { score } from './score';
import './style.css';

/** Nút "Nghe" tròn rất to. Tự đọc một lần khi mở (chế độ player). */
function ListenButton({ text, lang, audio, autoPlay, accent }: { text: string; lang?: 'vi-VN' | 'en-US'; audio?: string; autoPlay: boolean; accent: string }) {
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const autoDone = useRef(false);
  const endTimer = useRef<number | undefined>(undefined);

  const play = useCallback(() => {
    window.clearTimeout(endTimer.current);
    const ok = speak(text, { lang, audioUrl: audio, onEnd: () => setPlaying(false) });
    if (!ok) {
      setNoVoice(true);
      setPlaying(false);
      return;
    }
    setNoVoice(false);
    setPlaying(true);
    setPlayed(true);
    // phòng khi trình duyệt không báo onEnd
    endTimer.current = window.setTimeout(() => setPlaying(false), Math.min(15000, 1800 + text.length * 160));
  }, [text, lang, audio]);

  useEffect(() => {
    if (!autoPlay || autoDone.current) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void voicesReady().then(() => {
        if (cancelled || autoDone.current) return;
        autoDone.current = true;
        play();
      });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [autoPlay, play]);

  useEffect(() => () => { window.clearTimeout(endTimer.current); stopSpeaking(); }, []);

  return (
    <div className="ae-lc__listen">
      <button
        type="button"
        className={`ae-lc__btn${playing ? ' is-playing' : ''}`}
        style={{ ['--ae-accent' as string]: accent }}
        onClick={play}
        aria-label={played ? 'Nghe lại' : 'Nghe'}
      >
        <span className="ae-lc__wave" aria-hidden="true" />
        <span className="ae-lc__wave ae-lc__wave--2" aria-hidden="true" />
        <span className="ae-lc__face">
          <span className="ae-lc__icon"><Icon name="speaker" size={64} /></span>
          <span className="ae-lc__label">{played ? 'Nghe lại' : 'Nghe'}</span>
        </span>
      </button>
      {noVoice ? (
        <MascotBubble mascot="nghe" mood="think" size={56} className="ae-lc__novoice">
          Máy chưa đọc được. Em nhờ thầy/cô hoặc bố mẹ đọc giúp nhé!
        </MascotBubble>
      ) : null}
    </div>
  );
}

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'LISTEN_CHOOSE'>) {
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const text = (item.prompt.speak ?? item.prompt.text ?? '').trim();
  return (
    <div className={`ae-lc ae-lc--${mode}`}>
      <ListenButton text={text} lang={item.prompt.lang} audio={item.prompt.audio} autoPlay={mode === 'player'} accent={subjectColorVar(item)} />
      <OptionGrid
        className="ae-lc__opts"
        options={item.payload.options}
        seed={item.id}
        columns={item.payload.columns}
        selected={value?.choice ? [value.choice] : []}
        onPick={(id) => onChange({ choice: id })}
        disabled={disabled}
        reveal={reveal}
        parts={parts}
        mode={mode}
        lang={item.prompt.lang}
        ariaLabel="Các tranh, chọn một"
      />
    </div>
  );
}
