/**
 * Điều hướng app giáo viên: "Tổng quan" + 5 nhóm (Dạy học · Giao & chấm · Lớp & học sinh · Kết nối · Trường & thiết lập).
 * Dùng chung cho thanh bên và ô tìm nhanh (Ctrl+K).
 */
import type { IconName } from '@openedu/ui';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Mẫu đường dẫn để tô sáng mục (trang con). */
  match?: RegExp;
  admin?: boolean;
  /** Từ khóa thêm cho ô tìm nhanh (không dấu cũng được). */
  keywords?: string;
  /** Khóa đếm việc cần làm (lib/todayWork). */
  badge?: 'review' | 'parents' | 'attendance';
}

export interface NavGroup {
  id: 'day-hoc' | 'giao-cham' | 'lop-hs' | 'ket-noi' | 'truong';
  label: string;
  items: NavItem[];
}

export const NAV_HOME: NavItem = { to: '/', label: 'Tổng quan', icon: 'home', end: true, keywords: 'trang chu viec hom nay dashboard' };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'day-hoc', label: 'Dạy học', items: [
      { to: '/bai-giang', label: 'Bài giảng', icon: 'book', match: /^\/bai-giang/, keywords: 'soan bai slide' },
      { to: '/ngan-hang', label: 'Ngân hàng câu hỏi', icon: 'puzzle', keywords: 'cau hoi de item' },
      { to: '/ki-nang', label: 'Danh mục kĩ năng', icon: 'map', keywords: 'ky nang chuong trinh' },
      { to: '/trang-hoc', label: 'Trang học', icon: 'book', keywords: 'trang noi dung nhung web' },
      { to: '/truc-tiep', label: 'Trực tiếp', icon: 'tv', match: /^\/truc-tiep/, keywords: 'lop truc tiep tv trinh chieu' },
      { to: '/dau-truong', label: 'Đấu trường', icon: 'trophy', match: /^\/dau-truong/, keywords: 'giai dau leo thap doi khang' },
    ],
  },
  {
    id: 'giao-cham', label: 'Giao & chấm', items: [
      { to: '/giao-bai', label: 'Giao bài', icon: 'check', keywords: 'bai tap ve nha han nop' },
      { to: '/bao-cao-bai-giao', label: 'Báo cáo bài giao', icon: 'map', keywords: 'tien do bai giao' },
      { to: '/cham-bai', label: 'Chấm bài', icon: 'eye', match: /^\/cham-bai/, badge: 'review', keywords: 'duyet bai cham ai' },
      { to: '/bai-viet', label: 'Bài viết', icon: 'pencil', match: /^\/bai-viet/, keywords: 'tap lam van viet doan' },
      { to: '/de-kiem-tra', label: 'Đề kiểm tra', icon: 'check', match: /^\/de-kiem-tra/, keywords: 'kiem tra ma tran ra de' },
      { to: '/rubric', label: 'Tiêu chí chấm', icon: 'settings', keywords: 'rubric thang diem' },
      { to: '/tt27', label: 'Nhận xét TT27', icon: 'passport', keywords: 'thong tu 27 danh gia nhan xet hoc ba' },
    ],
  },
  {
    id: 'lop-hs', label: 'Lớp & học sinh', items: [
      { to: '/lop', label: 'Lớp học', icon: 'team', match: /^\/lop(?!\/[^/]+\/ban-do)/, keywords: 'to nhom si so' },
      { to: '/hoc-sinh', label: 'Hồ sơ học sinh', icon: 'user', match: /^\/hoc-sinh/, keywords: 'ho so hoc sinh' },
      { to: '/kien-thuc', label: 'Kiến thức', icon: 'map', match: /^\/(kien-thuc|lop\/[^/]+\/ban-do-kien-thuc)/, keywords: 'ban do kien thuc thanh thao lo hong' },
      { to: '/diem-danh', label: 'Điểm danh', icon: 'clock', badge: 'attendance', keywords: 'chuyen can vang' },
      { to: '/thi-dua', label: 'Thi đua', icon: 'trophy', match: /^\/thi-dua/, keywords: 'khen nhac nho diem thi dua' },
      { to: '/vuon-lop', label: 'Vườn lớp & huy hiệu', icon: 'star', keywords: 'huy hieu sao vuon' },
    ],
  },
  {
    id: 'ket-noi', label: 'Kết nối', items: [
      { to: '/phu-huynh', label: 'Phụ huynh', icon: 'parent', match: /^\/phu-huynh/, badge: 'parents', keywords: 'phu huynh tin nhan thong bao lien ket' },
      { to: '/thao-luan', label: 'Thảo luận', icon: 'chat', match: /^\/thao-luan/, keywords: 'thao luan tro chuyen y kien' },
    ],
  },
  {
    id: 'truong', label: 'Trường & thiết lập', items: [
      { to: '/bao-cao', label: 'Báo cáo', icon: 'map', match: /^\/bao-cao(?!-bai-giao)/, keywords: 'bao cao truong khoi' },
      { to: '/xuat-nhap', label: 'Xuất / nhập dữ liệu', icon: 'upload', keywords: 'excel vnedu classroom xuat nhap' },
      { to: '/quan-tri/lop', label: 'Quản lí lớp', icon: 'team', admin: true, keywords: 'quan tri tao lop' },
      { to: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: 'user', admin: true, keywords: 'quan tri tai khoan mat khau' },
      { to: '/quan-tri/cai-dat', label: 'Năm học & kì', icon: 'settings', admin: true, keywords: 'nam hoc hoc ki' },
      { to: '/quan-tri/ung-dung', label: 'Ứng dụng kết nối', icon: 'puzzle', admin: true, keywords: 'lti ung dung ngoai' },
    ],
  },
];

/** Chuẩn hoá để tìm không dấu: "Điểm danh" → "diem danh". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
