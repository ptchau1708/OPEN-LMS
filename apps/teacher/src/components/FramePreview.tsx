import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Xem trước trong iframe đúng kích thước thiết bị: media query, vw/vmin của lesson-player tính theo khung,
 * không theo cửa sổ GV. CSS của trang được chép (và theo dõi) vào iframe.
 */
export function FramePreview({ width, height, children, title, className }: { width: number; height: number; children: ReactNode; title: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(0.3);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / width, el.clientHeight / height, 1));
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [width, height]);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let mo: MutationObserver | null = null;
    const init = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const clones = new Map<Node, Node>();
      const sync = () => {
        const live = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'));
        const set = new Set<Node>(live);
        clones.forEach((c, src) => { if (!set.has(src)) { c.parentNode?.removeChild(c); clones.delete(src); } });
        for (const n of live) {
          const c = clones.get(n);
          if (!c) { const k = n.cloneNode(true); clones.set(n, k); doc.head.appendChild(k); }
          else if (n.nodeName === 'STYLE' && c.textContent !== n.textContent) c.textContent = n.textContent;
        }
      };
      sync();
      mo = new MutationObserver(sync);
      mo.observe(document.head, { childList: true, subtree: true, characterData: true });
      doc.documentElement.style.height = '100%';
      doc.body.style.cssText = 'margin:0;height:100%;overflow:auto;';
      setBody(doc.body);
    };
    if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.body) init();
    iframe.addEventListener('load', init);
    return () => { iframe.removeEventListener('load', init); mo?.disconnect(); };
  }, []);

  return (
    <div ref={box} className={`tc-frame-fit${className ? ' ' + className : ''}`}>
      <div className="tc-frame-outer" style={{ width: width * scale, height: height * scale }}>
        <iframe
          ref={frame}
          title={title}
          srcDoc='<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
          style={{ width, height, transform: `scale(${scale})` }}
          className="tc-frame"
        />
      </div>
      {body ? createPortal(children, body) : null}
    </div>
  );
}
