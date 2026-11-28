/**
 * Điều hướng app giáo viên: danh sách phẳng như cũ (mục "Đánh giá", "Trường", "Quản trị" chỉ là dòng tiêu đề nhỏ).
 * Mỗi mục có một màu riêng — dùng cho ô biểu tượng trên thanh bên và ô biểu tượng ở đầu trang.
 * Dùng chung cho thanh bên, đầu trang (PageHead) và ô tìm nhanh (Ctrl+K).
 */
import type { IconName } from '@openedu/ui';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Màu riêng của mục (hex). */
  color: string;
  end?: boolean;
  /** Mẫu đường dẫn để tô sáng mục (trang con). */
  match?: RegExp;
  /** Dòng tiêu đề nhỏ đặt trước mục này. */
  section?: string;
  admin?: boolean;
  /** Từ khóa thêm cho ô tìm nhanh (không dấu). */
  keywords?: string;
  /** Khóa đếm việc cần làm (lib/todayWork). */
  badge?: 'review' | 'parents' | 'attendance';
}

/** Bảng màu mục — tươi, rõ trên nền xanh mực của thanh bên và trên nền trắng. */
export const C = {
  sky: '#2d7ff9', indigo: '#5b6cf0', violet: '#8b5cf6', green: '#1ea566', teal: '#0d9c94', cyan: '#0ea5c6',
  red: '#e5484d', orange: '#f0702a', amber: '#e8a10a', lime: '#5a9e1c', pink: '#db4b8a', slate: '#7c8aa5',
} as const;

export const NAV: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: 'home', color: C.sky, end: true, keywords: 'trang chu viec hom nay dashboard' },
  { to: '/bai-giang', label: 'Bài giảng', icon: 'book', color: C.indigo, match: /^\/bai-giang/, keywords: 'soan bai slide' },
  { to: '/ngan-hang', label: 'Ngân hàng câu hỏi', icon: 'puzzle', color: C.violet, keywords: 'cau hoi de item' },
  { to: '/giao-bai', label: 'Giao bài', icon: 'check', color: C.green, keywords: 'bai tap ve nha han nop' },
  { to: '/bao-cao-bai-giao', label: 'Báo cáo bài giao', icon: 'map', color: C.teal, keywords: 'tien do bai giao' },
  { to: '/lop', label: 'Lớp học', icon: 'team', color: C.sky, match: /^\/lop(?!\/[^/]+\/ban-do)/, keywords: 'to nhom si so' },
  { to: '/hoc-sinh', label: 'Hồ sơ học sinh', icon: 'user', color: C.cyan, match: /^\/hoc-sinh/, keywords: 'ho so hoc sinh' },
  { to: '/kien-thuc', label: 'Kiến thức', icon: 'map', color: C.teal, match: /^\/(kien-thuc|lop\/[^/]+\/ban-do-kien-thuc)/, keywords: 'ban do kien thuc thanh thao lo hong' },
  { to: '/ki-nang', label: 'Danh mục kĩ năng', icon: 'puzzle', color: C.violet, keywords: 'ky nang chuong trinh' },
  { to: '/truc-tiep', label: 'Trực tiếp', icon: 'tv', color: C.red, match: /^\/truc-tiep/, keywords: 'lop truc tiep tv trinh chieu' },
  { to: '/dau-truong', label: 'Đấu trường', icon: 'trophy', color: C.orange, match: /^\/dau-truong/, keywords: 'giai dau leo thap doi khang' },
  { to: '/on-thi', label: 'Ôn thi', icon: 'scroll', color: C.amber, match: /^\/on-thi/, keywords: 'on thi trang nguyen vioedu violympic luyen thi de word' },
  { to: '/trang-hoc', label: 'Trang học', icon: 'puzzle', color: C.indigo, keywords: 'trang noi dung nhung web' },
  { to: '/thao-luan', label: 'Thảo luận', icon: 'team', color: C.cyan, match: /^\/thao-luan/, keywords: 'thao luan tro chuyen y kien' },
  { to: '/phu-huynh', label: 'Phụ huynh', icon: 'parent', color: C.pink, match: /^\/phu-huynh/, badge: 'parents', keywords: 'phu huynh tin nhan thong bao lien ket' },
  { to: '/bai-viet', label: 'Bài viết', icon: 'pencil', color: C.orange, section: 'Đánh giá', match: /^\/bai-viet/, keywords: 'tap lam van viet doan' },
  { to: '/cham-bai', label: 'Chấm bài', icon: 'eye', color: C.amber, match: /^\/cham-bai/, badge: 'review', keywords: 'duyet bai cham ai' },
  { to: '/de-kiem-tra', label: 'Đề kiểm tra', icon: 'check', color: C.red, match: /^\/de-kiem-tra/, keywords: 'kiem tra ma tran ra de' },
  { to: '/rubric', label: 'Tiêu chí chấm', icon: 'settings', color: C.slate, keywords: 'rubric thang diem' },
  { to: '/tt27', label: 'Nhận xét TT27', icon: 'passport', color: C.green, keywords: 'thong tu 27 danh gia nhan xet hoc ba' },
  { to: '/thi-dua', label: 'Thi đua', icon: 'trophy', color: C.amber, match: /^\/thi-dua/, keywords: 'khen nhac nho diem thi dua' },
  { to: '/vuon-lop', label: 'Vườn lớp & huy hiệu', icon: 'star', color: C.lime, keywords: 'huy hieu sao vuon' },
  { to: '/diem-danh', label: 'Điểm danh', icon: 'clock', color: C.teal, badge: 'attendance', keywords: 'chuyen can vang' },
  { to: '/bao-cao', label: 'Báo cáo', icon: 'map', color: C.sky, section: 'Trường', match: /^\/bao-cao(?!-bai-giao)/, keywords: 'bao cao truong khoi' },
  { to: '/xuat-nhap', label: 'Xuất / nhập dữ liệu', icon: 'upload', color: C.slate, keywords: 'excel vnedu classroom xuat nhap' },
  { to: '/quan-tri/lop', label: 'Quản lí lớp', icon: 'team', color: C.indigo, admin: true, section: 'Quản trị', keywords: 'quan tri tao lop' },
  { to: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: 'user', color: C.indigo, admin: true, keywords: 'quan tri tai khoan mat khau' },
  { to: '/quan-tri/cai-dat', label: 'Năm học & kì', icon: 'settings', color: C.slate, admin: true, keywords: 'nam hoc hoc ki' },
  { to: '/quan-tri/ung-dung', label: 'Ứng dụng kết nối', icon: 'puzzle', color: C.violet, admin: true, keywords: 'lti ung dung ngoai' },
];

/** Mục đang xem theo đường dẫn (mục khớp dài nhất). */
export function navFor(path: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const n of NAV) {
    const hit = n.match ? n.match.test(path) : n.end ? path === n.to : path === n.to || path.indexOf(n.to + '/') === 0;
    if (hit && (!best || n.to.length > best.to.length)) best = n;
  }
  return best;
}

/** "#2d7ff9" → "rgba(45, 127, 249, a)". */
export function tint(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Chuẩn hoá để tìm không dấu: "Điểm danh" → "diem danh". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
