import { useMemo, useState } from 'react';
import { GUARDIAN_CODE_STATUS_LABEL, MAX_GUARDIANS_PER_CHILD, type GuardianCode, type Profile } from '@openedu/contracts';
import { codeStatus, formatCode, useCreateGuardianCodes, useGuardianCodes, useGuardianLinks, useRevokeGuardianCode, useRevokeGuardianLink, useSchoolSettings } from '@openedu/data';
import { Btn, ConfirmBar, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { cx, fmtDate } from '../../lib/format';
import { CodeSlip } from './util';
import '../../styles/admin.css';

export default function ParentLinks({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId } = useClassPick(user);
  const { roster } = useRoster(cls);
  const codes = useGuardianCodes(classId || undefined);
  const links = useGuardianLinks(classId || undefined);
  const create = useCreateGuardianCodes();
  const revokeCode = useRevokeGuardianCode();
  const revokeLink = useRevokeGuardianLink();
  const school = useSchoolSettings().data;
  const [print, setPrint] = useState<GuardianCode[] | null>(null);
  const [confirm, setConfirm] = useState<{ parentId: string; studentId: string; text: string } | null>(null);
  const now = new Date();

  /** Mã còn hiệu lực mới nhất của từng HS. */
  const activeBy = useMemo(() => {
    const m = new Map<string, GuardianCode>();
    for (const c of codes.data ?? []) if (codeStatus(c, now) === 'active' && !m.has(c.studentId)) m.set(c.studentId, c);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.data]);
  const linksBy = useMemo(() => {
    const m = new Map<string, NonNullable<typeof links.data>>();
    for (const l of links.data ?? []) m.set(l.studentId, [...(m.get(l.studentId) ?? []), l]);
    return m;
  }, [links.data]);

  if (print && cls) {
    const name = (id: string) => roster.find((s) => s.id === id)?.name ?? id;
    return (
      <div className="tc-page ad-print">
        <div className="tc-row tc-noprint">
          <Btn icon="back" onClick={() => setPrint(null)}>Quay lại</Btn>
          <Btn kind="primary" onClick={() => window.print()}>In phiếu ({print.length})</Btn>
          <span className="tc-muted">Mỗi trang A4 in được 8 phiếu. Cắt theo đường chấm, gửi trong sổ liên lạc.</span>
        </div>
        <div className="ad-slips">{print.map((c) => <CodeSlip key={c.code} code={c} studentName={c.studentName ?? name(c.studentId)} className={cls.name} schoolName={school?.schoolName} />)}</div>
      </div>
    );
  }

  const makeAll = () => create.mutate({ classId }, { onSuccess: (list) => setPrint(list) });
  const printActive = () => setPrint(roster.map((s) => activeBy.get(s.id)).filter((c): c is GuardianCode => !!c));

  return (
    <div className="tc-page ad-page">
      <PageHead
        title="Liên kết phụ huynh"
        sub={`Mỗi em một mã 8 kí tự, dùng một lần, hết hạn sau 14 ngày. Một em có tối đa ${MAX_GUARDIANS_PER_CHILD} tài khoản phụ huynh.`}
        actions={<>
          <ClassPicker list={list} value={classId} onChange={setClassId} />
          <Btn icon="eye" disabled={!activeBy.size} onClick={printActive}>In phiếu mã còn hạn ({activeBy.size})</Btn>
          <Btn kind="primary" icon="qr" disabled={!cls || create.isPending} onClick={makeAll}>{create.isPending ? 'Đang tạo…' : 'Tạo mã mới cho cả lớp'}</Btn>
        </>}
      />
      <ErrorNote error={create.error ?? codes.error ?? links.error ?? revokeLink.error ?? revokeCode.error} />
      {confirm ? <ConfirmBar text={confirm.text} confirmLabel="Gỡ liên kết" busy={revokeLink.isPending} onCancel={() => setConfirm(null)} onConfirm={() => revokeLink.mutate({ parentId: confirm.parentId, studentId: confirm.studentId }, { onSuccess: () => setConfirm(null) })} /> : null}
      {!cls ? <Empty icon="team" title="Chưa có lớp" /> : codes.isPending || links.isPending ? <Loading /> : (
        <section className="tc-card tc-card--flush">
          <div className="tc-tablewrap">
            <table className="tc-table ad-table">
              <thead><tr><th>Học sinh</th><th>Phụ huynh đã liên kết</th><th>Mã đang chờ</th><th /></tr></thead>
              <tbody>
                {roster.map((s) => {
                  const c = activeBy.get(s.id);
                  const ls = linksBy.get(s.id) ?? [];
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong><span className="ad-sub">{s.username}</span></td>
                      <td>
                        {ls.length ? (
                          <ul className="ad-links">
                            {ls.map((l) => (
                              <li key={l.parentId}>
                                <span>{l.parentName}{l.relation ? ` (${l.relation})` : ''}</span>
                                <span className="tc-muted">{l.parentLogin ?? ''} · từ {fmtDate(l.createdAt)}</span>
                                <Btn size="sm" kind="ghost" icon="close" aria-label={`Gỡ liên kết ${l.parentName}`} title="Gỡ liên kết" onClick={() => setConfirm({ parentId: l.parentId, studentId: s.id, text: `Gỡ liên kết ${l.parentName} khỏi ${s.name}? Phụ huynh sẽ không xem được kết quả của con nữa.` })} />
                              </li>
                            ))}
                          </ul>
                        ) : <span className="tc-chip tc-chip--warn">Chưa có</span>}
                      </td>
                      <td>{c ? <><code className="ad-code">{formatCode(c.code)}</code><span className="ad-sub">hết hạn {fmtDate(c.expiresAt)}</span></> : <span className="tc-muted">–</span>}</td>
                      <td className="ad-actions">
                        {c ? <Btn size="sm" onClick={() => setPrint([c])}>In phiếu</Btn> : null}
                        {c ? <Btn size="sm" kind="ghost" onClick={() => revokeCode.mutate(c.code)}>Thu hồi</Btn> : <Btn size="sm" onClick={() => create.mutate({ classId, studentIds: [s.id] }, { onSuccess: (l) => setPrint(l) })}>Tạo mã</Btn>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(codes.data ?? []).some((c) => codeStatus(c, now) !== 'active') ? (
        <details className="tc-card ad-history">
          <summary>Lịch sử mã ({(codes.data ?? []).length})</summary>
          <ul className="tc-list tc-list--plain">
            {(codes.data ?? []).map((c) => {
              const st = codeStatus(c, now);
              return <li key={c.code} className="ad-histrow"><code className="ad-code">{formatCode(c.code)}</code><span>{c.studentName}</span><span className={cx('tc-chip', st === 'active' && 'tc-chip--ok', st === 'used' && 'tc-chip--ok')}>{GUARDIAN_CODE_STATUS_LABEL[st]}</span><span className="tc-muted">tạo {fmtDate(c.createdAt)}{c.usedAt ? ` · dùng ${fmtDate(c.usedAt)}` : ''}</span></li>;
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
