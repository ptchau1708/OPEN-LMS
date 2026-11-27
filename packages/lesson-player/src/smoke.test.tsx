import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ContentPackage, Item, Lesson, LiveChannel, LiveState } from '@openedu/contracts';

(globalThis as unknown as { window: unknown }).window = { location: { origin: 'http://localhost:5173' } };

const mcq: Item = { id: 'q1', type: 'MCQ', grade: 1, subject: 'toan', prompt: { text: '2 + 1 = ?' }, payload: { options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }] }, key: { correct: 'a' } };
const lesson: Lesson = {
  id: 'l1', title: 'Đếm đến 10', subject: 'toan', grade: 1, ownerId: 't', status: 'published', updatedAt: '',
  slides: [
    { id: 's1', layout: 'title', title: 'Đếm đến **10**', text: 'Cùng học nào' },
    { id: 's2', layout: 'image-text', title: 'Quả táo', text: 'Một\nHai', image: 'emoji:🍎' },
    { id: 's3', layout: 'fullscreen', title: 'Video', video: { url: 'https://youtu.be/dQw4w9WgXcQ', questions: [{ atSec: 5, itemId: 'q1' }] } },
    { id: 's3b', layout: 'fullscreen', video: { url: 'https://x.test/a.mp4' } },
    { id: 's4', layout: 'activity', itemId: 'q1' },
    { id: 's5', layout: 'compare', columns: [{ title: 'Nhiều', text: '5' }, { title: 'Ít', text: '2' }] },
    { id: 's6', layout: 'game', game: { kind: 'wheel', entries: ['An', 'Bình', 'Chi'] } },
    { id: 's7', layout: 'game', game: { kind: 'duck-race' } },
    { id: 's8', layout: 'game', game: { kind: 'time-bomb', seconds: 10 } },
    { id: 's9', layout: 'package', packageId: 'p1' },
    { id: 's10', layout: 'summary' },
  ],
};
const pkg: ContentPackage = { id: 'p1', kind: 'html', title: 'Đếm táo', baseUrl: 'http://localhost:5180/samples/dem-tao/', entry: 'index.html', ownerId: 't', createdAt: '' };

function state(phase: LiveState['phase'], extra: Partial<LiveState> = {}): LiveState {
  return { sessionId: 'x', pin: '123456', lessonId: 'l1', lesson, items: { q1: mcq }, slideIndex: 4, phase, activeItemId: 'q1', locked: false, teams: [{ id: 't1', name: 'Tổ 1', color: '#2f7bf6', stars: 0 }], participants: [{ userId: 'u1', name: 'An', mascot: 'shiba', color: '#fff', teamId: 't1' }], studentStars: { u1: 3 }, updatedAt: '', ...extra };
}
function channel(s: LiveState | null): LiveChannel {
  return { sessionId: 'x', role: 'student', getState: () => s, subscribe: () => () => undefined, send: async () => undefined, join: async () => undefined, respond: async () => ({ correct: true }), responses: () => [], close: () => undefined };
}

describe('smoke', async () => {
  const m = await import('./index');
  it('SlideView: mọi bố cục, cả student và screen', () => {
    for (const s of lesson.slides) {
      for (const context of ['student', 'screen'] as const) {
        const html = renderToString(<m.SlideView slide={s} items={{ q1: mcq }} packages={{ p1: pkg }} context={context} summary={{ correct: 1, total: 2, stars: 3 }} />);
        expect(html.length).toBeGreaterThan(20);
      }
    }
    expect(renderToString(<m.SlideView slide={lesson.slides[2]} items={{}} context="student" />)).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(renderToString(<m.SlideView slide={lesson.slides[9]} items={{}} packages={{ p1: pkg }} context="student" />)).toContain('localhost:5180/launcher.html?base=');
  });
  it('SelfPacedPlayer: mở từ đầu và tiếp tục ở slide hoạt động', () => {
    expect(renderToString(<m.SelfPacedPlayer lesson={lesson} items={{ q1: mcq }} packages={{ p1: pkg }} />)).toContain('Tiếp');
    expect(renderToString(<m.SelfPacedPlayer lesson={lesson} items={{ q1: mcq }} progress={{ userId: 'u', lessonId: 'l1', slideIndex: 4, completedSlides: [], answers: {}, starsEarned: 2, updatedAt: '' }} />)).toContain('Kiểm tra');
    expect(renderToString(<m.SelfPacedPlayer lesson={{ ...lesson, slides: [] }} items={{}} />)).toContain('chưa có trang');
  });
  it('LiveStudentView: các pha', () => {
    const me = { userId: 'u1', name: 'An' };
    expect(renderToString(<m.LiveStudentView channel={channel(null)} items={{}} me={me} />)).toContain('Đang vào lớp');
    expect(renderToString(<m.LiveStudentView channel={channel(state('lobby'))} items={{}} me={me} />)).toContain('Chờ thầy/cô bắt đầu nhé!');
    expect(renderToString(<m.LiveStudentView channel={channel(state('slide', { locked: true }))} items={{}} me={me} />)).toContain('Nhìn lên bảng nhé!');
    expect(renderToString(<m.LiveStudentView channel={channel(state('slide', { slideIndex: 0 }))} items={{}} me={me} />)).toContain('Trang <!-- -->1');
    expect(renderToString(<m.LiveStudentView channel={channel(state('activity-open'))} items={{}} me={me} />)).toContain('Gửi');
    expect(renderToString(<m.LiveStudentView channel={channel(state('reveal'))} items={{}} me={me} />)).toContain('chưa trả lời');
    expect(renderToString(<m.LiveStudentView channel={channel(state('ended'))} items={{}} me={me} />)).toContain('kết thúc');
  });
  it('BigScreenSlide + LiveResultsBar', () => {
    const responses = [{ sessionId: 'x', userId: 'u1', itemId: 'q1', slideIndex: 4, response: { choice: 'a' }, at: '' }];
    const html = renderToString(<m.BigScreenSlide slide={lesson.slides[4]} items={{}} state={state('reveal')} responses={responses} />);
    expect(html).toContain('bạn đã trả lời');
    expect(renderToString(<m.BigScreenSlide slide={lesson.slides[0]} items={{}} state={state('slide', { slideIndex: 0 })} responses={[]} />)).toContain('lp-slide--screen');
  });
  it('PackageHost từ chối gói cùng origin với app', () => {
    const html = renderToString(<m.PackageHost pkg={{ ...pkg, baseUrl: 'http://localhost:5173/x/' }} />);
    expect(html).toContain('máy chủ nội dung riêng');
    expect(html).not.toContain('<iframe');
  });
});
