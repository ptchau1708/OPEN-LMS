/**
 * Kiểu dùng chung cho học offline (docs/PHASE6_OFFLINE.md).
 * Kho lưu trữ đứng sau giao diện OfflineStore: IndexedDB thật (idbStore.ts) hoặc bộ nhớ (memoryStore.ts, cho kiểm thử).
 */
import type { AnyResponse, Item, LearningEvent, LessonProgress, SubmitAnswerInput, SubmitWorkInput } from '@openedu/contracts';

/** cache: bản sao dữ liệu đọc; outbox: hàng đợi ghi; downloads: bài đã tải; blobs: ảnh bài làm chờ tải lên. */
export type StoreName = 'cache' | 'outbox' | 'downloads' | 'blobs';
export const STORE_NAMES: StoreName[] = ['cache', 'outbox', 'downloads', 'blobs'];

export interface OfflineStore {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  getAll<T>(store: StoreName): Promise<T[]>;
}

export interface CacheEntry<T> {
  v: T;
  /** ISO lúc lưu. */
  at: string;
}

export type OutboxKind = 'answer' | 'progress' | 'complete' | 'event' | 'work' | 'remediation';

export interface AnswerPayload {
  item: Item;
  response: AnyResponse;
  context: SubmitAnswerInput['context'];
  attempt?: number;
  answeredAt: string;
}
export interface CompletePayload { lessonId: string; completedAt: string }
export interface EventPayload { event: Omit<LearningEvent, 'id' | 'at'>; at: string }
export interface WorkPayload { input: Omit<SubmitWorkInput, 'images'>; blobIds: string[] }

/** Kết quả một bộ ôn tập làm khi mất mạng. pendingItemIds: câu chưa được chấm lúc làm — lấy kết quả thật sau khi các câu đó đồng bộ. */
export interface RemediationPayload { setId: string; results: { itemId: string; correct: boolean }[]; pendingItemIds: string[] }

export interface PayloadByKind {
  answer: AnswerPayload;
  progress: LessonProgress;
  complete: CompletePayload;
  event: EventPayload;
  work: WorkPayload;
  remediation: RemediationPayload;
}

export interface OutboxOp<K extends OutboxKind = OutboxKind> {
  /** = khóa idempotency gửi lên server (clientEventId). */
  id: string;
  /** Thứ tự ghi — đồng bộ đúng thứ tự này. */
  seq: number;
  kind: K;
  userId: string;
  payload: PayloadByKind[K];
  createdAt: string;
  attempts: number;
  /** Epoch ms: chưa thử lại trước lúc này (lùi dần). */
  nextAt: number;
  status: 'pending' | 'failed';
  lastError?: string;
}

export type AnyOutboxOp = { [K in OutboxKind]: OutboxOp<K> }[OutboxKind];

export type ErrorClass = 'network' | 'transient' | 'permanent';

export interface SyncReport {
  sent: number;
  failed: number;
  remaining: number;
  /** Sao server cộng cho các câu trả lời / bài vừa đồng bộ. */
  stars: number;
  /** Câu đã chấm: đúng / tổng (chỉ câu có chấm). */
  correct: number;
  graded: number;
  newlyUnlocked: string[];
  /** true: dừng vì mất mạng giữa chừng. */
  stoppedOffline: boolean;
}

export interface DownloadEntry {
  lessonId: string;
  title: string;
  subject: string;
  /** Ước tính dung lượng (byte): JSON + ảnh/âm thanh đã lưu. */
  bytes: number;
  itemIds: string[];
  mediaUrls: string[];
  /** Phần cần mạng (gói HTML5 khác origin, video YouTube…). */
  needsNetwork: string[];
  /** Ảnh/âm thanh không tải được. */
  failedMedia: number;
  at: string;
}
