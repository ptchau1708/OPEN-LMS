import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router';
import { ErrorBoundary, ErrorScreen } from '@openedu/ui';
import { DataProvider, consumeHandoff, initDataSource, installClientErrorHandlers, isChunkLoadError, reportClientError } from '@openedu/data';
import '@openedu/ui/tokens.css';
import '@openedu/ui/kid.css';
import './styles/app.css';
import './styles/assess.css';
import './styles/game.css';
import './styles/discuss.css';
import { App } from './App';


installClientErrorHandlers('teacher');
const root = createRoot(document.getElementById('root') as HTMLElement);

/** Lỗi bất ngờ → màn hình "thử lại" thay cho trang trắng; đổi trang thì tự thoát. */
function Guard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary tone="staff" resetKey={pathname} isStale={isChunkLoadError} onError={(e, stack) => reportClientError('teacher', e, stack)}>{children}</ErrorBoundary>;
}

// Đăng nhập chung: nhận phiên app học sinh chuyển sang (phần #oe_s=…) trước khi vẽ — docs/DANG_NHAP_CHUNG.md.
void initDataSource().then((ds) => consumeHandoff(ds)).then(() => root.render(
  <StrictMode>
    <DataProvider>
      <BrowserRouter>
<Guard>
        <App />
      </Guard>
</BrowserRouter>
    </DataProvider>
  </StrictMode>,
)).catch((e: unknown) => {
  reportClientError('teacher', e);
  root.render(<ErrorScreen tone="staff" stale={isChunkLoadError(e)} />);
});
