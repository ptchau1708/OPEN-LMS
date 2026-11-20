import type { TypeEditorProps } from '../../shared/typeApi';
import { OptionsSection } from './OptionsSection';

export function Editor({ item, onChange }: TypeEditorProps<'MCQ'>) {
  const correct = item.key?.correct ? [item.key.correct] : [];
  return (
    <OptionsSection
      title="Đáp án (chọn 1)"
      note="Thứ tự thẻ được xáo cố định theo câu hỏi: mọi máy và màn hình TV thấy giống nhau."
      options={item.payload.options}
      correct={correct}
      columns={item.payload.columns}
      withSpeak={item.grade <= 2}
      onChange={({ options, correct: c, columns }) =>
        onChange({ ...item, payload: { ...item.payload, options, columns }, key: c[0] ? { correct: c[0] } : undefined })
      }
    />
  );
}
