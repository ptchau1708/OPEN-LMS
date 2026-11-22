import { describe, expect, it } from 'vitest';
import { EMBED_FRAME_ORIGINS, toEmbed } from './embed';

const src = (u: string) => { const r = toEmbed(u); return r.ok ? r.src : `x:${r.reason.slice(0, 20)}`; };

describe('nhúng trang web', () => {
  it('đổi link chia sẻ thành link nhúng', () => {
    expect(src('https://youtu.be/dQw4w9WgXcQ')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    expect(src('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing')).toBe('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/embed?start=false&loop=false&delayms=3000');
    expect(src('https://docs.google.com/presentation/d/e/2PACX-1vQabc/pub?start=false')).toBe('https://docs.google.com/presentation/d/e/2PACX-1vQabc/embed?start=false&loop=false&delayms=3000');
    expect(src('https://docs.google.com/forms/d/e/1FAIpQLSf_x/viewform?usp=sf_link')).toBe('https://docs.google.com/forms/d/e/1FAIpQLSf_x/viewform?embedded=true');
    expect(src('<iframe src="https://docs.google.com/forms/d/e/1FAIpQLSf_y/viewform?embedded=true" width="640"></iframe>')).toBe('https://docs.google.com/forms/d/e/1FAIpQLSf_y/viewform?embedded=true');
    expect(src('https://www.geogebra.org/m/abcd1234')).toMatch(/^https:\/\/www\.geogebra\.org\/material\/iframe\/id\/abcd1234\//);
    expect(src('https://scratch.mit.edu/projects/123456/editor')).toBe('https://scratch.mit.edu/projects/123456/embed');
    expect(src('https://quizizz.com/admin/quiz/5f8a1b2c3d4e5f6a7b8c9d0e/phan-so')).toBe('https://quizizz.com/embed/quiz/5f8a1b2c3d4e5f6a7b8c9d0e');
    expect(src('https://wordwall.net/vi/embed/abc123def?themeId=1')).toBe('https://wordwall.net/embed/abc123def?themeId=1');
    expect(src('https://www.canva.com/design/DAFxyz/AbC12/view?utm_content=x')).toBe('https://www.canva.com/design/DAFxyz/AbC12/view?embed');
    expect(src('https://padlet.com/embed/k3j4h5')).toBe('https://padlet.com/embed/k3j4h5');
    expect(src('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing')).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/preview');
  });
  it('từ chối trang ngoài danh sách và link cần mã nhúng, vẫn cho mở tab mới', () => {
    for (const u of ['https://example.com/x', 'https://forms.gle/abc', 'https://wordwall.net/resource/123/toan', 'https://padlet.com/co/bang-lop-4a', 'javascript:alert(1)', 'https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit']) {
      const r = toEmbed(u);
      expect(r.ok, u).toBe(false);
    }
    expect(toEmbed('https://example.com/x').ok ? '' : toEmbed('https://example.com/x').openUrl).toBe('https://example.com/x');
  });
  it('mọi link nhúng nằm trong danh sách origin của CSP', () => {
    for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit', 'https://wayground.com/admin/quiz/5f8a1b2c3d4e5f6a7b8c9d0e', 'https://scratch.mit.edu/projects/1']) {
      const r = toEmbed(u);
      expect(r.ok && (EMBED_FRAME_ORIGINS as readonly string[]).includes(new URL(r.src).origin), u).toBe(true);
    }
  });
});

describe('danh sách trang được phép nhúng (GV / quản trị)', () => {
  it('nhận trang đã cho phép, bớt trang quen thuộc thì không nhúng nữa', async () => {
    const { setEmbedOrigins } = await import('./embed');
    expect(toEmbed('https://doc.truong.edu.vn/bai/3').ok).toBe(false);
    setEmbedOrigins(['https://doc.truong.edu.vn', 'https://www.youtube-nocookie.com']);
    expect(toEmbed('https://doc.truong.edu.vn/bai/3')).toMatchObject({ ok: true, provider: 'other', src: 'https://doc.truong.edu.vn/bai/3' });
    expect(toEmbed('http://doc.truong.edu.vn/bai/3').ok).toBe(false);
    expect(toEmbed('https://youtu.be/dQw4w9WgXcQ').ok).toBe(true);
    expect(toEmbed('https://scratch.mit.edu/projects/123').ok).toBe(false);
    setEmbedOrigins(null);
    expect(toEmbed('https://scratch.mit.edu/projects/123').ok).toBe(true);
  });
});
