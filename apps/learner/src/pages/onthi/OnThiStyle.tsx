/** Danh sách bài luyện của một kiểu thi + Luyện theo dạng + bảng xếp hạng. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { OnThiCard, OnThiStyle } from '@openedu/contracts';
import { useOnThiCards, useOnThiPracticeTypes } from '@openedu/data';
import { Button, Icon, Sheet, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { useMe } from '../../lib/util';
import { StyleArt } from './Art';
import { BoardList } from './Board';
import { STYLE_BLURB, STYLE_PATH, TYPE_ICON, fmtScore, styleFromPath, styleTitle, typeLabel } from './shared';
import './onthi.css';

export default function OnThiStylePage() {
  const { style: sp } = useParams();
  const style = styleFromPath(sp);
  if (!style) return <div className="ln-page"><TopBack title="Ôn thi" to="/on-thi" /><EmptyState title="Không có trang này" text="Em quay lại trang Ôn thi nhé." /></div>;
  return <StyleBody style={style} />;
}

function StyleBody({ style }: { style: OnThiStyle }) {
  const me = useMe();
  const nav = useNavigate();
  const cards = useOnThiCards(style);
  const types = useOnThiPracticeTypes(style);
  const [board, setBoard] = useState<OnThiCard | null>(null);
  const base = `/on-thi/${STYLE_PATH[style]}`;
  if (cards.isPending) return <LoadingScreen label="Đang mở bài luyện" />;
  if (cards.isError) return <ErrorState message={(cards.error as Error)?.message} onRetry={() => void cards.refetch()} />;
  const list = cards.data ?? [];
  const typeList = (types.data ?? []).filter((t) => t.count > 0);
  return (
    <div className={`ln-page ln-ot ln-ot--${style}`}>
      <TopBack title={styleTitle(style)} to="/on-thi" />
      <header className="ln-ot-band">
        <StyleArt style={style} size={76} />
        <div>
          <h1 className="ln-ot-band__title">{styleTitle(style)}</h1>
          <p className="ln-ot-band__text">{STYLE_BLURB[style]}</p>
        </div>
      </header>

      <h2 className="ln-h2 ln-ot-h">Bài luyện</h2>
      {list.length === 0 ? (
        <EmptyState title="Chưa có bài luyện" text="Thầy/cô chưa mở bài luyện nào cho khối của em. Em quay lại sau nhé!" />
      ) : (
        <div className="ln-ot-sets">
          {list.map((c, i) => (
            <SetRow key={c.setId} c={c} no={i + 1}
              onStart={() => { sfx.tap(); nav(`${base}/bai/${c.setId}`); }}
              onReview={c.best ? () => { sfx.tap(); nav(`${base}/ket-qua/${c.best!.attemptId}`); } : undefined}
              onBoard={c.showBoard ? () => { sfx.tap(); setBoard(c); } : undefined} />
          ))}
        </div>
      )}

      {typeList.length ? (
        <>
          <h2 className="ln-h2 ln-ot-h">Luyện theo dạng</h2>
          <p className="k-muted ln-ot-sub">Chọn một dạng câu rồi làm liền vài câu. Em biết đúng sai ngay, không tính điểm xếp hạng.</p>
          <div className="ln-ot-types">
            {typeList.map((t) => (
              <button key={t.type} type="button" className="ln-ot-type" onClick={() => { sfx.tap(); nav(`${base}/dang/${t.type}`); }} data-testid={`onthi-type-${t.type}`}>
                <span className="ln-ot-type__ico" aria-hidden="true"><Icon name={TYPE_ICON[t.type] ?? 'puzzle'} size={24} /></span>
                <span className="ln-ot-type__name">{typeLabel(t.type)}</span>
                <span className="ln-ot-type__n">{t.count} câu</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <Sheet open={!!board} onClose={() => setBoard(null)} title={board ? `Xếp hạng: ${board.title}` : ''}>
        {board ? <BoardList setId={board.setId} meId={me.id} maxScore={board.maxScore} /> : null}
      </Sheet>
    </div>
  );
}

function SetRow({ c, no, onStart, onReview, onBoard }: { c: OnThiCard; no: number; onStart: () => void; onReview?: () => void; onBoard?: () => void }) {
  const label = c.inProgress ? 'Làm tiếp' : c.best ? 'Làm lại' : 'Bắt đầu';
  return (
    <article className={`ln-ot-set${c.locked ? ' is-locked' : ''}${c.best?.passed ? ' is-passed' : ''}`} data-testid="onthi-set">
      <span className="ln-ot-set__no" aria-hidden="true">{c.locked ? <Icon name="lock" size={22} /> : c.best?.passed ? <Icon name="check" size={24} /> : no}</span>
      <div className="ln-ot-set__body">
        <h3 className="ln-ot-set__title">{c.title}</h3>
        <p className="ln-ot-set__meta">{c.questions} câu · {c.minutes} phút · tối đa {fmtScore(c.maxScore)} điểm</p>
        {c.locked ? (
          <p className="ln-ot-set__note"><Icon name="lock" size={18} /> Đạt bài “{c.lockedBy}” để mở bài này</p>
        ) : c.best ? (
          <p className="ln-ot-set__note">
            Cao nhất <b>{fmtScore(c.best.score)}</b>/{fmtScore(c.maxScore)} · {c.best.passed ? <span className="ln-ot-pass">Đạt</span> : <>cần {fmtScore(c.passScore)} điểm để đạt</>}
          </p>
        ) : (
          <p className="ln-ot-set__note">Chưa làm · Mức đạt {fmtScore(c.passScore)} điểm</p>
        )}
      </div>
      <div className="ln-ot-set__act">
        <Button size="lg" disabled={c.locked} icon={<Icon name={c.locked ? 'lock' : 'play'} size={24} />} onClick={onStart}>{label}</Button>
        <span className="ln-ot-set__links">
          {onReview ? <button type="button" className="ln-ot-link" onClick={onReview}>Xem lại</button> : null}
          {onBoard ? <button type="button" className="ln-ot-link" onClick={onBoard}>Xếp hạng</button> : null}
        </span>
      </div>
    </article>
  );
}
