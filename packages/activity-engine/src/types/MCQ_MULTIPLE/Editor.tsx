import type { TypeEditorProps } from '../../shared/typeApi';
import { OptionsSection } from '../MCQ/OptionsSection';

export function Editor({ item, onChange }: TypeEditorProps<'MCQ_MULTIPLE'>) {
  const correct = item.key?.correct ?? [];
  return (
    <OptionsSection
      title="Đáp án (chọn nhiều)"
      note="Đánh dấu tất cả đáp án đúng. Học sinh phải chọn đủ và không chọn thừa mới được tính đúng hoàn toàn; chọn được một phần thì có điểm từng phần."
      options={item.payload.options}
      correct={correct}
      multi
      columns={item.payload.columns}
      withSpeak={item.grade <= 2}
      onChange={({ options, correct: c, columns }) =>
        onChange({ ...item, payload: { ...item.payload, options, columns }, key: { correct: c } })
      }
    />
  );
}
