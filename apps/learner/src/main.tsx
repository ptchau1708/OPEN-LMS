import '@openedu/ui/tokens.css';
import '@openedu/ui/kid.css';
import './styles/app.css';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router';
import { DataProvider, initDataSource, installClientErrorHandlers, isChunkLoadError, reportClientError } from '@openedu/data';
import { unlockAudio, ErrorBoundary, ErrorScreen } from '@openedu/ui';
import { App } from './App';

// Trình duyệt chỉ cho phát âm thanh sau lần chạm đầu tiên.
const first = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', first, true);
  window.removeEventListener('keydown', first, true);
};
window.addEventListener('pointerdown', first, true);
window.addEventListener('keydown', first, true);

// offline: bọc OfflineAwareDataSource (Supabase; demo khi VITE_OFFLINE_SIM=1) — docs/PHASE6_OFFLINE.md.

installClientErrorHandlers('learner');
const root = createRoot(document.getElementById('root') as HTMLElement);

/** Lỗi bất ngờ → màn hình "thử lại" thay cho trang trắng; đổi trang thì tự thoát. */
function Guard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary tone="kid" resetKey={pathname} isStale={isChunkLoadError} onError={(e, stack) => reportClientError('learner', e, stack)}>{children}</ErrorBoundary>;
}

void initDataSource({ offline: true }).then(() => root.render(
  <DataProvider>
    <BrowserRouter>
<Guard>
      <App />
    </Guard>
</BrowserRouter>
  </DataProvider>,
)).catch((e: unknown) => {
  reportClientError('learner', e);
  root.render(<ErrorScreen tone="kid" stale={isChunkLoadError(e)} />);
});
