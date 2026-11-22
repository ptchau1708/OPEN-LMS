/** /ung-dung — "Ứng dụng học": Trang học của lớp (trang web, bài trong app) và ứng dụng LTI của trường. */
import { useNavigate } from 'react-router';
import { useClassPages, useLtiTools } from '@openedu/data';
import { Button, Card, Icon, sfx } from '@openedu/ui';
import { AppTabs, EmptyState, ErrorState, LoadingScreen } from '../../components/Common';
import { useMe } from '../../lib/util';
import '../../styles/connect.css';

export default function LtiApps() {
  const me = useMe();
  const nav = useNavigate();
  const tools = useLtiTools();
  const pages = useClassPages(me.classId);
  const go = (to: string) => { sfx.tap(); nav(to); };
  const loading = tools.isPending || (!!me.classId && pages.isPending);
  const list = pages.data ?? [];
  return (
    <div className="ln-page ln-apps">
      <header className="ln-row ln-apps__head">
        <Button variant="secondary" size="md" onClick={() => nav('/')} icon={<Icon name="back" />}>Về</Button>
        <h1 className="ln-h1">Ứng dụng học</h1>
      </header>
      {loading ? <LoadingScreen /> : tools.isError && pages.isError ? <ErrorState onRetry={() => { void tools.refetch(); void pages.refetch(); }} /> : !list.length && !(tools.data ?? []).length ? (
        <EmptyState title="Chưa có gì ở đây" text="Khi thầy cô thêm bài đọc, trang học hay ứng dụng cho lớp, em sẽ thấy ở đây." />
      ) : (
        <div className="ln-apps__list">
          {list.length ? <h2 className="ln-h2">Thầy cô giao</h2> : null}
          {list.map((p) => (
            <Card key={p.id} className="ln-apps__card">
              <div className="ln-apps__icon" aria-hidden><Icon name={p.kind === 'lti' ? 'puzzle' : 'book'} size={34} /></div>
              <div className="ln-apps__text"><h3 className="ln-h2">{p.title}</h3>{p.description ? <p>{p.description}</p> : null}</div>
              <Button size="lg" onClick={() => go(`/trang/${p.id}`)} data-testid={`page-open-${p.id}`}>Mở</Button>
            </Card>
          ))}
          {(tools.data ?? []).length ? <h2 className="ln-h2">Ứng dụng của trường</h2> : null}
          {(tools.data ?? []).map((t) => (
            <Card key={t.id} className="ln-apps__card">
              <div className="ln-apps__icon" aria-hidden><Icon name="puzzle" size={34} /></div>
              <div className="ln-apps__text"><h3 className="ln-h2">{t.name}</h3>{t.description ? <p>{t.description}</p> : null}</div>
              <Button size="lg" onClick={() => go(`/ung-dung/${t.id}`)} data-testid={`lti-open-${t.id}`}>Mở</Button>
            </Card>
          ))}
          <p className="ln-apps__note">Điểm em làm ở ứng dụng sẽ hiện trong hồ sơ học tập.</p>
        </div>
      )}
      <AppTabs active="home" />
    </div>
  );
}
