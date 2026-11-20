import { useParams } from 'react-router';
import { usePackage } from '@openedu/data';
import { PackageHost } from '@openedu/lesson-player';
import { useUi } from '../lib/store';
import { ErrorState, LoadingScreen, TopBack } from '../components/Common';

/** Gói HTML5 được giao riêng (không nằm trong bài giảng). */
export default function PackagePage() {
  const { packageId = '' } = useParams();
  const q = usePackage(packageId);
  const toast = useUi((s) => s.toast);
  if (q.isPending) return <LoadingScreen label="Đang mở bài chơi" />;
  if (q.isError || !q.data) return <ErrorState title="Chưa mở được bài chơi" onRetry={() => void q.refetch()} />;
  return (
    <div className="ln-page ln-page--wide">
      <TopBack title={q.data.title} />
      <PackageHost pkg={q.data} height="72vh" onResult={(r) => { if (r.completed) toast('Em đã chơi xong rồi! Giỏi quá!', 'star'); }} />
    </div>
  );
}
