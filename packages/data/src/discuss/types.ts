/** Phòng thảo luận (docs/THAO_LUAN.md, SQL 15). */
export type DiscussionModeration = 'pre' | 'post';
export type DiscussionPostStatus = 'pending' | 'visible' | 'hidden' | 'removed';
export type DiscussionReaction = 'heart' | 'star' | 'like';
/** board: bảng thảo luận kiểu Padlet · chat: trò chuyện nhóm theo tổ (SQL 16). */
export type DiscussionKind = 'board' | 'chat';

/** Phòng nhỏ: members rỗng = cả lớp vào được. */
export interface DiscussionRoom { id: string; name: string; members: string[] }
/** Tab đăng bài (cột kiểu Padlet). */
export interface DiscussionTab { id: string; name: string; color: string }

export interface Discussion {
  id: string;
  classId: string;
  kind: DiscussionKind;
  title: string;
  /** Lời dẫn / câu hỏi của GV. */
  prompt: string;
  moderation: DiscussionModeration;
  /** HS chỉ thấy bài bạn khác sau khi đã đăng bài của mình. */
  hideOthers: boolean;
  opensAt: string | null;
  closesAt: string | null;
  locked: boolean;
  pinned: boolean;
  archived: boolean;
  rooms: DiscussionRoom[];
  tabs: DiscussionTab[];
  /** Phòng trò chuyện: câu trả lời nhanh GV đặt (≤ 12 câu). Trống = câu mặc định. Cần SQL 19 trên Supabase. */
  quickReplies?: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DiscussionInput = Omit<Discussion, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface DiscussionPost {
  id: string;
  discussionId: string;
  roomId: string;
  tabId: string;
  parentId: string | null;
  authorId: string;
  author: { name: string; mascot?: string; color?: string; role?: string };
  body: string;
  images: { path: string; url: string }[];
  color: string | null;
  status: DiscussionPostStatus;
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: Record<DiscussionReaction, number>;
  mine: Record<DiscussionReaction, boolean>;
  /** Số lần bị báo (GV thấy); với HS: em đã báo bài này chưa (0/1). */
  reports: number;
}

export interface DiscussionStats { total: number; pending: number; reports: number; lastAt: string | null }

export interface NewDiscussionPost {
  discussionId: string;
  roomId: string;
  tabId: string;
  parentId?: string | null;
  body: string;
  files?: Blob[];
  color?: string | null;
}

export interface DiscussionWord { id: string; classId: string | null; word: string }

export interface DiscussSource {
  listDiscussions(classId: string): Promise<Discussion[]>;
  getDiscussion(id: string): Promise<Discussion | null>;
  saveDiscussion(i: DiscussionInput): Promise<Discussion>;
  deleteDiscussion(id: string): Promise<void>;
  /** Thống kê theo phòng (GV): tổng bài, chờ duyệt, báo cáo chưa xử lí. */
  stats(classId: string): Promise<Record<string, DiscussionStats>>;
  listPosts(discussionId: string): Promise<DiscussionPost[]>;
  post(p: NewDiscussionPost): Promise<DiscussionPost>;
  editPost(id: string, body: string): Promise<void>;
  removeMyPost(id: string): Promise<void>;
  moderate(ids: string[], status: 'visible' | 'hidden' | 'pending'): Promise<number>;
  react(postId: string, kind: DiscussionReaction): Promise<boolean>;
  report(postId: string, reason: string): Promise<void>;
  listWords(classId: string): Promise<DiscussionWord[]>;
  addWord(classId: string, word: string): Promise<void>;
  removeWord(id: string): Promise<void>;
  /** Nghe thay đổi (bài mới, duyệt, thả tim). Trả về hàm hủy. */
  subscribe(discussionId: string, onChange: () => void): () => void;
}
