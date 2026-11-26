/**
 * Phụ huynh (GV): gửi thông báo, nhắn tin hai chiều, duyệt mục trước khi gửi, theo dõi đã xem / xác nhận,
 * chọn phụ huynh thấy gì, và liên kết tài khoản phụ huynh (SQL 23).
 */
import { useSearchParams } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { useParentQueue, useParentThreads } from '@openedu/data';
import { Empty, Loading, PageHead, Seg } from '../../components/common';
import { ClassPicker, useClassPick } from '../../lib/assess';
import ParentLinks from '../admin/ParentLinks';
import { ComposePanel } from './Compose';
import { MessagesPanel } from './Messages';
import { QueuePanel } from './Queue';
import { SentPanel } from './Sent';
import { VisibilityPanel } from './Visibility';
import '../../styles/parents.css';

const TABS = ['gui', 'tin-nhan', 'cho-duyet', 'da-gui', 'thay-gi', 'lien-ket'] as const;
type Tab = typeof TABS[number];

export default function ParentHub({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const [sp, setSp] = useSearchParams();
  const tab = ((TABS as readonly string[]).includes(sp.get('the') ?? '') ? sp.get('the') : 'gui') as Tab;
  const setTab = (t: Tab) => setSp((p) => { const n = new URLSearchParams(p); n.set('the', t); n.delete('em'); return n; }, { replace: true });
  const queue = useParentQueue(cls?.id);
  const threads = useParentThreads(cls?.id);
  if (classes.isLoading) return <Loading />;
  if (!cls) return <Empty icon="parent" title="Chưa có lớp">Thầy cô cần có lớp để làm việc với phụ huynh.</Empty>;
  const unread = (threads.data ?? []).reduce((n, t) => n + t.unread, 0);
  const waiting = queue.data?.length ?? 0;
  const badge = (n: number, label: string) => <>{label}{n ? <span className="tc-ph__count" aria-label={`${n} mục`}>{n}</span> : null}</>;
  return (
    <div className="tc-page tc-ph">
      <PageHead title="Phụ huynh" sub="Gửi thông báo cho cả lớp hoặc từng phụ huynh, trao đổi tin nhắn, duyệt mục trước khi gửi và chọn những gì phụ huynh được xem." />
      <div className="tc-row tc-wrap tc-ph__bar">
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Seg label="Mục" value={tab} onChange={setTab} options={[
          { value: 'gui', label: 'Gửi phụ huynh' },
          { value: 'tin-nhan', label: badge(unread, 'Tin nhắn') },
          { value: 'cho-duyet', label: badge(waiting, 'Chờ duyệt') },
          { value: 'da-gui', label: 'Đã gửi' },
          { value: 'thay-gi', label: 'Phụ huynh thấy gì' },
          { value: 'lien-ket', label: 'Liên kết tài khoản' },
        ]} />
      </div>
      {tab === 'gui' ? <ComposePanel key={cls.id} cls={cls} onSent={() => setTab('da-gui')} /> : null}
      {tab === 'tin-nhan' ? <MessagesPanel key={cls.id} cls={cls} /> : null}
      {tab === 'cho-duyet' ? <QueuePanel key={cls.id} cls={cls} onSettings={() => setTab('thay-gi')} /> : null}
      {tab === 'da-gui' ? <SentPanel key={cls.id} cls={cls} onNew={() => setTab('gui')} /> : null}
      {tab === 'thay-gi' ? <VisibilityPanel key={cls.id} cls={cls} /> : null}
      {tab === 'lien-ket' ? <ParentLinks user={user} embedded /> : null}
    </div>
  );
}
