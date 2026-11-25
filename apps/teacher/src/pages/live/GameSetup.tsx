import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@openedu/ui';
import { SUBJECTS, uid, type Item, type Lesson, type LiveGameMode, type Profile } from '@openedu/contracts';
import { GAME_MODE_LABEL, paperFriendly, useClasses, useCreateLiveSession, useSaveLesson } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field, Seg } from '../../components/common';
import { cx, shorten } from '../../lib/format';

const MODES: LiveGameMode[] = ['class', 'self', 'paper'];
const MODE_ICON: Record<LiveGameMode, string> = { class: '🏁', self: '🚀', paper: '🃏' };

/** Đường dẫn mở bảng điều khiển thi đua sau khi tạo phiên. */
export function gameUrl(sessionId: string, mode: LiveGameMode, seconds: number, classId?: string): string {
  const q = new URLSearchParams({ choi: mode, giay: String(seconds) });
  if (classId) q.set('lop', classId);
  return `/truc-tiep/${sessionId}?${q.toString()}`;
}

/**
 * Chơi trực tiếp các câu đã chọn trong ngân hàng (hoặc các câu hỏi của một bài giảng): chọn lớp, kiểu chơi, giây mỗi câu.
 * Từ ngân hàng: gộp thành bài "Đố vui" (nháp, mỗi câu một trang hoạt động) rồi mở lớp trực tiếp.
 */
export function GameSetupDialog({ user, items, lesson, onClose }: { user: Profile; items?: Item[]; lesson?: Lesson; onClose: () => void }) {
  const nav = useNavigate();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const saveLesson = useSaveLesson();
  const create = useCreateLiveSession();
  const [classId, setClassId] = useState('');
  const [mode, setMode] = useState<LiveGameMode>('class');
  const [seconds, setSeconds] = useState(20);
  const list = items ?? [];
  const first = list[0];
  const [title, setTitle] = useState(() => (lesson ? lesson.title : `Đố vui ${first ? SUBJECTS[first.subject]?.name ?? '' : ''} (${list.length} câu)`.replace(/\s+/g, ' ')));
  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(user.classId && classes.data.some((c) => c.id === user.classId) ? user.classId : classes.data[0].id);
  }, [classes.data, classId, user.classId]);

  const questionCount = lesson ? lesson.slides.filter((s) => s.layout === 'activity').length : list.length;
  const paperOk = items ? list.filter(paperFriendly).length : null;
  const busy = saveLesson.isPending || create.isPending;
  const noPaper = mode === 'paper' && paperOk === 0;

  const start = async () => {
    let lessonId = lesson?.id;
    if (!lessonId) {
      const use = mode === 'paper' ? list.filter(paperFriendly) : list;
      const id = uid('ls');
      const l: Lesson = {
        id, title: title.trim() || 'Đố vui', subject: first?.subject ?? 'khac', grade: first?.grade ?? 1, ownerId: user.id, status: 'draft',
        updatedAt: new Date().toISOString(), minutes: Math.max(5, Math.round(use.length * 1)),
        description: 'Đố vui trực tiếp — tạo từ Ngân hàng câu hỏi.',
        slides: [
          { id: `${id}-s0`, layout: 'title', title: title.trim() || 'Đố vui', text: `${use.length} câu · ${GAME_MODE_LABEL[mode].name}` },
          ...use.map((it, i) => ({ id: `${id}-s${i + 1}`, layout: 'activity' as const, title: `Câu ${i + 1}`, itemId: it.id })),
        ],
      };
      lessonId = (await saveLesson.mutateAsync(l)).id;
    }
    const s = await create.mutateAsync({ lessonId, classId: classId || undefined });
    nav(gameUrl(s.sessionId, mode, seconds, classId || undefined));
  };

  return (
    <Dialog open wide title="Chơi trực tiếp trên lớp" onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" icon="play" disabled={busy || !questionCount || noPaper || (mode === 'paper' && !classId)} onClick={() => void start().catch(() => undefined)} data-testid="game-go">{busy ? 'Đang mở lớp…' : 'Mở phòng chơi'}</Btn>
    </>}>
      <div className="tc-stack">
        {!lesson ? <Field label="Tên trò chơi (hiện trên TV)"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field> : <p><strong>{lesson.title}</strong> · {questionCount} câu hỏi</p>}
        <div className="tc-gamemodes" role="radiogroup" aria-label="Kiểu chơi">
          {MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={cx('tc-gamemode', mode === m && 'is-active')} onClick={() => setMode(m)} data-testid={`game-mode-${m}`}>
              <span className="tc-gamemode__icon" aria-hidden="true">{MODE_ICON[m]}</span>
              <strong>{GAME_MODE_LABEL[m].name}</strong>
              <small>{GAME_MODE_LABEL[m].hint}</small>
            </button>
          ))}
        </div>
        <div className="tc-row tc-wrap">
          <Field label="Lớp">
            <select className="tc-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Lớp {c.name} ({c.studentIds.length} HS)</option>)}
            </select>
          </Field>
          <Seg label={mode === 'self' ? 'Mốc tính điểm nhanh mỗi câu' : 'Thời gian mỗi câu'} value={seconds} onChange={setSeconds} options={[
            ...(mode === 'self' ? [] : [{ value: 0, label: 'Không giờ' }]), { value: 10, label: '10 giây' }, { value: 20, label: '20 giây' }, { value: 30, label: '30 giây' }, { value: 60, label: '60 giây' }]} />
        </div>
        {mode === 'paper' ? (
          <div className="tc-alert tc-alert--info"><span>
            Chế độ giấy chỉ dùng câu <b>chọn 1 đáp án, 2–4 lựa chọn</b>{paperOk !== null ? <> — dùng được <b>{paperOk}/{list.length}</b> câu đã chọn</> : null}.
            Mỗi em một thẻ in sẵn theo danh sách lớp — in một lần, dùng cho mọi trò chơi. GV quét bằng camera điện thoại hoặc chạm chọn đáp án cho từng em.
          </span>{classId ? <Link className="tc-btn tc-btn--sm" to={`/truc-tiep/the-giay?lop=${encodeURIComponent(classId)}`} target="_blank" data-testid="game-print-cards"><Icon name="print" size={16} /><span>In thẻ giấy cho lớp này</span></Link> : null}</div>
        ) : mode === 'self' ? (
          <p className="tc-small tc-muted">Mỗi em làm lần lượt các câu trên máy, biết đúng/sai ngay. Trả lời đúng càng nhanh càng nhiều điểm, đúng liên tiếp được thưởng thêm.</p>
        ) : (
          <p className="tc-small tc-muted">TV hiện câu hỏi, HS chọn trên máy. Đúng: 500–1000 điểm tùy tốc độ, đúng liên tiếp +100 mỗi câu (tối đa +500). Sau mỗi câu có bảng xếp hạng.</p>
        )}
        {items ? <ol className="tc-small tc-qbpicked">{list.map((it) => <li key={it.id} className={cx(mode === 'paper' && !paperFriendly(it) && 'tc-muted tc-strike')}>{shorten(it.prompt.text, 90)}</li>)}</ol> : null}
        <ErrorNote error={saveLesson.error ?? create.error} />
      </div>
    </Dialog>
  );
}
