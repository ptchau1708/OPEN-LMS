import type { TypeEditorProps } from '../../shared/typeApi';
import { OptionsSection } from '../MCQ/OptionsSection';

export function Editor({ item, onChange }: TypeEditorProps<'LISTEN_CHOOSE'>) {
  const correct = item.key?.correct ? [item.key.correct] : [];
  const noSpeak = !item.prompt.speak?.trim() && !item.prompt.audio;
  return (
    <>
      {noSpeak ? (
        <p className="ae-ed-warn">Hãy điền “Nội dung học sinh phải nghe” ở phần đề bài (hoặc URL âm thanh đọc sẵn).</p>
      ) : null}
      <OptionsSection
        title="Tranh / đáp án (chọn 1)"
        note="Nên dùng hình (emoji hoặc ảnh), chữ ngắn hoặc bỏ trống để em luyện nghe. Máy tự đọc một lần khi mở câu; lớp 1 ẩn chữ đề bài."
        options={item.payload.options}
        correct={correct}
        columns={item.payload.columns}
        onChange={({ options, correct: c, columns }) =>
          onChange({ ...item, payload: { ...item.payload, options, columns }, key: c[0] ? { correct: c[0] } : undefined })
        }
      />
    </>
  );
}
