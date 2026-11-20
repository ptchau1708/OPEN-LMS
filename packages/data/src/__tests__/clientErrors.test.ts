import { describe, expect, it } from 'vitest';
import { isChunkLoadError, toClientError } from '../clientErrors';

describe('clientErrors', () => {
  it('nhận ra lỗi tải mảnh mã sau khi app cập nhật', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Shop-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed'))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
  it('cắt ngắn và không ném lỗi với giá trị lạ', () => {
    const e = toClientError('learner', new Error('x'.repeat(2000)), 'at Component');
    expect(e.message.length).toBe(500);
    expect(e.stack).toContain('at Component');
    expect(toClientError('teacher', null).message).toBe('Lỗi không rõ');
    expect(toClientError('present', 'chuỗi lỗi').message).toBe('chuỗi lỗi');
  });
});
