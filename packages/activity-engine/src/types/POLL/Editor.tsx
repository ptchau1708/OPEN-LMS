import type { TypeEditorProps } from '../../shared/typeApi';
import { OptionsSection } from '../MCQ/OptionsSection';

export function Editor({ item, onChange }: TypeEditorProps<'POLL'>) {
  return (
    <OptionsSection
      title="Các lựa chọn (không chấm điểm)"
      note="Không có đáp án đúng. Khi trình chiếu, TV hiện các lựa chọn và kết quả bình chọn của cả lớp."
      options={item.payload.options}
      showColumns={false}
      withSpeak={item.grade <= 2}
      onChange={({ options }) => onChange({ ...item, payload: { ...item.payload, options } })}
    />
  );
}
