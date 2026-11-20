import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Grade, Profile, SubjectId } from '@openedu/contracts';
import { useCreateAssignment, useCreateLiveSession, useSaveLesson } from '@openedu/data';
import { assignmentFor, remediationLesson } from './mastery';

export interface RemediationTarget {
  key: string;
  title: string;
  note?: string;
  itemIds: string[];
  studentIds: string[];
  classId: string;
  subject: SubjectId;
  grade: Grade;
}

/** Giao bộ ôn (tạo bài giảng ngắn từ itemIds rồi giao) hoặc mở tiết ôn trực tiếp. */
export function useRemediate(user: Profile) {
  const nav = useNavigate();
  const save = useSaveLesson();
  const assign = useCreateAssignment();
  const live = useCreateLiveSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ key: string; error: unknown } | null>(null);

  const make = (t: RemediationTarget) => save.mutateAsync(remediationLesson({ title: t.title, subject: t.subject, grade: t.grade, ownerId: user.id, itemIds: t.itemIds, note: t.note }));

  const run = async (t: RemediationTarget, mode: 'assign' | 'live') => {
    if (!t.itemIds.length) { setError({ key: t.key, error: new Error('Chưa có câu hỏi gợi ý cho nhóm này — thêm câu hỏi có gắn kĩ năng trong Ngân hàng hoạt động.') }); return; }
    setBusy(`${t.key}:${mode}`);
    setError(null);
    try {
      const lesson = await make(t);
      if (mode === 'assign') {
        const a = await assign.mutateAsync(assignmentFor(lesson, t.classId, t.studentIds, user.id));
        setDone((d) => ({ ...d, [t.key]: `Đã giao “${a.title}” cho ${t.studentIds.length} em (hạn 3 ngày).` }));
      } else {
        const s = await live.mutateAsync({ lessonId: lesson.id, classId: t.classId });
        nav(`/truc-tiep/${s.sessionId}?lop=${t.classId}`);
      }
    } catch (e) {
      setError({ key: t.key, error: e });
    } finally {
      setBusy(null);
    }
  };
  return { run, busy, done, errorFor: (key: string) => (error?.key === key ? error.error : null) };
}
