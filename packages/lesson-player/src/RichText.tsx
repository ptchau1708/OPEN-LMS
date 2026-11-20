import { Fragment } from 'react';
import type { ReactNode } from 'react';

/** Chữ slide: xuống dòng giữ nguyên, dòng trống tách đoạn, **đậm** đơn giản. Không dùng innerHTML. */
export function RichText({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>{renderLines(p)}</p>
      ))}
    </div>
  );
}

function renderLines(p: string): ReactNode {
  const lines = p.split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderBold(line)}
    </Fragment>
  ));
}

/** Một dòng chữ có **đậm** (dùng cho tiêu đề). */
export function Inline({ text }: { text?: string }) {
  if (!text) return null;
  return <>{renderBold(text)}</>;
}

function renderBold(line: string): ReactNode {
  const parts = line.split('**');
  // Số dấu ** lẻ: phần cuối không có cặp, hiện như chữ thường.
  const unbalanced = parts.length % 2 === 0;
  return parts.map((part, i) => {
    const bold = i % 2 === 1 && !(unbalanced && i === parts.length - 1);
    return bold ? <strong key={i}>{part}</strong> : <Fragment key={i}>{unbalanced && i === parts.length - 1 ? '**' + part : part}</Fragment>;
  });
}
