import { uid, type Lesson, type Profile } from '@openedu/contracts';

/** Bản sao của bài giảng để sửa thành của mình: id mới (bài và từng slide), nháp, ghi "(bản sao)". Câu hỏi trong bài dùng chung. */
export function copyLesson(l: Lesson, me: Profile): Lesson {
  const { id: _old, ...rest } = l;
  void _old;
  return {
    ...rest,
    id: uid('l'),
    title: `${l.title} (bản sao)`.slice(0, 200),
    ownerId: me.id,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    slides: l.slides.map((s) => ({ ...s, id: uid('s') })),
  };
}

/** Thầy/cô sửa trực tiếp được bài này không (chủ bài hoặc quản trị viên). */
export const canEditLesson = (l: Pick<Lesson, 'ownerId'>, me: Profile): boolean => me.role === 'admin' || l.ownerId === me.id;
