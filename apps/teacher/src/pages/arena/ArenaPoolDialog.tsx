/** Ngân hàng câu hỏi → "Đưa vào Đấu trường": thêm câu đã chọn vào bộ câu của lớp, hoặc mở giải đấu với các câu này. */
import { useState } from 'react';
import { Link } from 'react-router';
import type { ClassInfo, Item } from '@openedu/contracts';
import { CUP_TYPES, useAddToArenaPool, useSaveArenaSettings } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field } from '../../components/common';
import { CupDialog } from './CupDialog';

export function ArenaPoolDialog({ classes, items, onClose, onDone }: { classes: ClassInfo[]; items: Item[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [only, setOnly] = useState(false);
  const [cup, setCup] = useState(false);
  const add = useAddToArenaPool();
  const save = useSaveArenaSettings();
  const ok = items.filter((i) => CUP_TYPES.includes(i.type));
  const skipped = items.length - ok.length;
  const cls = classes.find((c) => c.id === classId);
  if (cup) return <CupDialog classes={classes} classId={classId} itemIds={ok.map((i) => i.id)} onClose={onClose} />;
  const go = () => add.mutate({ classId, itemIds: ok.map((i) => i.id) }, {
    onSuccess: (n) => {
      const done = () => onDone(`Đã đưa ${ok.length} câu vào Đấu trường lớp ${cls?.name ?? ''} (bộ câu có ${n} câu).${only ? ' Lớp chỉ dùng các câu này khi chơi tự do.' : ''}`);
      if (only) save.mutate({ classId, patch: { source: 'picked' } }, { onSuccess: done });
      else done();
    },
  });
  return (
    <Dialog open title="Đưa vào Đấu trường" onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn icon="trophy" disabled={ok.length < 3} onClick={() => setCup(true)} data-testid="pool-cup">Mở giải đấu với {ok.length} câu này</Btn>
      <Btn kind="primary" icon="plus" disabled={!ok.length || !classId || add.isPending || save.isPending} onClick={go} data-testid="pool-add">Đưa {ok.length} câu vào Đấu trường</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-small">
          Bộ câu Đấu trường của lớp dùng cho <b>Đấu 1–1</b>, <b>Leo tháp</b> (khi lớp chọn "Chỉ câu thầy/cô đưa vào") và để mở <b>giải đấu</b>.
          Chỉ các dạng trả lời nhanh, máy chấm được (chọn đáp án, điền ngắn, sắp xếp…) mới dùng để đấu.
          {skipped ? <b className="tc-warn"> Bỏ qua {skipped} câu không phải dạng trả lời nhanh.</b> : null}
        </p>
        <Field label="Lớp">
          <select className="tc-input" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="pool-class">
            {classes.map((c) => <option key={c.id} value={c.id}>Lớp {c.name}</option>)}
          </select>
        </Field>
        <label className="tc-switch"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Khi chơi tự do, lớp chỉ dùng câu thầy/cô đưa vào (không lấy tự động)</label>
        <p className="tc-small tc-muted">Xem, bớt câu và đặt giờ mở cửa ở <Link to={`/dau-truong?the=cai-dat&lop=${encodeURIComponent(classId)}`}>Đấu trường → Cài đặt</Link>.</p>
        <ErrorNote error={add.error ?? save.error} />
      </div>
    </Dialog>
  );
}
