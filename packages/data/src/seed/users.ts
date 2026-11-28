import type { ClassInfo, Grade, MascotId, Profile, StudentSettings } from '@openedu/contracts';

/** Mật khẩu chung của mọi tài khoản mẫu. */
export const DEMO_PASSWORD = '123456';

export function defaultSettings(grade?: Grade): StudentSettings {
  return { bigText: !grade || grade <= 2, autoRead: grade === 1, sound: true, reducedMotion: false };
}

function student(username: string, name: string, grade: Grade, classId: string, avatarMascot: MascotId, avatarColor: string): Profile {
  return { id: `u-${username}`, role: 'student', name, username, grade, classId, avatarMascot, avatarColor, settings: defaultSettings(grade) };
}

export const DEMO_USERS: Profile[] = [
  { id: 'u-colan', role: 'teacher', name: 'Cô Lan', username: 'colan', classId: 'c-2a', avatarMascot: 'nghe', avatarColor: '#20a974' },
  { id: 'u-cohoa', role: 'teacher', name: 'Cô Hoa', username: 'cohoa', classId: 'c-1b', avatarMascot: 'koala', avatarColor: '#ff5d8f' },
  { id: 'u-thaynam', role: 'teacher', name: 'Thầy Nam', username: 'thaynam', classId: 'c-3c', avatarMascot: 'kiwi', avatarColor: '#8b5cf6' },
  { id: 'u-admin', role: 'admin', name: 'Quản trị trường', username: 'admin', avatarMascot: 'panda', avatarColor: '#64748b' },
  student('an2a1', 'Minh An', 2, 'c-2a', 'shiba', '#e8964a'),
  student('binh2a2', 'Gia Bình', 2, 'c-2a', 'nghe', '#2f7bf6'),
  student('chi2a3', 'Bảo Chi', 2, 'c-2a', 'koala', '#ff5d8f'),
  student('dung2a4', 'Tiến Dũng', 2, 'c-2a', 'panda', '#20a974'),
  student('em1b1', 'Ngọc Em', 1, 'c-1b', 'nghe', '#ffb020'),
  student('phuong3c1', 'Thu Phương', 3, 'c-3c', 'kiwi', '#8b5cf6'),
  { id: 'u-phuhuynh', role: 'parent', name: 'Mẹ bạn Minh An', username: 'phuhuynh', avatarMascot: 'nghe', avatarColor: '#0ea5a4' },
  /* ---- Lớp 4A (hồ sơ học sinh, lỗ hổng kiến thức) ---- */
  { id: 'u-cothu', role: 'teacher', name: 'Cô Thu', username: 'cothu', classId: 'c-4a', avatarMascot: 'capybara', avatarColor: '#0ea5a4' },
  student('hai4a1', 'Minh Hải', 4, 'c-4a', 'shiba', '#2f7bf6'),
  student('lan4a2', 'Ngọc Lan', 4, 'c-4a', 'cong', '#ff5d8f'),
  student('khoa4a3', 'Đăng Khoa', 4, 'c-4a', 'panda', '#20a974'),
  student('mai4a4', 'Thanh Mai', 4, 'c-4a', 'koala', '#8b5cf6'),
  student('tuan4a5', 'Anh Tuấn', 4, 'c-4a', 'kiwi', '#ff8a3d'),
  student('vy4a6', 'Tường Vy', 4, 'c-4a', 'nghe', '#e8485f'),
  student('nam4a7', 'Hoài Nam', 4, 'c-4a', 'ga', '#64748b'),
  student('thao4a8', 'Phương Thảo', 4, 'c-4a', 'capybara', '#0ea5a4'),
  { id: 'u-phuhuynh4a', role: 'parent', name: 'Bố bạn Ngọc Lan', username: 'phuhuynh4a', avatarMascot: 'cong', avatarColor: '#ff8a3d' },
  /* ---- Lớp 5A (Ôn thi: Tiếng Việt, Toán lớp 5) ---- */
  { id: 'u-thayquang', role: 'teacher', name: 'Thầy Quang', username: 'thayquang', classId: 'c-5a', avatarMascot: 'panda', avatarColor: '#1f63cf' },
  student('khang5a1', 'Minh Khang', 5, 'c-5a', 'shiba', '#1f63cf'),
  student('ngan5a2', 'Bảo Ngân', 5, 'c-5a', 'koala', '#0b9494'),
  student('phuc5a3', 'Hồng Phúc', 5, 'c-5a', 'kiwi', '#ff8a3d'),
  student('trang5a4', 'Thu Trang', 5, 'c-5a', 'nghe', '#8b5cf6'),
];

/** Phụ huynh → các con. */
export const DEMO_GUARDIANS: Record<string, string[]> = { 'u-phuhuynh': ['u-an2a1'], 'u-phuhuynh4a': ['u-lan4a2'] };

export const DEMO_CLASSES: ClassInfo[] = [
  {
    id: 'c-2a',
    name: '2A',
    grade: 2,
    teacherId: 'u-colan',
    studentIds: ['u-an2a1', 'u-binh2a2', 'u-chi2a3', 'u-dung2a4'],
    teams: [
      { id: 't-2a-mat-troi', name: 'Tổ Mặt Trời', color: '#ff8a3d', studentIds: ['u-an2a1', 'u-chi2a3'] },
      { id: 't-2a-cau-vong', name: 'Tổ Cầu Vồng', color: '#2f7bf6', studentIds: ['u-binh2a2', 'u-dung2a4'] },
    ],
  },
  { id: 'c-1b', name: '1B', grade: 1, teacherId: 'u-cohoa', studentIds: ['u-em1b1'], teams: [] },
  { id: 'c-3c', name: '3C', grade: 3, teacherId: 'u-thaynam', studentIds: ['u-phuong3c1'], teams: [] },
  {
    id: 'c-4a',
    name: '4A',
    grade: 4,
    teacherId: 'u-cothu',
    studentIds: ['u-hai4a1', 'u-lan4a2', 'u-khoa4a3', 'u-mai4a4', 'u-tuan4a5', 'u-vy4a6', 'u-nam4a7', 'u-thao4a8'],
    teams: [
      { id: 't-4a-hai-au', name: 'Tổ Hải Âu', color: '#2f7bf6', studentIds: ['u-hai4a1', 'u-lan4a2', 'u-khoa4a3', 'u-mai4a4'] },
      { id: 't-4a-son-ca', name: 'Tổ Sơn Ca', color: '#ff8a3d', studentIds: ['u-tuan4a5', 'u-vy4a6', 'u-nam4a7', 'u-thao4a8'] },
    ],
  },
  { id: 'c-5a', name: '5A', grade: 5, teacherId: 'u-thayquang', studentIds: ['u-khang5a1', 'u-ngan5a2', 'u-phuc5a3', 'u-trang5a4'], teams: [] },
];

/** Tên HS lớp 2A (vòng quay trong bài Toán). */
export const CLASS_2A_NAMES = DEMO_CLASSES[0].studentIds.map((id) => DEMO_USERS.find((u) => u.id === id)?.name ?? id);
