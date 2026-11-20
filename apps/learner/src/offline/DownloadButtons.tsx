/** Nút "Tải về" cho một bài và "Tải bài được giao" cho cả danh sách (tải lười). */
import { useEffect, useState } from 'react';
import type { Task } from '@openedu/contracts';
import { Button, Icon, sfx } from '@openedu/ui';
import { useUi } from '../lib/store';
import { getDownloads } from './manager';
import { useOfflineState } from './state';
import '../styles/offline.css';

type St = 'checking' | 'none' | 'busy' | 'done';

export function DownloadLessonButton({ lessonId }: { lessonId: string }) {
  const [st, setSt] = useState<St>('checking');
  const [step, setStep] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const { online } = useOfflineState();
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    let live = true;
    void getDownloads().then((dm) => dm.has(lessonId)).then((h) => { if (live) setSt(h ? 'done' : 'none'); }).catch(() => live && setSt('none'));
    return () => { live = false; };
  }, [lessonId]);
  const go = async () => {
    sfx.tap();
    setSt('busy');
    try {
      const dm = await getDownloads();
      const e = await dm.download(lessonId, (d, t) => setStep(t ? ` ${d}/${t}` : ''));
      setSt('done');
      setNote(e.needsNetwork.length ? `Cần mạng: ${e.needsNetwork.join(', ')}` : null);
      toast('Đã tải bài về máy. Mất mạng em vẫn học được!', 'ok');
    } catch {
      setSt('none');
      toast('Chưa tải được bài. Em thử lại khi có mạng nhé!', 'try');
    }
  };
  if (st === 'checking') return null;
  if (st === 'done')
    return (
      <div className="ln-dl">
        <span className="ln-dl__done"><Icon name="check" size={20} /> Đã tải về máy</span>
        {note && <span className="ln-dl__note">{note}</span>}
      </div>
    );
  return (
    <Button size="lg" block variant="secondary" disabled={st === 'busy' || !online} onClick={() => void go()} icon={<Icon name="upload" size={24} style={{ transform: 'rotate(180deg)' }} />}>
      {st === 'busy' ? `Đang tải…${step}` : online ? 'Tải về' : 'Cần mạng để tải'}
    </Button>
  );
}

export function DownloadAssignedButton({ tasks }: { tasks: Task[] }) {
  const ids = [...new Set(tasks.filter((t) => t.kind === 'lesson').map((t) => t.targetId))];
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { online } = useOfflineState();
  const toast = useUi((s) => s.toast);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    void getDownloads().then(async (dm) => {
      let n = 0;
      for (const id of ids) if (!(await dm.has(id))) n++;
      if (live) setLeft(n);
    }).catch(() => live && setLeft(0));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!ids.length || left === null) return null;
  if (left === 0) return <span className="ln-dl__done ln-dl__done--bulk"><Icon name="check" size={18} /> Bài được giao đã ở trên máy</span>;
  const go = async () => {
    sfx.tap();
    const dm = await getDownloads();
    let ok = 0;
    for (const [i, id] of ids.entries()) {
      setBusy(`${i + 1}/${ids.length}`);
      if (await dm.has(id)) { ok++; continue; }
      await dm.download(id).then(() => ok++).catch(() => undefined);
    }
    setBusy(null);
    setLeft(ids.length - ok);
    toast(ok === ids.length ? 'Đã tải hết bài được giao. Mất mạng em vẫn học được!' : `Đã tải ${ok}/${ids.length} bài. Em thử lại sau nhé!`, ok === ids.length ? 'ok' : 'try');
  };
  return (
    <Button size="md" variant="secondary" className="ln-dl__bulk" disabled={!!busy || !online} onClick={() => void go()} icon={<Icon name="upload" size={20} style={{ transform: 'rotate(180deg)' }} />}>
      {busy ? `Đang tải ${busy}` : `Tải bài được giao (${left})`}
    </Button>
  );
}

export default DownloadLessonButton;
