/** Soạn thông báo gửi phụ huynh: cả lớp hoặc chọn em, mẫu soạn sẵn, cần xác nhận, hẹn giờ. */
import { useMemo, useState } from 'react';
import type { ClassInfo } from '@openedu/contracts';
import { useCreateParentPost, useGuardianLinks } from '@openedu/data';
import { Btn, ErrorNote, Field, GroupField, Seg } from '../../components/common';
import { useRoster } from '../../lib/assess';
import { cx, fmtDateTime, toLocalInput } from '../../lib/format';

const TEMPLATES: { id: string; label: string; title: string; body: string; ack?: boolean; one?: boolean }[] = [
  { id: 'hop', label: 'Họp phụ huynh', title: 'Mời họp phụ huynh', body: 'Kính mời quý phụ huynh dự họp phụ huynh lúc …… giờ, ngày ……, tại phòng học lớp.\nNội dung: tình hình học tập, rèn luyện của các con và kế hoạch thời gian tới.\nRất mong quý phụ huynh sắp xếp thời gian tham dự.', ack: true },
  { id: 'nghi', label: 'Lịch nghỉ học', title: 'Thông báo lịch nghỉ', body: 'Các con được nghỉ học từ ngày …… đến hết ngày ……. Các con đi học lại vào ngày …….\nKính mong quý phụ huynh nhắc các con ôn bài trong những ngày nghỉ.' },
  { id: 'do-dung', label: 'Chuẩn bị đồ dùng', title: 'Nhắc chuẩn bị đồ dùng học tập', body: 'Ngày ……, các con mang theo: …….\nCảm ơn quý phụ huynh đã nhắc con chuẩn bị.' },
  { id: 'tuan', label: 'Tình hình tuần', title: 'Tình hình lớp trong tuần', body: 'Tuần qua, lớp …….\nTuần tới, các con sẽ học …….\nKính mong quý phụ huynh tiếp tục đồng hành cùng các con.' },
  { id: 'khen', label: 'Khen ngợi (gửi riêng)', title: 'Thầy/cô khen con', body: 'Chào gia đình, tuần này con đã …….\nThầy/cô rất vui và mong gia đình cùng động viên con.', one: true },
  { id: 'trao-doi', label: 'Mời trao đổi (gửi riêng)', title: 'Thầy/cô muốn trao đổi về con', body: 'Chào gia đình, thầy/cô muốn trao đổi thêm về ……. Gia đình nhắn lại cho thầy/cô thời gian thuận tiện nhé.', one: true, ack: true },
];

export function ComposePanel({ cls, onSent, onLinks }: { cls: ClassInfo; onSent: () => void; onLinks: () => void }) {
  const { roster } = useRoster(cls);
  const links = useGuardianLinks(cls.id);
  const create = useCreateParentPost();
  const [audience, setAudience] = useState<'class' | 'students'>('class');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ack, setAck] = useState(false);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(() => { const d = new Date(Date.now() + 3_600_000); d.setMinutes(0, 0, 0); return toLocalInput(d); });
  const [done, setDone] = useState<{ text: string; none?: boolean } | null>(null);

  const linked = useMemo(() => new Set((links.data ?? []).map((l) => l.studentId)), [links.data]);
  const parentsOf = (ids: string[]) => new Set((links.data ?? []).filter((l) => ids.includes(l.studentId)).map((l) => l.parentId)).size;
  const targets = audience === 'class' ? roster.map((s) => s.id) : picked;
  const reach = parentsOf(targets);
  const missing = targets.filter((id) => !linked.has(id)).length;
  const noParents = !links.isLoading && !links.error && roster.length > 0 && linked.size === 0;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const applyTpl = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title); setBody(t.body); setAck(!!t.ack);
    if (t.one) setAudience('students');
  };
  const later = when === 'later' ? new Date(at) : null;
  const canSend = title.trim().length > 0 && targets.length > 0 && !create.isPending && (!later || later.getTime() > Date.now());

  const send = () => create.mutate({
    classId: cls.id, audience, studentIds: audience === 'students' ? picked : undefined, title: title.trim(), body: body.trim(), ackRequired: ack,
    sendAt: later ? later.toISOString() : undefined,
  }, {
    onSuccess: (p) => {
      if (!p.sent) setDone({ text: `Đã hẹn gửi “${p.title}” lúc ${fmtDateTime(p.sendAt)}.` });
      else if (p.parents > 0) setDone({ text: `Đã gửi “${p.title}” tới ${p.parents} phụ huynh.` });
      else setDone({ none: true, text: `Đã lưu “${p.title}”, nhưng chưa phụ huynh nào nhận được vì ${audience === 'class' ? `lớp ${cls.name}` : 'các em đã chọn'} chưa có phụ huynh liên kết tài khoản. Phụ huynh liên kết sau vẫn đọc được thông báo này trong hộp thư.` });
      setTitle(''); setBody(''); setAck(false); setPicked([]);
    },
  });

  return (
    <section className="tc-card tc-ph-compose" data-testid="ph-compose">
      {done ? (
        <div className={cx('tc-alert', done.none ? 'tc-alert--warn' : 'tc-alert--ok')} role="status" data-testid="ph-done">
          <span>{done.text}</span>
          {done.none ? <Btn size="sm" kind="primary" icon="qr" onClick={onLinks} data-testid="ph-go-links">Liên kết phụ huynh</Btn> : null}
          <Btn size="sm" onClick={onSent}>Xem đã gửi</Btn>
          <Btn size="sm" kind="ghost" onClick={() => setDone(null)}>Soạn tin khác</Btn>
        </div>
      ) : noParents ? (
        <div className="tc-alert tc-alert--warn tc-ph-nolink" role="note" data-testid="ph-nolink">
          <span>
            <strong>Lớp {cls.name} chưa có phụ huynh nào liên kết tài khoản</strong> — thông báo gửi lúc này chưa đến được ai.
            Thầy/cô tạo mã liên kết (in phiếu cho cả lớp), phụ huynh nhập mã trên app là nhận được thông báo, kể cả các thông báo đã gửi trước đó.
          </span>
          <Btn size="sm" kind="primary" icon="qr" onClick={onLinks} data-testid="ph-nolink-go">Tạo mã liên kết</Btn>
        </div>
      ) : null}
      <div className="tc-ph-compose__grid">
        <div className="tc-col">
          <GroupField label="Gửi tới">
            <Seg label="Gửi tới" value={audience} onChange={setAudience} options={[{ value: 'class', label: `Cả lớp ${cls.name}` }, { value: 'students', label: 'Chọn học sinh' }]} />
          </GroupField>
          {audience === 'students' ? (
            <GroupField label={`Học sinh (${picked.length} em)`} help="Em có dấu ⚠ chưa có phụ huynh liên kết — phụ huynh em đó chưa nhận được tin.">
              <div className="tc-ph-pick">
                {roster.map((s) => (
                  <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} className={cx('tc-ph-pick__b', !linked.has(s.id) && 'is-nolink')} onClick={() => toggle(s.id)}>
                    {s.name}{!linked.has(s.id) ? <span aria-label="chưa có phụ huynh liên kết"> ⚠</span> : null}
                  </button>
                ))}
              </div>
              <div className="tc-row">
                <Btn size="sm" kind="ghost" onClick={() => setPicked(roster.map((s) => s.id))}>Chọn cả lớp</Btn>
                <Btn size="sm" kind="ghost" onClick={() => setPicked([])}>Bỏ chọn</Btn>
              </div>
            </GroupField>
          ) : null}
          <GroupField label="Mẫu soạn sẵn">
            <div className="tc-row tc-wrap">{TEMPLATES.map((t) => <Btn key={t.id} size="sm" onClick={() => applyTpl(t.id)}>{t.label}</Btn>)}</div>
          </GroupField>
        </div>
        <div className="tc-col">
          <Field label="Tiêu đề"><input className="tc-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="ph-title" placeholder="Ví dụ: Mời họp phụ huynh" /></Field>
          <Field label="Nội dung" help={`${body.length}/5000 kí tự. Đường link (https://…) sẽ bấm mở được.`}>
            <textarea className="tc-input" rows={7} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} data-testid="ph-body" />
          </Field>
          <label className="tc-check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="ph-ack" /> Cần phụ huynh bấm “Đã nhận” (theo dõi ai chưa xác nhận)</label>
          <GroupField label="Thời điểm gửi">
            <div className="tc-row tc-wrap">
              <Seg label="Thời điểm gửi" value={when} onChange={setWhen} options={[{ value: 'now', label: 'Gửi ngay' }, { value: 'later', label: 'Hẹn giờ' }]} />
              {when === 'later' ? <input type="datetime-local" className="tc-input tc-input--sm" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Giờ gửi" /> : null}
            </div>
          </GroupField>
        </div>
      </div>
      <ErrorNote error={create.error} />
      <div className="tc-row tc-wrap tc-ph-compose__foot">
        <span className={cx('tc-small', targets.length && !reach ? 'tc-ph-warn' : 'tc-muted')} data-testid="ph-reach">
          {!targets.length ? 'Chưa chọn em nào.' : reach ? `Tới ${reach} phụ huynh của ${targets.length} em.` : `Chưa có phụ huynh nào nhận được (${targets.length} em chưa liên kết).`}
          {missing && reach ? ` ${missing} em chưa có phụ huynh liên kết.` : ''}
          {missing ? <> <button type="button" className="tc-linkbtn" onClick={onLinks}>Tạo mã liên kết</button></> : null}
        </span>
        <span className="tc-spacer" />
        <Btn kind="primary" icon="send" disabled={!canSend} onClick={send} data-testid="ph-send">{create.isPending ? 'Đang gửi…' : when === 'later' ? 'Hẹn gửi' : 'Gửi'}</Btn>
      </div>
    </section>
  );
}
