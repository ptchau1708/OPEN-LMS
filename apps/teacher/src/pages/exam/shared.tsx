import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { EXAM_LEVEL_HINT, EXAM_LEVEL_LABEL, type Choice, type Exam, type ExamLevel, type Item } from '@openedu/contracts';
import './exam.css';

export const LETTERS = 'ABCDEFGH';

export function ExamTabs({ exam }: { exam?: Exam | null }) {
  return (
    <nav className="ex-tabs" aria-label="Đề kiểm tra">
      <NavLink end to="/de-kiem-tra">Ma trận &amp; đề</NavLink>
      {exam?.id ? (
        <>
          <NavLink to={`/de-kiem-tra/${exam.id}/sua`}>Soạn đề</NavLink>
          <NavLink to={`/de-kiem-tra/${exam.id}/in`}>Bản in</NavLink>
          <NavLink to={`/de-kiem-tra/${exam.id}/ket-qua`}>Kết quả</NavLink>
        </>
      ) : null}
    </nav>
  );
}

export function LevelTag({ level }: { level: ExamLevel }) {
  return <span className={`ex-lv ex-lv--${level}`} title={EXAM_LEVEL_HINT[level]}>{EXAM_LEVEL_LABEL[level]}</span>;
}

export function fmtPoints(p: number): string {
  return String(Math.round(p * 100) / 100).replace('.', ',');
}

/** Gộp đề bài có chỗ trống {{x}} thành chữ in. */
function fillBlanks(passage: string, fn: (id: string) => string): string {
  return passage.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, id: string) => fn(id));
}
const t = (c?: Choice) => c?.text ?? (c?.image?.startsWith('emoji:') ? c.image.slice(6) : '(hình)');

/** Nội dung câu hỏi cho bản in giấy. */
export function PrintBody({ item }: { item: Item }): ReactNode {
  switch (item.type) {
    case 'MCQ':
    case 'MCQ_MULTIPLE':
    case 'LISTEN_CHOOSE':
      return (
        <ol className={`ex-opts ex-opts--${item.payload.options.length > 2 && item.payload.options.every((o) => (o.text ?? '').length < 18) ? 'grid' : 'list'}`}>
          {item.payload.options.map((o, i) => <li key={o.id}><b>{LETTERS[i]}.</b> {t(o)}</li>)}
          {item.type === 'MCQ_MULTIPLE' ? <li className="ex-note">(Có thể chọn nhiều đáp án)</li> : null}
        </ol>
      );
    case 'SHORT_ANSWER':
      return <p className="ex-blank">Trả lời: <span className="ex-dots" /> {item.payload.unit ?? ''}</p>;
    case 'ORDERING':
    case 'SENTENCE_SCRAMBLE': {
      const list = item.type === 'ORDERING' ? item.payload.items : item.payload.words;
      return <p>Các thẻ: {list.map((c) => <span key={c.id} className="ex-chip">{t(c)}</span>)}<br />Thứ tự: <span className="ex-dots ex-dots--long" /></p>;
    }
    case 'DRAG_DROP':
      return <p>Thẻ: {item.payload.tokens.map((c) => <span key={c.id} className="ex-chip">{t(c)}</span>)}<br />Xếp vào: {item.payload.zones.map((z) => <span key={z.id} className="ex-box">{z.label}: <span className="ex-dots" /></span>)}</p>;
    case 'WORD_CLASSIFY':
      return <p>Từ: {item.payload.words.map((c) => <span key={c.id} className="ex-chip">{t(c)}</span>)}<br />{item.payload.groups.map((g) => <span key={g.id} className="ex-box">{g.label}: <span className="ex-dots" /></span>)}</p>;
    case 'MATCHING':
      return <div className="ex-match"><ol>{item.payload.left.map((c, i) => <li key={c.id}><b>{i + 1}.</b> {t(c)}</li>)}</ol><ol>{item.payload.right.map((c, i) => <li key={c.id}><b>{LETTERS[i].toLowerCase()}.</b> {t(c)}</li>)}</ol></div>;
    case 'FILL_IN_PASSAGE':
      return <p>{fillBlanks(item.payload.passage, () => '……………')}{item.payload.bank?.length ? <><br />Từ gợi ý: {item.payload.bank.map((c) => <span key={c.id} className="ex-chip">{t(c)}</span>)}</> : null}</p>;
    case 'INLINE_DROPDOWN':
      return <p>{fillBlanks(item.payload.passage, (id) => `(${(item.payload.dropdowns[id] ?? []).map(t).join(' / ')})`)}</p>;
    case 'HOTSPOT':
      return <p className="ex-note">Em khoanh vào phần đúng trên hình.</p>;
    case 'MATH_MANIPULATIVE':
      return item.payload.kind === 'sticks' ? <p>{item.payload.operands.join(` ${item.payload.op} `)} = <span className="ex-dots" /></p> : <p>Vẽ kim đồng hồ. Giờ: <span className="ex-dots" /></p>;
    case 'TRUE_FALSE_MULTI':
      return <ol type="a">{item.payload.statements.map((c) => <li key={c.id}>{t(c)} <span className="ex-note">(Đ / S)</span> <span className="ex-dots" /></li>)}</ol>;
    default:
      return null;
  }
}

/** Đáp án dạng chữ cho phiếu đáp án. */
export function keyText(item: Item): string {
  const k = item.key as unknown;
  if (!k) return '(chưa có đáp án)';
  switch (item.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE': {
      const i = item.payload.options.findIndex((o) => o.id === item.key?.correct);
      return i >= 0 ? `${LETTERS[i]}. ${t(item.payload.options[i])}` : '';
    }
    case 'MCQ_MULTIPLE':
      return item.payload.options.map((o, i) => (item.key?.correct.includes(o.id) ? LETTERS[i] : '')).filter(Boolean).join(', ');
    case 'SHORT_ANSWER':
      return `${item.key?.accepted.join(' hoặc ')}${item.payload.unit ? ` ${item.payload.unit}` : ''}`;
    case 'ORDERING':
      return (item.key?.order ?? []).map((id) => t(item.payload.items.find((c) => c.id === id))).join(' → ');
    case 'SENTENCE_SCRAMBLE':
      return (item.key?.order ?? []).map((id) => t(item.payload.words.find((c) => c.id === id))).join(' ');
    case 'DRAG_DROP':
      return Object.entries(item.key?.placement ?? {}).map(([tk, z]) => `${t(item.payload.tokens.find((c) => c.id === tk))} → ${item.payload.zones.find((x) => x.id === z)?.label ?? z}`).join('; ');
    case 'WORD_CLASSIFY': {
      const pl = item.key?.placement ?? {};
      const main = Object.entries(pl).map(([w, g]) => `${t(item.payload.words.find((c) => c.id === w))} → ${item.payload.groups.find((x) => x.id === g)?.label ?? g}`).join('; ');
      const extra = item.payload.distractors ? item.payload.words.filter((c) => !pl[c.id]).map(t) : [];
      return extra.length ? `${main}; thẻ nhiễu: ${extra.join(', ')}` : main;
    }
    case 'MATCHING':
      return Object.entries(item.key?.pairs ?? {}).map(([l, r]) => `${item.payload.left.findIndex((c) => c.id === l) + 1}–${LETTERS[item.payload.right.findIndex((c) => c.id === r)]?.toLowerCase()}`).join(', ');
    case 'FILL_IN_PASSAGE':
      return Object.entries(item.key?.blanks ?? {}).map(([b, v]) => `${b}: ${v.join(' / ')}`).join('; ');
    case 'INLINE_DROPDOWN':
      return Object.entries(item.key?.blanks ?? {}).map(([b, v]) => `${b}: ${t((item.payload.dropdowns[b] ?? []).find((c) => c.id === v)) || v}`).join('; ');
    case 'HOTSPOT':
      return (item.key?.correct ?? []).map((id) => item.payload.regions.find((r) => r.id === id)?.label ?? id).join(', ');
    case 'MATH_MANIPULATIVE':
      return String(item.key?.value ?? '');
    case 'TRUE_FALSE_MULTI':
      return item.payload.statements.map((c, i) => `${LETTERS[i]?.toLowerCase() ?? i + 1}) ${item.key?.truth[c.id] === true ? 'Đ' : item.key?.truth[c.id] === false ? 'S' : '?'}`).join(', ');
    default:
      return '';
  }
}
