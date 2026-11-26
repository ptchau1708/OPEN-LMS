import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { DUEL_MATCH_WAIT_MS, DUEL_QUESTIONS, SUBJECTS, type DuelInfo, type DuelInvite, type DuelLobby, type DuelPlayer, type SubjectId } from '@openedu/contracts';
import { DUEL_TYPES, useDuelService, useItems, usePassport, useStudents } from '@openedu/data';
import { Button, Icon, Mascot, SpeakButton, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, LoadingScreen, NumberPad, TopBack } from '../../components/Common';
import { useUi } from '../../lib/store';
import { errText, resolveSettings, safeGet, safeSet, useMe } from '../../lib/util';
import { DuelMatchView } from './DuelMatchView';
import { useArenaGate } from '../arena/ArenaWidgets';
import './duel.css';

type View =
  | { k: 'home' }
  | { k: 'seek'; at: number; slow: boolean }
  | { k: 'host'; duel: DuelInfo; invitee?: DuelPlayer }
  | { k: 'join' }
  | { k: 'pick' }
  | { k: 'match'; duel: DuelInfo };

const subjKey = (id: string) => `ln-duel-subject:${id}`;

export default function DuelPage() {
  const me = useMe();
  const itemsQ = useItems(me.grade ? { grade: me.grade } : undefined);
  const companion = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const gate = useArenaGate('duel');
  const subjects = useMemo(() => {
    const n: Partial<Record<SubjectId, number>> = {};
    for (const i of itemsQ.data ?? []) if (DUEL_TYPES.indexOf(i.type) >= 0 && (!gate.pool || gate.pool.has(i.id))) n[i.subject] = (n[i.subject] ?? 0) + 1;
    return (Object.keys(n) as SubjectId[]).filter((s) => (n[s] ?? 0) >= 3).sort((a, b) => (n[b] ?? 0) - (n[a] ?? 0));
  }, [itemsQ.data, gate.pool]);

  if (itemsQ.isPending || gate.loading) return <LoadingScreen label="Đang mở sàn đấu" mascot={companion} />;
  if (gate.closed) return <div className="ln-page"><TopBack title="Đấu 1–1" to="/choi" /><EmptyState title={gate.closed.title} text={gate.closed.text} mascot={companion} /></div>;
  if (itemsQ.isError) return <ErrorState message="Chưa tải được câu hỏi." onRetry={() => void itemsQ.refetch()} />;
  if (!subjects.length || !me.grade) {
    return <div className="ln-page"><TopBack title="Đấu 1–1" to="/choi" /><EmptyState title="Sàn đấu đang chuẩn bị" text="Chưa có đủ câu hỏi cho lớp của em. Em quay lại sau nhé!" mascot={companion} /></div>;
  }
  return <DuelLobbyScreen subjects={subjects} />;
}

function DuelLobbyScreen({ subjects }: { subjects: SubjectId[] }) {
  const me = useMe();
  const nav = useNavigate();
  const svc = useDuelService();
  const toast = useUi((s) => s.toast);
  const settings = resolveSettings(me);
  const young = (me.grade ?? 1) <= 3;
  const [subject, setSubject] = useState<SubjectId>(() => {
    const saved = safeGet(subjKey(me.id)) as SubjectId | null;
    return saved && subjects.indexOf(saved) >= 0 ? saved : subjects[0];
  });
  const [view, setView] = useState<View>({ k: 'home' });
  const [more, setMore] = useState(!young);
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<DuelPlayer[]>([]);
  const abort = useRef<AbortController | null>(null);
  const player: DuelPlayer = useMemo(() => ({ userId: me.id, name: me.name, mascot: me.avatarMascot, color: me.avatarColor }), [me.id, me.name, me.avatarColor, me.avatarMascot]);

  const lobby = useMemo<DuelLobby>(() => svc.openLobby({ me: player, classId: me.classId, grade: me.grade ?? 1, subject }), [svc, player, me.classId, me.grade, subject]);
  useEffect(() => {
    const offC = lobby.onChange(() => setOnline(lobby.online()));
    const offI = lobby.onInvite((inv) => { sfx.tap(); setInvite(inv); });
    return () => { offC(); offI(); lobby.close(); };
  }, [lobby]);
  useEffect(() => () => abort.current?.abort(), []);

  const stopWaiting = () => { abort.current?.abort(); abort.current = null; };
  const fail = (e: unknown) => { if ((e as Error)?.name !== 'AbortError') toast(errText(e), 'try'); setView({ k: 'home' }); };
  const play = (duel: DuelInfo) => { stopWaiting(); sfx.star(); setInvite(null); setView({ k: 'match', duel }); };
  const pickSubject = (s: SubjectId) => { sfx.tap(); setSubject(s); safeSet(subjKey(me.id), s); };

  const seek = () => {
    sfx.tap();
    stopWaiting();
    const ac = new AbortController();
    abort.current = ac;
    const at = Date.now();
    setView({ k: 'seek', at, slow: false });
    lobby.seek(ac.signal).then(play, fail);
  };
  useEffect(() => {
    if (view.k !== 'seek' || view.slow) return;
    const t = window.setTimeout(() => setView((v) => (v.k === 'seek' ? { ...v, slow: true } : v)), Math.max(0, DUEL_MATCH_WAIT_MS - (Date.now() - view.at)));
    return () => window.clearTimeout(t);
  }, [view]);

  const bot = async () => {
    sfx.tap();
    stopWaiting();
    await lobby.cancel();
    setBusy(true);
    try { play(await lobby.bot()); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const host = async (invitee?: DuelPlayer) => {
    sfx.tap();
    stopWaiting();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    try {
      const { duel, ready } = await lobby.host(invitee?.userId, ac.signal);
      setView({ k: 'host', duel, ...(invitee ? { invitee } : {}) });
      ready.then(play, fail);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const join = async (code: string) => {
    setBusy(true);
    try { play(await lobby.join(code)); } catch (e) { toast(errText(e), 'try'); } finally { setBusy(false); }
  };
  const back = () => { stopWaiting(); void lobby.cancel(view.k === 'host' ? view.duel.id : undefined); setView({ k: 'home' }); };

  if (view.k === 'match') {
    return (
      <DuelMatchView
        key={view.duel.id}
        duel={view.duel}
        lobby={lobby}
        bigText={settings.bigText || young}
        onRematch={play}
        onExit={() => { setView({ k: 'home' }); }}
        onHome={() => nav('/choi')}
      />
    );
  }

  const inviteBanner = invite && (
    <div className="ln-duel-invite" role="alertdialog" aria-label="Lời mời đấu">
      <Mascot id={invite.from.mascot} mood="wave" size={64} title="" />
      <p><strong>{invite.from.name}</strong> mời em đấu môn {SUBJECTS[invite.subject].name}!</p>
      <div className="ln-row">
        <Button size="lg" onClick={() => { const inv = invite; setInvite(null); stopWaiting(); void lobby.cancel(); void join(inv.code); }} icon={<Icon name="check" size={26} />}>Nhận lời</Button>
        <Button size="lg" variant="secondary" onClick={() => { lobby.declineInvite(invite); setInvite(null); }}>Để sau</Button>
      </div>
    </div>
  );

  return (
    <div className={`ln-page ln-duel${young ? ' ln-duel--young' : ''}`}>
      <TopBack title="Đấu 1–1" to="/choi" />
      {inviteBanner}
      {view.k === 'home' && (
        <>
          <div className="ln-duel-hero">
            <DuelVs left={player} />
            <div className="ln-duel-hero__text">
              <p className="ln-duel-hero__lead">Em và một bạn cùng trả lời <strong>{DUEL_QUESTIONS} câu</strong>, mỗi câu <strong>20 giây</strong>.</p>
              <p className="ln-duel-hero__sub">Đúng và nhanh thì được nhiều điểm hơn!</p>
              <SpeakButton text={`Đấu một một. Có ${DUEL_QUESTIONS} câu hỏi, mỗi câu 20 giây. Em và bạn cùng trả lời. Đúng và nhanh thì được nhiều điểm. Chọn môn rồi bấm Tìm bạn nhé!`} label="Nghe hướng dẫn" size="md" autoPlay={settings.autoRead && young} />
            </div>
          </div>
          <h2 className="ln-duel-h2">Chọn môn</h2>
          <div className="ln-duel-subjects" role="radiogroup" aria-label="Chọn môn">
            {subjects.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === subject} className={`ln-duel-subj${s === subject ? ' is-on' : ''}`} style={{ ['--subj' as string]: `var(${SUBJECTS[s].colorVar})` }} onClick={() => pickSubject(s)}>
                <Mascot id={SUBJECTS[s].mascot} size={40} title="" />
                <span>{SUBJECTS[s].name}</span>
              </button>
            ))}
          </div>
          <div className="ln-duel-actions">
            <Button size="xl" block onClick={seek} icon={<Icon name="team" size={30} />} disabled={busy}>Tìm bạn</Button>
            <Button size="xl" block variant="subject" color="var(--k-eng)" onClick={() => void bot()} icon={<Icon name="play" size={28} />} disabled={busy}>Đấu với bạn Robo</Button>
            {young && !more && <Button size="lg" block variant="ghost" onClick={() => setMore(true)}>Thêm cách chơi</Button>}
            {more && (
              <div className="ln-duel-more">
                {me.classId && <Button size="lg" variant="secondary" onClick={() => { sfx.tap(); setView({ k: 'pick' }); }} icon={<Icon name="user" size={24} />}>Thách đấu bạn</Button>}
                <Button size="lg" variant="secondary" onClick={() => void host()} icon={<Icon name="plus" size={24} />} disabled={busy}>Mở phòng có mã</Button>
                <Button size="lg" variant="secondary" onClick={() => { sfx.tap(); setView({ k: 'join' }); }} icon={<Icon name="qr" size={24} />}>Vào phòng bằng mã</Button>
              </div>
            )}
          </div>
          <p className="k-muted ln-duel-note">Không có trò chuyện — chỉ có biểu cảm 👏 😮 💪. Mỗi ngày 5 trận đầu được nhận sao.</p>
        </>
      )}

      {view.k === 'seek' && (
        <div className="ln-duel-wait" role="status">
          <DuelVs left={player} searching />
          {!view.slow ? (
            <>
              <h2 className="ln-h1">Đang tìm bạn…</h2>
              <p className="k-muted">Đợi bạn cùng lớp vào đấu môn {SUBJECTS[subject].name} nhé.</p>
              <div className="ln-duel-wait__bar" aria-hidden="true"><i style={{ animationDuration: `${DUEL_MATCH_WAIT_MS}ms` }} /></div>
              <Button size="lg" variant="secondary" onClick={back}>Thôi, quay lại</Button>
            </>
          ) : (
            <>
              <h2 className="ln-h1">Các bạn đang bận rồi!</h2>
              <p className="k-muted">Em đấu với bạn Robo trong lúc chờ nhé?</p>
              <Button size="xl" block onClick={() => void bot()} icon={<Icon name="play" size={28} />}>Đấu với bạn Robo</Button>
              <Button size="lg" block variant="secondary" onClick={() => setView({ ...view, slow: false, at: Date.now() })}>Chờ thêm</Button>
              <Button size="lg" block variant="ghost" onClick={back}>Quay lại</Button>
            </>
          )}
        </div>
      )}

      {view.k === 'host' && (
        <div className="ln-duel-wait" role="status">
          {view.invitee ? (
            <>
              <DuelVs left={player} right={view.invitee} searching />
              <h2 className="ln-h1">Đang chờ {view.invitee.name}…</h2>
              <p className="k-muted">Bạn sẽ thấy lời mời trên máy. Hoặc bạn nhập mã:</p>
            </>
          ) : (
            <>
              <h2 className="ln-h1">Phòng của em</h2>
              <p className="k-muted">Đọc mã này cho bạn cùng lớp nhé:</p>
            </>
          )}
          <p className="ln-duel-code" aria-label={`Mã phòng ${view.duel.code.split('').join(' ')}`}>{view.duel.code}</p>
          <SpeakButton text={`Mã phòng là ${view.duel.code.split('').join(' ')}`} label="Đọc mã" size="md" />
          <Button size="lg" variant="secondary" onClick={back}>Đóng phòng</Button>
        </div>
      )}

      {view.k === 'join' && <JoinByCode busy={busy} onJoin={(c) => void join(c)} onBack={back} />}

      {view.k === 'pick' && <PickClassmate classId={me.classId} meId={me.id} online={online} onPick={(p) => void host(p)} onBack={back} />}
    </div>
  );
}

export function DuelVs({ left, right, searching }: { left: DuelPlayer; right?: DuelPlayer; searching?: boolean }) {
  return (
    <div className={`ln-duel-vs${searching ? ' is-searching' : ''}`} aria-hidden="true">
      <span className="ln-duel-vs__p"><Mascot id={left.mascot} mood="cheer" size={84} title="" animate /></span>
      <span className="ln-duel-vs__x">VS</span>
      <span className="ln-duel-vs__p ln-duel-vs__p--r">
        {right ? <Mascot id={right.mascot} mood="happy" size={84} title="" animate /> : <span className="ln-duel-vs__q">?</span>}
      </span>
    </div>
  );
}

function JoinByCode({ busy, onJoin, onBack }: { busy: boolean; onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  return (
    <div className="ln-duel-wait">
      <h2 className="ln-h1">Nhập mã phòng</h2>
      <p className="k-muted">Bạn em đọc cho em 4 chữ số nhé.</p>
      <div className="ln-duel-codebox" aria-label={`Mã đã nhập: ${code || 'chưa có'}`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={code[i] ? 'is-on' : ''}>{code[i] ?? ''}</span>)}
      </div>
      <NumberPad
        onDigit={(d) => setCode((c) => (c.length < 4 ? c + d : c))}
        onBack={() => setCode((c) => c.slice(0, -1))}
        onOk={() => onJoin(code)}
        okLabel={busy ? '…' : 'Vào'}
        okDisabled={code.length !== 4 || busy}
      />
      <Button size="lg" variant="ghost" onClick={onBack}>Quay lại</Button>
    </div>
  );
}

function PickClassmate({ classId, meId, online, onPick, onBack }: { classId?: string; meId: string; online: DuelPlayer[]; onPick: (p: DuelPlayer) => void; onBack: () => void }) {
  const q = useStudents(classId);
  const onlineIds = new Set(online.map((p) => p.userId));
  const list = (q.data ?? []).filter((s) => s.id !== meId).map((s) => online.find((o) => o.userId === s.id) ?? { userId: s.id, name: s.name, mascot: s.avatarMascot, color: s.avatarColor });
  list.sort((a, b) => Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId)) || a.name.localeCompare(b.name, 'vi'));
  return (
    <div className="ln-duel-pick">
      <h2 className="ln-h1">Thách đấu bạn nào?</h2>
      <p className="k-muted">Bạn có chấm xanh đang mở Đấu 1–1.</p>
      {q.isPending ? <p className="k-muted">Đang tải danh sách lớp…</p> : (
        <ul className="ln-duel-mates">
          {list.map((p) => (
            <li key={p.userId}>
              <button type="button" className="ln-duel-mate" onClick={() => onPick(p)}>
                <Mascot id={p.mascot} size={48} title="" />
                <span className="ln-duel-mate__name">{p.name}</span>
                {onlineIds.has(p.userId) && <i className="ln-duel-dot" aria-label="đang mở" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button size="lg" variant="ghost" onClick={onBack}>Quay lại</Button>
    </div>
  );
}
