/**
 * Phụ huynh (SQL 23): phụ huynh thấy gì theo từng lớp, mục chờ cô duyệt, thông báo gửi phụ huynh, nhắn tin hai chiều;
 * và Thông báo (chuông + thông báo đẩy) cho học sinh, giáo viên, phụ huynh.
 */

export type ShareKind = 'study' | 'skills' | 'assignments' | 'works' | 'tt27' | 'praise' | 'reminders' | 'attendance' | 'notes' | 'discuss' | 'arena';
export type ShareMode = 'auto' | 'review' | 'off';
export type ReviewKind = 'works' | 'tt27' | 'praise' | 'reminders' | 'attendance';

export interface ShareKindInfo {
  kind: ShareKind;
  label: string;
  /** Phụ huynh thấy những gì ở mục này. */
  detail: string;
  modes: ShareMode[];
  def: ShareMode;
}

export const SHARE_KINDS: ShareKindInfo[] = [
  { kind: 'study', label: 'Kết quả tự học', detail: 'Tóm tắt, bản tin tuần (ngày học, số câu, % đúng, sao), sao mỗi ngày, hoạt động gần đây', modes: ['auto', 'off'], def: 'auto' },
  { kind: 'skills', label: 'Con đã vững / cần luyện', detail: 'Kĩ năng con đã vững, kĩ năng cần luyện thêm và gợi ý ở nhà', modes: ['auto', 'off'], def: 'auto' },
  { kind: 'assignments', label: 'Bài được giao', detail: 'Bài cô giao, tiến độ, hạn nộp, lịch ôn; nhắc hạn bài', modes: ['auto', 'off'], def: 'auto' },
  { kind: 'works', label: 'Bài viết đã chấm', detail: 'Mức đạt, nhận xét và lời nhắn cho phụ huynh của bài viết đã duyệt', modes: ['auto', 'review', 'off'], def: 'auto' },
  { kind: 'tt27', label: 'Kết quả đánh giá TT27', detail: 'Kết quả giữa kì / cuối kì đã chốt: môn học, phẩm chất, năng lực, lời nhắn của cô', modes: ['auto', 'review', 'off'], def: 'auto' },
  { kind: 'praise', label: 'Lời khen, điểm thi đua', detail: 'Mỗi lần con được khen và điểm thi đua trong tuần', modes: ['auto', 'review', 'off'], def: 'auto' },
  { kind: 'reminders', label: 'Nhắc nhở nề nếp', detail: 'Mỗi lần cô nhắc nhở (nói chuyện riêng, quên đồ dùng…)', modes: ['auto', 'review', 'off'], def: 'review' },
  { kind: 'attendance', label: 'Chuyên cần', detail: 'Đi học, đi muộn, vắng có phép, vắng không phép; báo ngay khi con vắng', modes: ['auto', 'review', 'off'], def: 'auto' },
  { kind: 'notes', label: 'Thầy cô ghi chép', detail: 'Chỉ những ghi chép cô tích "Chia sẻ phụ huynh"', modes: ['auto', 'off'], def: 'auto' },
  { kind: 'discuss', label: 'Bài con thảo luận', detail: 'Bài con đăng trong Thảo luận đã được cô duyệt', modes: ['auto', 'off'], def: 'auto' },
  { kind: 'arena', label: 'Đấu trường', detail: 'Cúp, kết quả giải đấu, xếp hạng của con', modes: ['auto', 'off'], def: 'auto' },
];

export const SHARE_MODE_LABEL: Record<ShareMode, string> = { auto: 'Tự động', review: 'Cô duyệt rồi mới gửi', off: 'Không gửi' };

export function defaultShareModes(): Record<ShareKind, ShareMode> {
  return Object.fromEntries(SHARE_KINDS.map((k) => [k.kind, k.def])) as Record<ShareKind, ShareMode>;
}

export interface ParentShareSettings {
  classId: string;
  modes: Record<ShareKind, ShareMode>;
  /** Phụ huynh được nhắn tin cho cô. */
  msgEnabled: boolean;
  /** Giờ nhận tin (HH:MM). Ngoài giờ phụ huynh vẫn gửi được, cô nhận thông báo khi vào giờ. */
  msgFrom: string;
  msgTo: string;
  students: number;
  linkedStudents: number;
  parents: number;
  updatedAt?: string | null;
}

export interface ReviewItem {
  kind: ReviewKind;
  refId: string;
  studentId: string;
  studentName: string;
  classId: string;
  at: string;
  title: string;
  detail?: string | null;
  points?: number;
}

export interface ParentPreviewItem { kind: ShareKind; mode: ShareMode; total: number; shown: number }
export interface ParentPreview {
  studentId: string;
  studentName: string;
  classId: string;
  items: ParentPreviewItem[];
  parents: { id: string; name: string; relation?: string | null }[];
  waiting: number;
}

export type PostAudience = 'class' | 'students';

export interface ParentPostInput {
  classId: string;
  audience: PostAudience;
  studentIds?: string[];
  title: string;
  body: string;
  ackRequired: boolean;
  /** ISO; bỏ trống = gửi ngay. */
  sendAt?: string;
}

export interface PostParentState { id: string; name: string; relation?: string | null; readAt?: string | null; ackedAt?: string | null }
export interface PostStudentState { studentId: string; studentName: string; parents: PostParentState[] }

export interface ParentPost {
  id: string;
  classId: string;
  authorId?: string | null;
  authorName: string;
  audience: PostAudience;
  studentIds: string[];
  studentNames: string[];
  title: string;
  body: string;
  ackRequired: boolean;
  sendAt: string;
  sent: boolean;
  recalled: boolean;
  remindedAt?: string | null;
  createdAt: string;
  /** Số phụ huynh nhận. */
  parents: number;
  reads: number;
  acks: number;
  /** Số em chưa có phụ huynh liên kết (không ai nhận). */
  noParent: number;
  students?: PostStudentState[];
}

export interface InboxPost {
  id: string;
  title: string;
  body: string;
  at: string;
  teacherName: string;
  private: boolean;
  ackRequired: boolean;
  readAt?: string | null;
  ackedAt?: string | null;
}

export interface InboxItem extends ReviewItem {
  note?: string | null;
  sentAt: string;
  teacherName: string;
}

export interface MsgWindow { enabled: boolean; from: string; to: string; open: boolean }
export interface ThreadLast { body: string; at: string; fromTeacher: boolean; senderName: string }

export interface ParentInbox {
  childId: string;
  classId: string | null;
  modes: Record<ShareKind, ShareMode>;
  posts: InboxPost[];
  items: InboxItem[];
  thread: { unread: number; last: ThreadLast | null };
  msg: MsgWindow;
  teachers: string[];
}

export interface ThreadSummary { studentId: string; studentName: string; parents: number; unread: number; last: ThreadLast | null }

export interface ParentMessage {
  id: string;
  body: string;
  deleted: boolean;
  fromTeacher: boolean;
  senderId?: string | null;
  senderName: string;
  mine: boolean;
  at: string;
  readAt?: string | null;
  postId?: string | null;
  postTitle?: string | null;
}

export interface ParentThread {
  studentId: string;
  studentName: string;
  classId: string | null;
  className?: string | null;
  asTeacher: boolean;
  parents: { id: string; name: string; relation?: string | null }[];
  teachers: string[];
  msg: MsgWindow;
  messages: ParentMessage[];
}

/* =============================================================================
 * Thông báo
 * ========================================================================== */
export type NotifyAudience = 'hs' | 'gv' | 'ph';

export interface NotifyKindInfo { kind: string; label: string; who: NotifyAudience; sensitive?: boolean }

export const NOTIFY_KINDS: NotifyKindInfo[] = [
  { kind: 'ph-thong-bao', label: 'Thông báo của thầy cô', who: 'ph' },
  { kind: 'ph-tin-nhan', label: 'Tin nhắn của thầy cô', who: 'ph' },
  { kind: 'ph-chuyen-can', label: 'Con vắng / đi muộn', who: 'ph', sensitive: true },
  { kind: 'ph-bai-viet', label: 'Bài viết của con đã chấm', who: 'ph' },
  { kind: 'ph-tt27', label: 'Kết quả đánh giá', who: 'ph' },
  { kind: 'ph-khen', label: 'Con được khen', who: 'ph' },
  { kind: 'ph-nhac-nho', label: 'Nhắc nhở nề nếp', who: 'ph', sensitive: true },
  { kind: 'ph-ghi-chep', label: 'Thầy cô ghi chép', who: 'ph', sensitive: true },
  { kind: 'ph-han-bai', label: 'Con sắp hết hạn bài', who: 'ph' },
  { kind: 'ph-ban-tin', label: 'Bản tin tuần', who: 'ph' },
  { kind: 'ph-cup', label: 'Con nhận cúp Đấu trường', who: 'ph' },
  { kind: 'hs-bai-moi', label: 'Bài mới được giao', who: 'hs' },
  { kind: 'hs-han-bai', label: 'Sắp hết hạn bài', who: 'hs' },
  { kind: 'hs-bai-cham', label: 'Bài được cô chấm / trả lại', who: 'hs' },
  { kind: 'hs-khen', label: 'Được cô khen', who: 'hs' },
  { kind: 'hs-huy-hieu', label: 'Nhận huy hiệu', who: 'hs' },
  { kind: 'hs-giai-dau', label: 'Đến lượt đấu trong giải', who: 'hs' },
  { kind: 'hs-thao-luan', label: 'Bình luận bài thảo luận', who: 'hs' },
  { kind: 'gv-tin-nhan', label: 'Tin nhắn của phụ huynh', who: 'gv' },
  { kind: 'gv-nop-bai', label: 'Bài mới cần chấm', who: 'gv' },
  { kind: 'gv-thao-luan', label: 'Thảo luận chờ duyệt / bị báo', who: 'gv' },
  { kind: 'gv-xac-nhan', label: 'Phụ huynh đã xác nhận đủ', who: 'gv' },
  { kind: 'gv-lien-ket', label: 'Phụ huynh mới liên kết', who: 'gv' },
  { kind: 'gv-giai-dau', label: 'Giải đấu sang vòng / kết thúc', who: 'gv' },
];

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  ref: Record<string, unknown>;
  count: number;
  at: string;
  readAt?: string | null;
}

export interface NotifyList { unread: number; items: AppNotification[] }

export interface NotifyPrefs {
  /** Loại thông báo KHÔNG đẩy lên điện thoại (vẫn hiện trong chuông). */
  pushOff: string[];
  /** Giờ yên lặng (HH:MM, giờ Việt Nam); null = không đặt. */
  quietFrom: string | null;
  quietTo: string | null;
  /** Hiện nội dung tin nhạy cảm trên màn hình khoá. */
  showSensitive: boolean;
  /** Số máy đang nhận thông báo đẩy. */
  devices: number;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { pushOff: [], quietFrom: '21:00', quietTo: '06:30', showSensitive: false, devices: 0 };

export interface PushInfo { ready: boolean; publicKey: string | null; devices: number }
