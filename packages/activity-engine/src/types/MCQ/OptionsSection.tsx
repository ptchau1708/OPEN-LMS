import type { Choice } from '@openedu/contracts';
import { ChoiceListEditor, EdSection, Seg } from '../../shared/CommonFieldsEditor';

type Cols = 1 | 2 | 4;

/** Phần soạn lựa chọn cho MCQ, MCQ_MULTIPLE, LISTEN_CHOOSE, POLL. */
export function OptionsSection({ title = 'Các lựa chọn', options, correct, multi = false, columns, showColumns = true, withSpeak = false, note, onChange }: {
  title?: string;
  options: Choice[];
  /** undefined = không chấm (POLL). */
  correct?: string[];
  multi?: boolean;
  columns?: Cols;
  showColumns?: boolean;
  withSpeak?: boolean;
  note?: string;
  onChange: (p: { options: Choice[]; correct: string[]; columns?: Cols }) => void;
}) {
  const missing = correct !== undefined && correct.length === 0;
  const empty = options.some((o) => !o.text?.trim() && !o.image);
  return (
    <EdSection
      title={title}
      actions={showColumns ? (
        <Seg<Cols | 0>
          label="Số cột"
          value={columns ?? 0}
          onChange={(v) => onChange({ options, correct: correct ?? [], columns: v === 0 ? undefined : v })}
          options={[{ value: 0, label: 'Tự động' }, { value: 1, label: '1 cột' }, { value: 2, label: '2 cột' }, { value: 4, label: '4 cột' }]}
        />
      ) : undefined}
    >
      {note ? <p className="ae-ed-help">{note}</p> : null}
      <ChoiceListEditor
        choices={options}
        correct={correct}
        multi={multi}
        withSpeak={withSpeak}
        min={2}
        max={8}
        addLabel="Thêm lựa chọn"
        textPlaceholder="Chữ trên thẻ (có thể để trống nếu có hình)"
        onChange={(o, c) => onChange({ options: o, correct: c, columns })}
      />
      {missing ? <p className="ae-ed-warn">Chưa đánh dấu đáp án đúng.</p> : null}
      {empty ? <p className="ae-ed-warn">Có lựa chọn chưa có chữ hoặc hình.</p> : null}
    </EdSection>
  );
}
