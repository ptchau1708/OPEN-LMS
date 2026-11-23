import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { lessonItemIds, useItemsByIds, useLesson, useLiveChannel, usePassport } from '@openedu/data';
import { LiveStudentView } from '@openedu/lesson-player';
import { Button, Icon } from '@openedu/ui';
import { ErrorState } from '../components/Common';
import { resolveSettings, useMe } from '../lib/util';
import '../styles/live.css';
import { GameBar, GameOver, PaperNotice, SelfPlay } from './live/GamePlay';

export default function LiveRoom() {
  const [attempt, setAttempt] = useState(0);
  return <Room key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Room({ onRetry }: { onRetry: () => void }) {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const me = useMe();
  const nav = useNavigate();
  const settings = resolveSettings(me);
  const companion = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const live = useLiveChannel(sessionId, 'student');
  const lessonId = live.state?.lessonId ?? params.get('bai') ?? undefined;
  const needLesson = !live.state?.lesson;
  const lessonQ = useLesson(needLesson ? lessonId : undefined);
  const lesson = live.state?.lesson ?? lessonQ.data ?? undefined;
  const itemsQ = useItemsByIds(needLesson ? lessonItemIds(lesson) : []);
  const items = useMemo(() => itemsQ.data ?? {}, [itemsQ.data]);
  const joinedFor = useRef<string>('');

  // LiveStudentView không tự vào phòng: app gọi join mỗi khi kênh mở (kể cả sau khi nối lại).
  useEffect(() => {
    const ch = live.channel;
    if (!ch || live.status !== 'open') { joinedFor.current = ''; return; }
    if (joinedFor.current === 'open') return;
    joinedFor.current = 'open';
    ch.join({ userId: me.id, name: me.name, mascot: companion, color: me.avatarColor }).catch(() => { joinedFor.current = ''; });
  }, [live.channel, live.status, me.id, me.name, me.avatarColor, companion]);

  if (live.status === 'error' && !live.channel) {
    return <ErrorState title="Chưa vào được lớp" message={live.error ?? 'Em kiểm tra Wi-Fi rồi thử lại nhé!'} onRetry={onRetry}
      extra={<Button size="lg" variant="secondary" onClick={() => nav('/lop')}>Nhập mã khác</Button>} />;
  }

  const chip = live.status === 'open' ? { cls: 'is-ok', text: 'Đã kết nối' } : live.status === 'connecting' ? { cls: 'is-wait', text: 'Đang kết nối…' } : { cls: 'is-off', text: 'Mất kết nối, đang thử lại' };

  return (
    <div className="ln-live">
      <div className="ln-live__bar">
        <span className={`ln-conn ${chip.cls}`} role="status"><i />{chip.text}</span>
        <span className="ln-live__title">{lesson?.title ?? 'Lớp học trực tiếp'}</span>
        <Button variant="secondary" onClick={() => nav('/')} icon={<Icon name="close" size={22} />}>Thoát</Button>
      </div>
      <div className="ln-live__stage">
        {live.channel && live.state?.game ? (
          live.state.phase === 'ended' ? <GameOver state={live.state} userId={me.id} mascot={companion} />
            : live.state.game.mode === 'self' ? <SelfPlay channel={live.channel} state={live.state} lesson={lesson} items={{ ...items, ...(live.state.items ?? {}) }} me={{ id: me.id, name: me.name }} mascot={companion} bigText={settings.bigText ?? false} />
            : live.state.game.mode === 'paper' ? <PaperNotice mascot={companion} />
            : <div className="ln-gamewrap"><GameBar state={live.state} userId={me.id} /><div className="ln-gamewrap__view"><LiveStudentView channel={live.channel} items={items} me={{ userId: me.id, name: me.name }} settings={settings} lesson={lesson} /></div></div>
        ) : live.channel ? (
          <LiveStudentView channel={live.channel} items={items} me={{ userId: me.id, name: me.name }} settings={settings} lesson={lesson} />
        ) : (
          <div className="ln-live__wait"><span className="ln-dots"><i /><i /><i /></span><p>Đang vào lớp…</p></div>
        )}
      </div>
    </div>
  );
}
