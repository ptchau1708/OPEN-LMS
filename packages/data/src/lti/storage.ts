/**
 * "Lưu trạng thái qua nền tảng" (1EdTech LTI Client Side postMessages + Platform Storage) — phía OPEN-EDU.
 * Khi app LTI chạy trong khung (iframe) của OPEN-EDU, trình duyệt (nhất là Safari / iPad) chặn cookie của app.
 * App gửi postMessage tới khung cha (`lti_storage_target=_parent`): lti.capabilities, lti.put_data, lti.get_data;
 * OPEN-EDU giữ giá trị trong bộ nhớ, TÁCH RIÊNG theo origin của app, và chỉ trả lời đúng origin đó.
 */
export interface LtiStorageMessage { subject?: unknown; message_id?: unknown; key?: unknown; value?: unknown }

export type LtiStorageReply = Record<string, unknown>;

const MAX_KEYS = 200;
const MAX_LEN = 4096;

export class LtiPlatformStorage {
  private data = new Map<string, Map<string, string>>();
  /** origins: app được phép dùng (origin của app đang mở trong khung). */
  constructor(private allowed: () => string[]) {}

  /** Xử lí một tin nhắn; null = không phải tin LTI hoặc origin không được phép (bỏ qua, không trả lời). */
  handle(origin: string, msg: unknown): LtiStorageReply | null {
    if (typeof msg !== 'object' || msg === null) return null;
    const m = msg as LtiStorageMessage;
    const subject = typeof m.subject === 'string' ? m.subject : '';
    if (!subject.startsWith('lti.')) return null;
    if (!this.allowed().includes(origin)) return null;
    const id = m.message_id;
    const base = { subject: `${subject}.response`, message_id: id };
    if (subject === 'lti.capabilities') {
      return { ...base, supported_messages: [{ subject: 'lti.capabilities' }, { subject: 'lti.put_data' }, { subject: 'lti.get_data' }] };
    }
    const key = typeof m.key === 'string' ? m.key : '';
    if (subject === 'lti.put_data' || subject === 'lti.get_data') {
      if (!key || key.length > 200) return { ...base, error: { code: 'bad_request', message: 'key không hợp lệ' } };
      let bucket = this.data.get(origin);
      if (subject === 'lti.put_data') {
        const value = typeof m.value === 'string' ? m.value : JSON.stringify(m.value ?? null);
        if (value.length > MAX_LEN) return { ...base, error: { code: 'bad_request', message: 'value quá dài' } };
        if (!bucket) { bucket = new Map(); this.data.set(origin, bucket); }
        if (!bucket.has(key) && bucket.size >= MAX_KEYS) bucket.delete(bucket.keys().next().value as string);
        bucket.set(key, value);
        return { ...base, key, value };
      }
      return { ...base, key, value: bucket?.get(key) ?? null };
    }
    return { ...base, error: { code: 'unsupported_subject', message: `Không hỗ trợ ${subject}` } };
  }
}
