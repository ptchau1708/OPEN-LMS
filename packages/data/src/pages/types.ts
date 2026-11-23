/** Trang được phép nhúng + "Trang học" của lớp (docs/TRANG_HOC.md). */

export interface EmbedSite {
  /** https://doc.truong.edu.vn (không có đường dẫn). */
  origin: string;
  name: string;
  /** Trang học tập quen thuộc có sẵn. */
  builtin: boolean;
  addedBy?: string | null;
  createdAt: string;
}

/** link: trang web nhúng · lti: bài trong app · section: trang nội dung (chữ + các trang con), như Google Sites. */
export type ClassPageKind = 'link' | 'lti' | 'section';

export interface ClassPage {
  id: string;
  classId: string;
  title: string;
  description: string;
  kind: ClassPageKind;
  /** link: địa chỉ trang nhúng · lti: địa chỉ riêng của bài trong app (có thể trống). */
  url: string | null;
  appId: string | null;
  /** Bài chọn trong app (Deep Linking). */
  lti: { custom?: Record<string, string>; lineItem?: { scoreMaximum?: number; resourceId?: string; tag?: string } };
  openIn: 'iframe' | 'window';
  position: number;
  hidden: boolean;
  createdAt: string;
  /** Trang cha (null = trang gốc). SQL 14. */
  parentId: string | null;
  /** Phần chữ của trang (trang nội dung; trang web có thể có lời dẫn). */
  body: string;
}

export type ClassPageInput = Pick<ClassPage, 'classId' | 'title' | 'description' | 'kind' | 'url' | 'appId' | 'openIn' | 'hidden'> & { id?: string; parentId?: string | null; body?: string; position?: number };

export interface PagesSource {
  listEmbedSites(): Promise<EmbedSite[]>;
  /** GV / quản trị. */
  addEmbedSite(origin: string, name: string): Promise<void>;
  removeEmbedSite(origin: string): Promise<void>;
  listClassPages(classId: string): Promise<ClassPage[]>;
  getClassPage(id: string): Promise<ClassPage | null>;
  /** GV của lớp / quản trị: thêm (không có id) hoặc sửa. */
  saveClassPage(input: ClassPageInput): Promise<ClassPage>;
  deleteClassPage(id: string): Promise<void>;
  /** Đổi thứ tự (vị trí) nhiều trang một lần. */
  movePages(moves: { id: string; position: number }[]): Promise<void>;
}
