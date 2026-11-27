import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorScreenProps {
  /** 'kid': lời nhắn cho học sinh; 'staff': cho thầy/cô, có nút chép chi tiết lỗi. */
  tone?: 'kid' | 'staff';
  /** Lỗi do app vừa cập nhật (mảnh mã cũ không còn) — chỉ cần tải lại. */
  stale?: boolean;
  detail?: string;
  onRetry?: () => void;
}

/** Màn hình thay cho "trang trắng" khi app gặp lỗi bất ngờ. Chỉ dùng style nội tuyến + biến màu để luôn hiển thị được. */
export function ErrorScreen({ tone = 'kid', stale = false, detail, onRetry }: ErrorScreenProps) {
  const reload = () => window.location.reload();
  const home = () => { window.location.href = '/'; };
  const copy = () => { void navigator.clipboard?.writeText(detail ?? '').catch(() => undefined); };
  const offline = stale && typeof navigator !== 'undefined' && navigator.onLine === false;
  const title = offline ? 'Phần này cần có mạng' : stale ? 'Có bản mới rồi!' : tone === 'kid' ? 'Ôi, có trục trặc nhỏ!' : 'Trang này vừa gặp lỗi';
  const body = offline
    ? 'Máy đang mất mạng nên chưa mở được phần này. Khi có mạng, em bấm "Tải lại" nhé.'
    : stale
    ? 'Ứng dụng vừa được cập nhật. Bấm "Tải lại" để dùng bản mới nhé.'
    : tone === 'kid'
      ? 'Bài của em vẫn được giữ. Em bấm "Thử lại" nhé. Nếu vẫn chưa được, em nhờ thầy/cô giúp.'
      : 'Dữ liệu đã lưu không bị ảnh hưởng. Thầy/cô thử lại; nếu lỗi lặp lại, hãy chép chi tiết gửi quản trị.';
  const btn = { font: 'inherit', fontWeight: 700, fontSize: 18, padding: '14px 24px', minHeight: 52, borderRadius: 16, border: 0, cursor: 'pointer' } as const;
  return (
    <div role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'var(--f-kid, system-ui, sans-serif)', background: 'var(--k-bg, #eaf4ff)', color: 'var(--k-ink, #22304a)', textAlign: 'center' }}>
      <div style={{ maxWidth: 440 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" style={{ marginBottom: 8 }}>
          <circle cx="48" cy="48" r="44" fill="var(--k-star, #ffc22e)" />
          <circle cx="34" cy="42" r="5" fill="#22304a" /><circle cx="62" cy="42" r="5" fill="#22304a" />
          <path d="M34 66 Q48 56 62 66" stroke="#22304a" strokeWidth="5" fill="none" strokeLinecap="round" />
        </svg>
        <h1 style={{ fontSize: 28, margin: '8px 0' }}>{title}</h1>
        <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 20px' }}>{body}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {stale || !onRetry
            ? <button type="button" onClick={reload} style={{ ...btn, background: 'var(--k-info, #2f7bf6)', color: '#fff' }}>Tải lại</button>
            : <button type="button" onClick={onRetry} style={{ ...btn, background: 'var(--k-info, #2f7bf6)', color: '#fff' }}>Thử lại</button>}
          {!stale && <button type="button" onClick={home} style={{ ...btn, background: '#fff', color: 'inherit', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.12)' }}>Về trang đầu</button>}
          {tone === 'staff' && !stale && detail && <button type="button" onClick={copy} style={{ ...btn, background: 'transparent', color: 'inherit', textDecoration: 'underline' }}>Chép chi tiết lỗi</button>}
        </div>
      </div>
    </div>
  );
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  tone?: 'kid' | 'staff';
  /** Ghi lỗi (ví dụ reportClientError của @openedu/data). */
  onError?: (error: unknown, componentStack?: string) => void;
  /** Nhận biết lỗi do bản cũ (ví dụ isChunkLoadError). */
  isStale?: (error: unknown) => boolean;
  /** Đổi giá trị này (ví dụ đường dẫn hiện tại) thì tự thoát khỏi màn hình lỗi. */
  resetKey?: string;
}

interface State { error: unknown; stack?: string; key?: string }

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): Partial<State> { return { error: error ?? new Error('Lỗi không rõ') }; }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null;
    return { key: props.resetKey, error: null, stack: undefined };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? undefined });
    try { this.props.onError?.(error, info.componentStack ?? undefined); } catch { /* ghi lỗi không được làm hỏng màn hình lỗi */ }
  }

  render(): ReactNode {
    const { error, stack } = this.state;
    if (error === null) return this.props.children;
    const e = error instanceof Error ? error : new Error(String(error));
    const detail = `${e.name}: ${e.message}\n${e.stack ?? ''}\n${stack ?? ''}\n${typeof location !== 'undefined' ? location.href : ''}`.slice(0, 4000);
    return <ErrorScreen tone={this.props.tone} stale={this.props.isStale?.(error) ?? false} detail={detail} onRetry={() => this.setState({ error: null, stack: undefined })} />;
  }
}
