/**
 * Ô tìm nhanh (Ctrl+K / ⌘K): gõ để mở trang, làm thao tác nhanh, tới lớp, học sinh, bài giảng.
 * Tìm không cần dấu ("diem danh" ra "Điểm danh"). Bàn phím: ↑ ↓ chọn, Enter mở, Esc đóng.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import type { Profile } from '@openedu/contracts';
import { SUBJECTS } from '@openedu/contracts';
import { useDataSource, useLessons } from '@openedu/data';
import { Icon, type IconName } from '@openedu/ui';
import { NAV_GROUPS, NAV_HOME, fold } from '../lib/nav';
import { useClasses } from '../lib/focusGrade';
import { useTodayWork } from '../lib/todayWork';
import { cx } from '../lib/format';

interface Entry { id: string; group: string; label: string; sub?: string; icon: IconName; to: string; hay: string; count?: number }

const ACTIONS: { label: string; to: string; icon: IconName; keywords: string }[] = [
  { label: 'Soạn bài giảng mới', to: '/bai-giang?tao=1', icon: 'plus', keywords: 'tao bai giang moi slide' },
  { label: 'Mở lớp trực tiếp', to: '/truc-tiep', icon: 'tv', keywords: 'trinh chieu tv' },
  { label: 'Giao bài', to: '/giao-bai', icon: 'check', keywords: 'giao bai tap ve nha' },
  { label: 'Gửi thông báo cho phụ huynh', to: '/phu-huynh?the=gui', icon: 'send', keywords: 'thong bao phu huynh gui tin' },
  { label: 'Điểm danh hôm nay', to: '/diem-danh', icon: 'clock', keywords: 'diem danh vang co mat' },
  { label: 'Ghi điểm thi đua', to: '/thi-dua', icon: 'trophy', keywords: 'khen nhac nho thi dua' },
  { label: 'Ra đề kiểm tra', to: '/de-kiem-tra/ra-de', icon: 'pencil', keywords: 'de kiem tra ra de' },
  { label: 'Cài đặt cá nhân (khối ưu tiên)', to: '/cai-dat', icon: 'settings', keywords: 'cai dat khoi uu tien' },
  { label: 'Cài đặt thông báo', to: '/thong-bao', icon: 'bell', keywords: 'thong bao day push gio yen lang' },
  { label: 'Đổi mật khẩu', to: '/doi-mat-khau', icon: 'lock', keywords: 'mat khau' },
];

function score(hay: string, q: string): number {
  if (!q) return 1;
  const i = hay.indexOf(q);
  if (i < 0) {
    // mọi từ trong câu gõ đều có mặt (thứ tự bất kì)
    const words = q.split(/\s+/).filter(Boolean);
    return words.length > 1 && words.every((w) => hay.indexOf(w) >= 0) ? 2 : 0;
  }
  if (i === 0) return 10;
  return hay.charAt(i - 1) === ' ' ? 6 : 3;
}

export function CommandPalette({ user, open, onClose }: { user: Profile; open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const ds = useDataSource();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const work = useTodayWork();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const clsList = useMemo(() => (open ? (classes.data ?? []).slice(0, 8) : []), [open, classes.data]);
  const studentQs = useQueries({ queries: clsList.map((c) => ({ queryKey: ['students', c.id] as const, queryFn: () => ds.listStudents(c.id), enabled: open })) });
  const lessons = useLessons(user.role === 'admin' ? {} : { ownerId: user.id });

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    const t = window.setTimeout(() => input.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    if (!open) return [];
    const out: Entry[] = [];
    const w = work.total;
    const todo: Entry[] = [];
    if (w.review) todo.push({ id: 'w-review', group: 'Việc cần làm', label: `Chấm ${w.review} bài viết`, icon: 'eye', to: '/cham-bai', hay: 'cham bai viet duyet', count: w.review });
    if (w.parentUnread) todo.push({ id: 'w-msg', group: 'Việc cần làm', label: `Đọc ${w.parentUnread} tin nhắn phụ huynh`, icon: 'chat', to: '/phu-huynh?the=tin-nhan', hay: 'tin nhan phu huynh', count: w.parentUnread });
    if (w.parentQueue) todo.push({ id: 'w-queue', group: 'Việc cần làm', label: `Duyệt ${w.parentQueue} mục gửi phụ huynh`, icon: 'parent', to: '/phu-huynh?the=cho-duyet', hay: 'cho duyet phu huynh', count: w.parentQueue });
    if (w.attendanceTodo) todo.push({ id: 'w-att', group: 'Việc cần làm', label: 'Điểm danh hôm nay', icon: 'clock', to: '/diem-danh', hay: 'diem danh hom nay' });
    out.push(...todo);
    ACTIONS.forEach((a) => out.push({ id: `a-${a.to}`, group: 'Thao tác nhanh', label: a.label, icon: a.icon, to: a.to, hay: fold(`${a.label} ${a.keywords}`) }));
    [{ ...NAV_HOME, group: 'Trang' }, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))]
      .filter((i) => !i.admin || user.role === 'admin')
      .forEach((i) => out.push({ id: `p-${i.to}`, group: 'Trang', label: i.label, sub: i.group === 'Trang' ? undefined : i.group, icon: i.icon, to: i.to, hay: fold(`${i.label} ${i.keywords ?? ''} ${i.group}`) }));
    clsList.forEach((c) => out.push({ id: `c-${c.id}`, group: 'Lớp', label: `Lớp ${c.name}`, sub: `Khối ${c.grade} · bản đồ kiến thức`, icon: 'team', to: `/lop/${c.id}/ban-do-kien-thuc`, hay: fold(`lop ${c.name} khoi ${c.grade}`) }));
    studentQs.forEach((sq, i) => (sq.data ?? []).forEach((s) => out.push({ id: `s-${s.id}`, group: 'Học sinh', label: s.name, sub: `Lớp ${clsList[i]?.name ?? ''}`, icon: 'user', to: `/hoc-sinh/${s.id}`, hay: fold(`${s.name} hoc sinh ${clsList[i]?.name ?? ''}`) })));
    (lessons.data ?? []).slice(0, 200).forEach((l) => out.push({ id: `l-${l.id}`, group: 'Bài giảng', label: l.title, sub: `${(SUBJECTS[l.subject] ?? SUBJECTS.khac).name} · lớp ${l.grade}`, icon: 'book', to: `/bai-giang/${l.id}`, hay: fold(`${l.title} ${(SUBJECTS[l.subject] ?? SUBJECTS.khac).name} lop ${l.grade}`) }));
    return out;
  }, [open, work.total, clsList, studentQs, lessons.data, user.role]);

  const results = useMemo(() => {
    const f = fold(q);
    if (!f) {
      // Chưa gõ: việc cần làm + thao tác nhanh + vài trang hay dùng.
      const pages = entries.filter((e) => e.group === 'Trang').slice(0, 8);
      return [...entries.filter((e) => e.group === 'Việc cần làm'), ...entries.filter((e) => e.group === 'Thao tác nhanh').slice(0, 6), ...pages];
    }
    const groupRank: Record<string, number> = { 'Việc cần làm': 0, 'Trang': 1, 'Thao tác nhanh': 2, 'Lớp': 3, 'Học sinh': 4, 'Bài giảng': 5 };
    const scored = entries.map((e) => ({ e, s: Math.max(score(fold(e.label), f) * 2, score(e.hay, f)) })).filter((x) => x.s > 0);
    // Giữ nhóm liền nhau: xếp theo nhóm, trong nhóm theo điểm.
    scored.sort((a, b) => (groupRank[a.e.group] ?? 9) - (groupRank[b.e.group] ?? 9) || b.s - a.s);
    const perGroup: Record<string, number> = {};
    return scored.filter((x) => (perGroup[x.e.group] = (perGroup[x.e.group] ?? 0) + 1) <= 8).map((x) => x.e).slice(0, 40);
  }, [entries, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;
  const go = (e?: Entry) => { if (!e) return; onClose(); nav(e.to); };
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); go(results[sel]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); onClose(); }
  };
  let lastGroup = '';
  return (
    <div className="tc-cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tc-cmdk" role="dialog" aria-modal="true" aria-label="Tìm nhanh" data-testid="cmdk">
        <div className="tc-cmdk__bar">
          <Icon name="search" size={18} />
          <input
            ref={input}
            className="tc-cmdk__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Tìm trang, học sinh, bài giảng… (gõ không dấu cũng được)"
            role="combobox"
            aria-expanded="true"
            aria-controls="tc-cmdk-list"
            aria-activedescendant={results[sel] ? `cmdk-${results[sel].id}` : undefined}
            aria-autocomplete="list"
            data-testid="cmdk-input"
          />
          <kbd className="tc-cmdk__kbd">Esc</kbd>
        </div>
        <ul id="tc-cmdk-list" ref={listRef} className="tc-cmdk__list" role="listbox" aria-label="Kết quả">
          {results.length ? results.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return [
              head ? <li key={`h-${head}`} className="tc-cmdk__group" role="presentation">{head}</li> : null,
              <li
                key={e.id}
                id={`cmdk-${e.id}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={cx('tc-cmdk__item', i === sel && 'is-sel', e.group === 'Việc cần làm' && 'is-todo')}
                onMouseMove={() => setSel(i)}
                onClick={() => go(e)}
              >
                <span className="tc-cmdk__icon"><Icon name={e.icon} size={16} /></span>
                <span className="tc-cmdk__text"><strong>{e.label}</strong>{e.sub ? <small>{e.sub}</small> : null}</span>
                {i === sel ? <kbd className="tc-cmdk__kbd">Enter</kbd> : null}
              </li>,
            ];
          }) : <li className="tc-cmdk__empty" role="presentation">Không thấy “{q}”. Thử gõ ngắn hơn, ví dụ “diem danh”, “lan”, “phan so”.</li>}
        </ul>
        <div className="tc-cmdk__foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> mở / đóng</span></div>
      </div>
    </div>
  );
}
