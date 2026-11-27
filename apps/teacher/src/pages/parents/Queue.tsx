/** Mục chờ duyệt: thầy/cô xem từng mục (nhắc nhở, vắng học…), gửi kèm lời nhắn hoặc bỏ qua. */
import { useMemo, useState } from 'react';
import type { ClassInfo, ReviewItem } from '@openedu/contracts';
import { useParentQueue, useReleaseItems } from '@openedu/data';
import { Btn, Empty, ErrorNote, Field, Loading } from '../../components/common';
import { fmtDateTime } from '../../lib/format';

const KIND_LABEL: Record<ReviewItem['kind'], string> = { works: 'Bài viết', tt27: 'Kết quả TT27', praise: 'Lời khen', reminders: 'Nhắc nhở', attendance: 'Chuyên cần' };
const key = (i: ReviewItem) => `${i.kind}|${i.refId}`;

export function QueuePanel({ cls, onSettings }: { cls: ClassInfo; onSettings: () => void }) {
  const q = useParentQueue(cls.id);
  const rel = useReleaseItems();
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const items = useMemo(() => q.data ?? [], [q.data]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  if (!items.length) {
    return (
      <Empty icon="check" title="Không có mục nào chờ duyệt">
        <p>Mục để ở chế độ “GV duyệt rồi mới gửi” (mặc định: nhắc nhở nề nếp) sẽ hiện ở đây trong 30 ngày.</p>
        <Btn onClick={onSettings}>Chọn phụ huynh thấy gì</Btn>
        {msg ? <p className="tc-alert tc-alert--ok" role="status">{msg}</p> : null}
      </Empty>
    );
  }
  const picked = items.filter((i) => sel.includes(key(i)));
  const act = (list: ReviewItem[], state: 'sent' | 'skipped') => rel.mutate(
    { items: list.map((i) => ({ kind: i.kind, refId: i.refId })), state, note: state === 'sent' ? note : undefined },
    { onSuccess: (n) => { setSel([]); setNote(''); setMsg(state === 'sent' ? `Đã gửi ${n} mục cho phụ huynh.` : `Đã bỏ qua ${n} mục.`); } },
  );
  return (
    <div className="tc-ph-queue" data-testid="ph-queue">
      {msg ? <p className="tc-alert tc-alert--ok" role="status">{msg}</p> : null}
      <ErrorNote error={rel.error} />
      <section className="tc-card tc-card--flush">
        <div className="tc-tablewrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Chọn tất cả" checked={sel.length === items.length} onChange={(e) => setSel(e.target.checked ? items.map(key) : [])} /></th>
                <th>Học sinh</th><th>Mục</th><th>Nội dung</th><th>Lúc</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={key(i)} data-testid="ph-queue-row">
                  <td><input type="checkbox" aria-label={`Chọn ${i.title} của ${i.studentName}`} checked={sel.includes(key(i))} onChange={(e) => setSel((s) => (e.target.checked ? [...s, key(i)] : s.filter((x) => x !== key(i))))} /></td>
                  <td><strong>{i.studentName}</strong></td>
                  <td><span className={`tc-chip tc-ph-kind tc-ph-kind--${i.kind}`}>{KIND_LABEL[i.kind]}</span></td>
                  <td>{i.title}{i.detail ? <div className="tc-small tc-muted">{i.detail}</div> : null}</td>
                  <td className="tc-small tc-muted">{fmtDateTime(i.at)}</td>
                  <td className="tc-row">
                    <Btn size="sm" disabled={rel.isPending} onClick={() => act([i], 'sent')}>Gửi</Btn>
                    <Btn size="sm" kind="ghost" disabled={rel.isPending} onClick={() => act([i], 'skipped')}>Bỏ qua</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="tc-card tc-ph-queue__act">
        <Field label={`Lời nhắn kèm khi gửi ${picked.length ? `${picked.length} mục đã chọn` : '(chọn mục ở bảng trên)'}`} help="Không bắt buộc. Phụ huynh thấy lời nhắn ngay dưới mục thầy/cô gửi.">
          <textarea className="tc-input" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Nhờ bố mẹ nhắc con giữ trật tự trong giờ học." data-testid="ph-queue-note" />
        </Field>
        <div className="tc-row">
          <Btn kind="primary" icon="send" disabled={!picked.length || rel.isPending} onClick={() => act(picked, 'sent')} data-testid="ph-queue-send">Gửi {picked.length || ''} mục</Btn>
          <Btn disabled={!picked.length || rel.isPending} onClick={() => act(picked, 'skipped')}>Bỏ qua</Btn>
        </div>
      </section>
    </div>
  );
}
