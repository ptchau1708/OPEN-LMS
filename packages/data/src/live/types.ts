import type { AnyResponse, Item, LiveChannel, LiveParticipant, ScoreResult } from '@openedu/contracts';

export type ChannelStatus = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Phần mở rộng (ngoài hợp đồng) mà RelayLiveChannel và SupabaseLiveChannel đều có:
 * trạng thái kết nối + danh sách người đang trực tuyến. useLiveChannel dùng nếu có.
 */
export interface StatusfulLiveChannel extends LiveChannel {
  readonly status: ChannelStatus;
  readonly error: string | null;
  onStatus(handler: (status: ChannelStatus, error: string | null) => void): () => void;
  /** Người đang kết nối (presence). */
  online(): LiveParticipant[];
  /** Chờ đồng bộ trạng thái lần đầu; luôn resolve (true = đã đồng bộ, false = hết thời gian). */
  whenReady(timeoutMs?: number): Promise<boolean>;
}

export function isStatusful(ch: LiveChannel | null | undefined): ch is StatusfulLiveChannel {
  return !!ch && typeof (ch as Partial<StatusfulLiveChannel>).onStatus === 'function';
}

export type ScoreFn = (item: Item, response: AnyResponse | undefined) => ScoreResult;

/** Tải scoreItem lười để không kéo cả activity-engine vào gói JS đầu tiên. */
let scorePromise: Promise<ScoreFn> | null = null;
export function loadScorer(): Promise<ScoreFn> {
  if (!scorePromise) {
    scorePromise = import('@openedu/activity-engine').then((m) => m.scoreItem as ScoreFn);
    scorePromise.catch(() => {
      scorePromise = null;
    });
  }
  return scorePromise;
}
