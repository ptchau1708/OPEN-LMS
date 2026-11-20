// Nhẹ, dùng ở các trang tải đầu (Bài giảng): không nhập gói cầu nối Excel / admin.
function learnerBase(): string {
  const v = (import.meta.env as Record<string, unknown>).VITE_LEARNER_URL;
  const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  return (typeof v === 'string' && v.trim() ? v.trim() : `http://${host}:5173`).replace(/\/+$/, '');
}
/** Giống bridge.gc.classroomShareUrl (packages/data/src/export/classroom.ts). */
function shareUrl(url: string, title?: string): string {
  return `https://classroom.google.com/share?url=${encodeURIComponent(url)}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
}

/** Link HS mở trong app học sinh cho từng loại nội dung. */
export function learnerLink(kind: 'lesson' | 'package' | 'work' | 'exam', id: string): string {
  const path = kind === 'lesson' ? 'bai' : kind === 'package' ? 'goi' : kind === 'work' ? 'bai-viet' : 'kiem-tra';
  return `${learnerBase()}/${path}/${encodeURIComponent(id)}`;
}

/** Nút "Chia sẻ lên Classroom" — mở trang chia sẻ của Google, không cần cấu hình. */
export function ShareClassroomButton({ kind, id, title, compact }: { kind: 'lesson' | 'package' | 'work' | 'exam'; id: string; title: string; compact?: boolean }) {
  const href = shareUrl(learnerLink(kind, id), title);
  return (
    <a className={`tc-btn tc-btn--ghost${compact ? ' tc-btn--sm' : ''} br-share`} href={href} target="_blank" rel="noopener noreferrer" title="Chia sẻ lên Google Classroom (mở tab mới)" aria-label={`Chia sẻ “${title}” lên Google Classroom`} onClick={(e) => e.stopPropagation()}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.5" fill="currentColor" /><path d="M7.5 16c1-2 2.6-3 4.5-3s3.5 1 4.5 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <span>{compact ? 'Classroom' : 'Chia sẻ lên Classroom'}</span>
    </a>
  );
}
