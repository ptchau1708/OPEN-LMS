/**
 * Ngân hàng nhận xét của thầy/cô — câu mẫu theo mức T / H / C, cho học sinh và cho phụ huynh.
 * Mặc định từ LEVEL_DEFAULT_FEEDBACK; thầy/cô thêm / sửa / xoá / đưa lên đầu (câu đầu tiên là câu mặc định khi để trống).
 * Lưu theo tài khoản (cài đặt cá nhân, đồng bộ giữa các máy khi đã chạy SQL 18).
 */
import { useState } from 'react';
import { TT27_LEVEL_LABEL, type Tt27Level } from '@openedu/contracts';
import { LEVEL_DEFAULT_FEEDBACK, usePref } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Seg } from '../components/common';

export type BankSide = 'student' | 'parent';
export type CommentBank = Record<Tt27Level, Record<BankSide, string[]>>;
const LEVELS: Tt27Level[] = ['T', 'H', 'C'];

export const DEFAULT_BANK: CommentBank = {
  T: { student: [LEVEL_DEFAULT_FEEDBACK.T.student], parent: [LEVEL_DEFAULT_FEEDBACK.T.parent] },
  H: { student: [LEVEL_DEFAULT_FEEDBACK.H.student], parent: [LEVEL_DEFAULT_FEEDBACK.H.parent] },
  C: { student: [LEVEL_DEFAULT_FEEDBACK.C.student], parent: [LEVEL_DEFAULT_FEEDBACK.C.parent] },
};

function clean(v: unknown): CommentBank {
  const out: CommentBank = JSON.parse(JSON.stringify(DEFAULT_BANK)) as CommentBank;
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, Record<string, unknown>>;
  for (const l of LEVELS) for (const side of ['student', 'parent'] as BankSide[]) {
    const list = o[l]?.[side];
    if (Array.isArray(list)) out[l][side] = list.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 30);
  }
  return out;
}

export const COMMENT_BANK_KEY = 'nhan-xet.muc';

export function useCommentBank(userId: string) {
  const pref = usePref<CommentBank>(userId, COMMENT_BANK_KEY);
  const bank = clean(pref.value);
  return {
    bank,
    /** Câu mặc định (câu đầu) của mức, dùng khi thầy/cô để trống. */
    first: (l: Tt27Level, side: BankSide) => bank[l][side][0] ?? LEVEL_DEFAULT_FEEDBACK[l][side],
    save: (b: CommentBank | null) => pref.set(b),
    saving: pref.saving,
    error: pref.error,
    synced: pref.synced,
  };
}

/** Dải câu mẫu bấm để chèn vào ô nhận xét. */
export function BankChips({ list, onPick, label }: { list: string[]; onPick: (t: string) => void; label: string }) {
  if (!list.length) return null;
  return (
    <div className="tc-bankchips" role="group" aria-label={label}>
      {list.map((t, i) => <button key={i} type="button" className="tc-bankchip" title="Bấm để dùng câu này" onClick={() => onPick(t)}>{t}</button>)}
    </div>
  );
}

/** Hộp sửa ngân hàng nhận xét. */
export function CommentBankDialog({ userId, onClose, initialLevel = 'T' }: { userId: string; onClose: () => void; initialLevel?: Tt27Level }) {
  const cb = useCommentBank(userId);
  const [bank, setBank] = useState<CommentBank>(() => JSON.parse(JSON.stringify(cb.bank)) as CommentBank);
  const [level, setLevel] = useState<Tt27Level>(initialLevel);
  const set = (side: BankSide, list: string[]) => setBank((b) => ({ ...b, [level]: { ...b[level], [side]: list } }));
  const col = (side: BankSide, title: string) => {
    const list = bank[level][side];
    return (
      <section className="tc-bankcol">
        <h3 className="tc-h3">{title} <span className="tc-muted tc-small">{list.length}</span></h3>
        <ol className="tc-banklist">
          {list.map((t, i) => (
            <li key={i}>
              <textarea className="tc-input tc-input--sm" rows={2} aria-label={`${title} — câu ${i + 1}`} value={t} onChange={(e) => set(side, list.map((x, j) => (j === i ? e.target.value : x)))} />
              <span className="tc-col">
                <Btn size="sm" kind="ghost" icon="star" disabled={i === 0} title="Đưa lên đầu (câu mặc định)" aria-label={`Đưa câu ${i + 1} lên đầu`} onClick={() => set(side, [t, ...list.filter((_, j) => j !== i)])} />
                <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá câu ${i + 1}`} onClick={() => set(side, list.filter((_, j) => j !== i))} data-testid="bank-delete" />
              </span>
            </li>
          ))}
        </ol>
        <Btn size="sm" icon="plus" onClick={() => set(side, [...list, ''])} data-testid={`bank-add-${side}`}>Thêm câu</Btn>
      </section>
    );
  };
  const submit = () => {
    const out = JSON.parse(JSON.stringify(bank)) as CommentBank;
    for (const l of LEVELS) for (const s of ['student', 'parent'] as BankSide[]) out[l][s] = out[l][s].map((x) => x.trim()).filter(Boolean);
    cb.save(out);
    onClose();
  };
  return (
    <Dialog open wide title="Mẫu nhận xét của tôi" onClose={onClose} footer={<>
      <Btn kind="ghost" onClick={() => setBank(JSON.parse(JSON.stringify(DEFAULT_BANK)) as CommentBank)}>Về câu mẫu ban đầu</Btn>
      <span className="tc-ebar__spacer" />
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" onClick={submit} data-testid="bank-save">Lưu</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-small tc-muted">Câu mẫu hiện dưới ô nhận xét khi tự chấm — bấm để chèn. Câu đầu tiên (★) dùng khi thầy/cô để trống ô nhận xét.{cb.synced ? ' Lưu theo tài khoản, máy nào cũng dùng được.' : ''}</p>
        <Seg label="Mức" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l, label: `${l} · ${TT27_LEVEL_LABEL[l]}` }))} />
        <div className="tc-grid2">{col('student', 'Cho học sinh')}{col('parent', 'Cho phụ huynh')}</div>
        <ErrorNote error={cb.error} />
      </div>
    </Dialog>
  );
}
