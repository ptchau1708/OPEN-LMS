import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon } from '@openedu/ui';
import { SUBJECTS, type Profile } from '@openedu/contracts';
import { useCreateLiveSession, useDataSource, useLessons } from '@openedu/data';
import { byFocus, useClasses, useFocusGrade } from '../lib/focusGrade';
import { Btn, Empty, ErrorNote, Field, Loading, PageHead, SubjectDot } from '../components/common';
import { cx } from '../lib/format';
import { matchesSearch } from '@openedu/data';
import { GameSetupDialog } from './live/GameSetup';

export default function LiveStart({ user }: { user: Profile }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ds = useDataSource();
  const lessons = useLessons(user.role === 'admin' ? {} : { ownerId: user.id });
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const create = useCreateLiveSession();
  const [lessonId, setLessonId] = useState(params.get('bai') ?? '');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [game, setGame] = useState(false);
  useEffect(() => { if (!classId && classes.data?.[0]) setClassId(user.classId && classes.data.some((c) => c.id === user.classId) ? user.classId : classes.data[0].id); }, [classes.data, classId, user.classId]);
  const focus = useFocusGrade().grade;
  const list = byFocus((lessons.data ?? []).filter((l) => !search.trim() || matchesSearch(l.title, search)), focus, (l) => l.grade);
  const start = () => create.mutate({ lessonId, classId: classId || undefined }, { onSuccess: (s) => nav(`/truc-tiep/${s.sessionId}${classId ? `?lop=${classId}` : ''}`) });

  return (
    <div className="tc-page">
      <PageHead title="Lớp học trực tiếp" sub="Bài giảng chiếu trên TV, học sinh trả lời trên máy, thầy/cô điều khiển bằng điện thoại." actions={
        <Link className="tc-btn" to="/truc-tiep/the-giay" data-testid="live-print-cards" title="Thẻ A/B/C/D có mã QR cho chế độ chơi bằng thẻ giấy (HS không cần máy)"><Icon name="print" size={16} /><span>In thẻ giấy cho HS</span></Link>
      } />
      {ds.mode === 'demo' ? (
        <div className="tc-alert tc-alert--info"><span><strong>Chế độ demo</strong> dùng máy chủ lớp học trong mạng LAN. Trên máy giáo viên, chạy <code>pnpm relay</code> trong thư mục open-edu trước khi bắt đầu.</span></div>
      ) : null}
      <div className="tc-livestart">
        <section className="tc-card tc-stack">
          <h2>1. Chọn bài giảng</h2>
          <input className="tc-input" placeholder="Tìm bài…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {lessons.isLoading ? <Loading /> : !list.length ? <Empty title="Không có bài giảng" /> : (
            <ul className="tc-list tc-list--plain">
              {list.map((l) => {
                const s = SUBJECTS[l.subject] ?? SUBJECTS.khac;
                return (
                  <li key={l.id}>
                    <button type="button" className={cx('tc-listrow', lessonId === l.id && 'is-active')} onClick={() => setLessonId(l.id)} aria-pressed={lessonId === l.id}>
                      <SubjectDot colorVar={s.colorVar} />
                      <span className="tc-listrow__main">{l.title}</span>
                      <span className="tc-muted tc-small">{s.name} · Lớp {l.grade} · {l.slides.length} slide</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="tc-card tc-stack">
          <h2>2. Chọn lớp</h2>
          <Field label="Lớp">
            <select className="tc-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Lớp {c.name} ({c.studentIds.length} HS)</option>)}
            </select>
          </Field>
          <ErrorNote error={create.error} />
          <Btn kind="primary" size="lg" icon="play" disabled={!lessonId || create.isPending} onClick={start}>{create.isPending ? 'Đang mở lớp…' : 'Bắt đầu'}</Btn>
          <Btn size="lg" icon="trophy" disabled={!lessonId || !list.some((l) => l.id === lessonId && l.slides.some((x) => x.layout === 'activity'))} onClick={() => setGame(true)} data-testid="live-game">Chơi thi đua với các câu hỏi của bài</Btn>
          <p className="tc-muted tc-small">Thi đua kiểu Kahoot, Quizizz hoặc thẻ giấy. Muốn chọn từng câu: vào <a href="/ngan-hang">Ngân hàng câu hỏi</a>, tích câu → “Chơi trực tiếp”.</p>
          <p className="tc-muted tc-small">Sau khi bắt đầu: mở link TV trên màn hình lớp, cho HS quét mã QR hoặc nhập mã 6 số.</p>
        </section>
      </div>
      {game ? <GameSetupDialog user={user} lesson={(lessons.data ?? []).find((l) => l.id === lessonId)} onClose={() => setGame(false)} /> : null}
    </div>
  );
}
