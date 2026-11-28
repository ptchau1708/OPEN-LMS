/** Cổng Ôn thi: chọn kiểu Trạng Nguyên (Tiếng Việt) hoặc Đấu trường VioEdu (Toán). */
import { useNavigate } from 'react-router';
import type { OnThiCard, OnThiStyle } from '@openedu/contracts';
import { useOnThiCards } from '@openedu/data';
import { Icon, sfx } from '@openedu/ui';
import { TopBack } from '../../components/Common';
import { StyleArt } from './Art';
import { STYLE_BLURB, STYLE_PATH, styleTitle } from './shared';
import './onthi.css';

export default function OnThiHub() {
  return (
    <div className="ln-page ln-ot">
      <TopBack title="Ôn thi" />
      <p className="ln-ot__lead">Luyện các dạng câu hỏi giống sân chơi thật để em quen tay. Đây là bài luyện của lớp, không phải đề thi chính thức.</p>
      <div className="ln-ot-hub">
        <StyleCard style="tn" />
        <StyleCard style="vio" />
      </div>
    </div>
  );
}

function StyleCard({ style }: { style: OnThiStyle }) {
  const nav = useNavigate();
  const q = useOnThiCards(style);
  const list: OnThiCard[] = q.data ?? [];
  const passed = list.filter((c) => c.best?.passed).length;
  const open = () => { sfx.tap(); nav(`/on-thi/${STYLE_PATH[style]}`); };
  return (
    <button type="button" className={`ln-ot-hubcard ln-ot--${style}`} onClick={open} data-testid={`onthi-hub-${style}`}>
      <StyleArt style={style} size={88} />
      <span className="ln-ot-hubcard__body">
        <span className="ln-ot-hubcard__title">{styleTitle(style)}</span>
        <span className="ln-ot-hubcard__text">{STYLE_BLURB[style]}</span>
        <span className="ln-ot-hubcard__meta">
          {q.isPending ? 'Đang tải…' : list.length ? `${list.length} bài luyện${passed ? ` · đạt ${passed}` : ''}` : 'Chưa có bài luyện'}
        </span>
      </span>
      <Icon name="next" size={28} className="ln-ot-hubcard__go" />
    </button>
  );
}
