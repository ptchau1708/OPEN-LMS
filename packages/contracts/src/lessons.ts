import type { Grade, Item } from './items';
import type { SubjectId } from './subjects';
import type { MascotId } from './mascots';

/**
 * Bố cục slide co giãn. Slide không đặt vị trí tự do; lesson-player tự xếp lại theo màn hình:
 * TV/máy tính (ngang, rộng), máy tính bảng (ngang), điện thoại (dọc).
 */
export type SlideLayout =
  | 'title' // Tiêu đề: chữ lớn + linh vật
  | 'image-text' // Ảnh + chữ
  | 'fullscreen' // Toàn màn hình: ảnh hoặc video, có thể chen câu hỏi
  | 'activity' // Hoạt động: một item
  | 'compare' // So sánh 2 cột
  | 'game' // Trò chơi lớp: vòng quay, đua vịt, bom hẹn giờ
  | 'package' // Gói HTML5 (H5P, SCORM, HTML)
  | 'summary'; // Tổng kết: sao, huy hiệu

export interface VideoQuestion {
  /** Giây video dừng lại để hỏi. */
  atSec: number;
  itemId: string;
}

export interface CompareColumn {
  title: string;
  text?: string;
  image?: string;
}

export type GameKind = 'wheel' | 'duck-race' | 'time-bomb';

export interface Slide {
  id: string;
  layout: SlideLayout;
  title?: string;
  /** Chữ thường, cho phép xuống dòng; **đậm** đơn giản. */
  text?: string;
  /** URL ảnh hoặc "emoji:🍎". */
  image?: string;
  /** Câu đọc to cho slide (mặc định đọc title + text). */
  speak?: string;
  lang?: 'vi-VN' | 'en-US';
  /** layout 'fullscreen': YouTube/MP4. */
  video?: { url: string; questions?: VideoQuestion[] };
  /** layout 'fullscreen' (khi không có video): nhúng trang web học tập — chỉ nguồn trong danh sách cho phép (lesson-player embed.ts). */
  embed?: { url: string };
  /** layout 'activity': id item trong ngân hàng; hoặc item nhúng trực tiếp. */
  itemId?: string;
  item?: Item;
  /** layout 'compare'. */
  columns?: [CompareColumn, CompareColumn];
  /** layout 'game'. */
  game?: { kind: GameKind; entries?: string[]; seconds?: number };
  /** layout 'package'. */
  packageId?: string;
  /** Ghi chú cho GV, chỉ hiện trên điện thoại điều khiển. */
  teacherNotes?: string;
  /** Linh vật xuất hiện trên slide (title, summary). */
  mascot?: MascotId;
}

export interface Lesson {
  id: string;
  title: string;
  subject: SubjectId;
  grade: Grade;
  description?: string;
  /** Linh vật trên ảnh bìa; mặc định là linh vật của môn. */
  mascot?: MascotId;
  slides: Slide[];
  ownerId: string;
  status: 'draft' | 'published';
  /** Số phút ước tính. */
  minutes?: number;
  updatedAt: string;
}

export type PackageKind = 'h5p' | 'scorm12' | 'scorm2004' | 'html';

export interface ContentPackage {
  id: string;
  kind: PackageKind;
  title: string;
  /** URL gốc thư mục gói trên origin nội dung, kết thúc bằng '/'. */
  baseUrl: string;
  /** Tệp mở đầu, tương đối với baseUrl (index.html, story.html…). Với h5p là thư mục chứa h5p.json. */
  entry: string;
  ownerId: string;
  createdAt: string;
}

/** Tiến độ học sinh trong một bài giảng (tự học). */
export interface LessonProgress {
  userId: string;
  lessonId: string;
  slideIndex: number;
  completedSlides: string[];
  /** Câu trả lời đã nộp theo slide id. */
  answers: Record<string, { correct: boolean; score: number }>;
  starsEarned: number;
  completedAt?: string;
  updatedAt: string;
}

/** Khóa học = chuỗi bài giảng hiển thị dạng bản đồ phiêu lưu. */
export interface Course {
  id: string;
  title: string;
  subject: SubjectId;
  grade: Grade;
  lessonIds: string[];
}
