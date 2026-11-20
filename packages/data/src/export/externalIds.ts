/**
 * Mã bên ngoài của học sinh: mã ở phần mềm quản lí trường (VnEdu) — cột v2.profiles.external_code — và tài khoản
 * Google (v2.student_external_ids, chỉ GV của lớp / quản trị đọc được). Migration 20261117000003_v2_external_ids.sql.
 * Tách khỏi DataSource (giống SchoolSource): `getBridgeSource(ds)`.
 * ⚠ Bản Supabase CHƯA thử với project thật (RPC có kiểm thử pgTAP).
 */
import type { AccountSlip, DataSource, Profile } from '@openedu/contracts';
import { readJson, writeJson, type KVStorage } from '../storage';
import { getSchoolSource } from '../school/source';

export interface ExternalIdRow {
  studentId: string;
  /** undefined = không đổi; '' = xóa. */
  externalCode?: string;
  googleId?: string;
  googleEmail?: string;
}
export interface GoogleIdentity { googleId: string; email?: string }
export interface NewStudentRow { name: string; externalCode?: string; googleId?: string; googleEmail?: string }

export interface BridgeSource {
  /** GV chủ nhiệm / quản trị ghi mã cho HS của lớp. Trả về số HS đã cập nhật. */
  setExternalIds(classId: string, rows: ExternalIdRow[]): Promise<number>;
  /** studentId → tài khoản Google đã lưu. */
  listGoogleIds(classId: string): Promise<Record<string, GoogleIdentity>>;
  /** Tạo tài khoản HS (đường tạo hàng loạt sẵn có) rồi ghi mã bên ngoài. */
  createStudents(classId: string, rows: NewStudentRow[]): Promise<AccountSlip[]>;
}

const CHUNK = 60;

async function createVia(ds: DataSource, self: BridgeSource, classId: string, rows: NewStudentRow[]): Promise<AccountSlip[]> {
  const clean = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
  const school = getSchoolSource(ds);
  const slips: AccountSlip[] = [];
  for (let i = 0; i < clean.length; i += CHUNK) {
    const part = clean.slice(i, i + CHUNK);
    const made = await school.bulkCreateStudents(classId, part.map((r) => r.name));
    slips.push(...made);
    // Phiếu trả về đúng thứ tự tên gửi lên → ghép mã theo vị trí.
    const ids: ExternalIdRow[] = [];
    made.forEach((s, k) => {
      const r = part[k];
      if (r && (r.externalCode || r.googleId)) ids.push({ studentId: s.userId, ...(r.externalCode ? { externalCode: r.externalCode } : {}), ...(r.googleId ? { googleId: r.googleId, googleEmail: r.googleEmail } : {}) });
    });
    if (ids.length) await self.setExternalIds(classId, ids);
  }
  return slips;
}

/* ============================ demo ============================ */
interface DemoKv { schoolKv(): Promise<{ storage: KVStorage; now: () => Date; changed: () => void }> }

class DemoBridgeSource implements BridgeSource {
  constructor(private ds: DataSource) {}
  private kv() { return (this.ds as unknown as DemoKv).schoolKv(); }

  async setExternalIds(classId: string, rows: ExternalIdRow[]): Promise<number> {
    const { storage: s, changed } = await this.kv();
    const users = readJson<Profile[]>(s, 'users', []);
    const cls = readJson<{ id: string; teacherId: string; studentIds: string[] }[]>(s, 'classes', []).find((c) => c.id === classId);
    if (!cls) throw new Error('Không tìm thấy lớp này.');
    const sess = readJson<{ userId: string } | null>(s, 'session', null);
    const me = sess ? users.find((u) => u.id === sess.userId) : undefined;
    if (me && me.role !== 'admin' && !(me.role === 'teacher' && cls.teacherId === me.id)) throw new Error('Thầy cô chỉ sửa mã cho học sinh lớp mình.');
    const google = readJson<Record<string, GoogleIdentity>>(s, 'googleIds', {});
    let n = 0;
    for (const r of rows) {
      const u = users.find((x) => x.id === r.studentId && x.role === 'student');
      if (!u || !cls.studentIds.includes(u.id)) continue;
      if (r.externalCode !== undefined) {
        const c = r.externalCode.trim().slice(0, 64);
        if (c) u.externalCode = c; else delete u.externalCode;
      }
      if (r.googleId !== undefined) {
        if (r.googleId) google[u.id] = { googleId: r.googleId, ...(r.googleEmail ? { email: r.googleEmail } : {}) };
        else delete google[u.id];
      }
      n++;
    }
    writeJson(s, 'users', users);
    writeJson(s, 'googleIds', google);
    changed();
    return n;
  }

  async listGoogleIds(classId: string): Promise<Record<string, GoogleIdentity>> {
    const { storage: s } = await this.kv();
    const cls = readJson<{ id: string; studentIds: string[] }[]>(s, 'classes', []).find((c) => c.id === classId);
    const all = readJson<Record<string, GoogleIdentity>>(s, 'googleIds', {});
    return Object.fromEntries(Object.entries(all).filter(([id]) => cls?.studentIds.includes(id)));
  }

  createStudents(classId: string, rows: NewStudentRow[]): Promise<AccountSlip[]> {
    return createVia(this.ds, this, classId, rows);
  }
}

/* ============================ Supabase ============================ */
class SupabaseBridgeSource implements BridgeSource {
  constructor(private ds: DataSource) {}
  private async db() { return (await import('../supabase/client')).getSupabaseClient(); }

  async setExternalIds(classId: string, rows: ExternalIdRow[]): Promise<number> {
    if (!rows.length) return 0;
    const sb = await this.db();
    const payload = rows.map((r) => ({
      studentId: r.studentId,
      ...(r.externalCode !== undefined ? { externalCode: r.externalCode } : {}),
      ...(r.googleId !== undefined ? { googleId: r.googleId, googleEmail: r.googleEmail ?? '' } : {}),
    }));
    const { data, error } = await sb.rpc('set_student_external_ids', { p_class: classId, p_rows: payload });
    if (error) throw new Error(/[À-ỹ]/.test(error.message) ? error.message : `Chưa lưu được mã học sinh (${error.message})`);
    return Number(data ?? 0);
  }

  async listGoogleIds(classId: string): Promise<Record<string, GoogleIdentity>> {
    const sb = await this.db();
    const students = await this.ds.listStudents(classId);
    if (!students.length) return {};
    const { data, error } = await sb.from('student_external_ids').select('user_id, external_id, email').eq('provider', 'google').in('user_id', students.map((s) => s.id));
    if (error) throw new Error(`Chưa tải được tài khoản Google của học sinh (${error.message})`);
    const out: Record<string, GoogleIdentity> = {};
    for (const r of (data ?? []) as { user_id: string; external_id: string; email: string | null }[]) out[r.user_id] = { googleId: r.external_id, ...(r.email ? { email: r.email } : {}) };
    return out;
  }

  createStudents(classId: string, rows: NewStudentRow[]): Promise<AccountSlip[]> {
    return createVia(this.ds, this, classId, rows);
  }
}

const cache = new WeakMap<DataSource, BridgeSource>();
export function getBridgeSource(ds: DataSource): BridgeSource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoBridgeSource(ds) : new SupabaseBridgeSource(ds);
    cache.set(ds, s);
  }
  return s;
}
