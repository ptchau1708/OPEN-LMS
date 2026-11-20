import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { seededShuffle } from '../../shared/shuffle';
import { ChoiceRows, EdRoot, EdSection, EdWarn, QuickAdd, newId } from '../DRAG_DROP/edkit';

/** GV: nhập câu đúng, tách thành các thẻ từ. Thứ tự danh sách = câu đúng. */
export function Editor({ item, onChange }: TypeEditorProps<'SENTENCE_SCRAMBLE'>) {
  const { words } = item.payload;
  const set = (list: Choice[]) => onChange({ ...item, payload: { ...item.payload, words: list }, key: { order: list.map((c) => c.id) } });
  const sentence = words.map((w) => w.text || '').join(' ').trim();
  const preview = seededShuffle(words, item.id);
  return (
    <EdRoot type="SENTENCE_SCRAMBLE">
      <EdSection title="Câu đúng" hint="Gõ câu và dùng dấu / để tách thẻ. Một thẻ có thể gồm nhiều tiếng (vd: đúng giờ).">
        <QuickAdd
          label="Tách câu thành thẻ (thay danh sách hiện tại)"
          placeholder="Em / đi / học / đúng giờ"
          sep="/"
          buttonLabel="Tách thẻ"
          onAdd={(t) => set(t.map((x) => ({ id: newId('w'), text: x })))}
        />
        <div className="ae-ed-preview"><span>Câu đúng:</span><strong>{sentence || '…'}</strong></div>
      </EdSection>
      <EdSection title="Các thẻ từ — theo thứ tự đúng">
        <ChoiceRows items={words} idPrefix="w" addLabel="Thêm thẻ từ" placeholder="Từ" numbered withImage={false} withSpeak min={2} onChange={set} />
        <div className="ae-ed-preview">
          <span>Học sinh thấy:</span>
          {preview.map((c) => <span className="ae-ed-pill" key={c.id}>{c.text || '…'}</span>)}
        </div>
      </EdSection>
      {words.length < 2 ? <EdWarn>Cần ít nhất 2 thẻ từ.</EdWarn> : null}
      {words.some((w) => !w.text?.trim()) ? <EdWarn>Có thẻ từ đang trống.</EdWarn> : null}
    </EdRoot>
  );
}
