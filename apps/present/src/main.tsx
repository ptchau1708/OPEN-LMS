import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import '@openedu/ui/tokens.css';
import '@openedu/ui/kid.css';
import './app.css';
import { DataProvider, initDataSource, installClientErrorHandlers, isChunkLoadError, reportClientError } from '@openedu/data';
import { KidShell, ErrorBoundary, ErrorScreen } from '@openedu/ui';
import { Start } from './Start';

const GardenTv = lazy(() => import('./garden/GardenTv'));


installClientErrorHandlers('present');
const root = createRoot(document.getElementById('root') as HTMLElement);

/** Lỗi bất ngờ → màn hình "thử lại" thay cho trang trắng; đổi trang thì tự thoát. */
function Guard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary tone="kid" resetKey={pathname} isStale={isChunkLoadError} onError={(e, stack) => reportClientError('present', e, stack)}>{children}</ErrorBoundary>;
}

void initDataSource().then(() => root.render(
  <StrictMode>
    <DataProvider>
      <BrowserRouter>
<Guard>
        <KidShell background="lilac" className="pr-root">
          <Routes>
            <Route path="/" element={<Start />} />
            <Route path="/vuon-lop" element={<Suspense fallback={null}><GardenTv /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KidShell>
      </Guard>
</BrowserRouter>
    </DataProvider>
  </StrictMode>,
)).catch((e: unknown) => {
  reportClientError('present', e);
  root.render(<ErrorScreen tone="kid" stale={isChunkLoadError(e)} />);
});
