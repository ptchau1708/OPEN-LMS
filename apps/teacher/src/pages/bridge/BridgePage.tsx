import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { schoolYearOf, TT27_TERM_LABEL, type Profile, type Tt27TermId } from '@openedu/contracts';
import { bridge, useDataSource, useSchoolSettings } from '@openedu/data';
import { Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, vnToday } from '../../lib/assess';
import { ClassroomTab } from './Classroom';
import { CodeEditor } from './CodeEditor';
import { QuickExport } from './QuickExport';
import { RosterImport } from './RosterImport';
import { TemplateFill } from './TemplateFill';
import './bridge.css';

type Tab = 'fill' | 'roster' | 'export' | 'codes' | 'classroom';
const TABS: { id: Tab; label: string; group: string }[] = [
  { id: 'fill', label: 'Điền vào mẫu', group: 'VnEdu' },
  { id: 'roster', label: 'Nhập danh sách', group: 'VnEdu' },
  { id: 'export', label: 'Xuất nhanh', group: 'VnEdu' },
  { id: 'codes', label: 'Mã học sinh', group: 'VnEdu' },
  { id: 'classroom', label: 'Google Classroom', group: 'Google' },
];
const TERMS: Tt27TermId[] = ['GK1', 'CK1', 'GK2', 'CN'];

export default function BridgePage({ user }: { user: Profile }) {
  const ds = useDataSource();
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const settings = useSchoolSettings().data;
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.id === sp.get('tab')) ? sp.get('tab') as Tab : 'fill'));
  const [term, setTerm] = useState<Tt27TermId | null>(null);
  const [month, setMonth] = useState(vnToday().slice(0, 7));
  const termId = term ?? settings?.termId ?? 'CK1';
  const schoolYear = settings?.schoolYear ?? schoolYearOf();
  const q = useQuery({
    queryKey: ['bridge', classId, termId, schoolYear, month],
    queryFn: async () => {
      const d = await bridge.loadBridgeData(ds, cls!, { termId, schoolYear, month });
      const g = await bridge.getBridgeSource(ds).listGoogleIds(cls!.id).catch(() => ({} as Record<string, bridge.GoogleIdentity>));
      return { ...d, googleEmails: Object.fromEntries(Object.entries(g).filter(([, v]) => v.email).map(([k, v]) => [k, v.email as string])) };
    },
    enabled: !!cls,
  });
  const data = q.data;
  const refetch = () => void q.refetch();
  const groupOf = useMemo(() => TABS.find((t) => t.id === tab)?.group, [tab]);

  return (
    <div className="tc-page tc-page--wide br-page">
      <PageHead title="Xuất / nhập dữ liệu" sub="Cầu nối với VnEdu (qua tệp Excel) và Google Classroom." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <label className="tc-row tc-small">Kì <select className="tc-input tc-input--sm" value={termId} onChange={(e) => setTerm(e.target.value as Tt27TermId)}>{TERMS.map((t) => <option key={t} value={t}>{TT27_TERM_LABEL[t]}</option>)}</select></label>
        <label className="tc-row tc-small">Tháng chuyên cần <input className="tc-input tc-input--sm" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
      </>} />
      <div className="tc-alert tc-alert--info br-honest" data-testid="br-honest">
        <span>Chưa nối trực tiếp với VnEdu vì VNPT chưa cấp cổng kết nối cho trường. Khi trường có tài liệu API, phần này sẽ đồng bộ tự động.</span>
      </div>
      <div className="tc-tabs br-tabs" role="tablist" aria-label="Chọn việc">
        {TABS.map((t, i) => [
          i === 0 || TABS[i - 1].group !== t.group ? <span key={`g-${t.group}`} className="br-tabs__group">{t.group}</span> : null,
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>,
        ])}
      </div>
      <ErrorNote error={classes.error ?? q.error} onRetry={refetch} />
      {!list.length && !classes.isLoading ? <Empty icon="team" title="Thầy cô chưa có lớp nào" /> : !data || q.isLoading ? <Loading /> : (
        <div key={`${classId}-${groupOf}`}>
          {tab === 'fill' ? <TemplateFill data={data} onChanged={refetch} /> : null}
          {tab === 'roster' ? <RosterImport data={data} onChanged={refetch} /> : null}
          {tab === 'export' ? <QuickExport data={data} /> : null}
          {tab === 'codes' ? <CodeEditor data={data} onChanged={refetch} /> : null}
          {tab === 'classroom' ? <ClassroomTab data={data} onChanged={refetch} /> : null}
        </div>
      )}
    </div>
  );
}
