import { describe, expect, it } from 'vitest';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { DemoSchoolSource } from '../school';
import { isSystemEmail, newPasswordProblem } from '../password';

function setup() {
  const storage = new MemoryStorage();
  const ds = new DemoDataSource({ storage, relayUrl: 'ws://127.0.0.1:1' });
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return { ds, school: new DemoSchoolSource(ds, { rand }) };
}

describe('quy tắc mật khẩu', () => {
  it('chặn ngắn, trùng cũ, dễ đoán, dấu cách đầu cuối', () => {
    expect(newPasswordProblem('12345')).toMatch(/ít nhất/);
    expect(newPasswordProblem('matkhau9', 'matkhau9')).toMatch(/khác/);
    expect(newPasswordProblem('123456')).toMatch(/dễ đoán/);
    expect(newPasswordProblem('aaaaaaa')).toMatch(/dễ đoán/);
    expect(newPasswordProblem(' meolan9')).toMatch(/dấu cách/);
    expect(newPasswordProblem('Meo-lan-2026', 'cu123')).toBeNull();
  });
  it('chỉ email thật mới nhận được thư khôi phục', () => {
    expect(isSystemEmail('me.lan@gmail.com', 'openlms.edu')).toBe(false);
    expect(isSystemEmail('co.lan@truong.edu.vn', 'openlms.edu')).toBe(false);
    expect(isSystemEmail('an2a1@openlms.edu', 'openlms.edu')).toBe(true);
    expect(isSystemEmail('0912345678@parent.openlms.edu', 'openlms.edu')).toBe(true);
    expect(isSystemEmail('0912345678', 'openlms.edu')).toBe(true);
    expect(isSystemEmail('an2a1', 'openlms.edu')).toBe(true);
  });
});

describe('cấp lại mật khẩu (bản demo)', () => {
  it('GVCN cấp mật khẩu tạm cho phụ huynh lớp mình → phụ huynh bị bắt đổi → đổi xong vào bình thường', async () => {
    const { ds, school } = setup();
    await ds.signIn('colan', '123456');
    const slip = await school.resetPassword('u-phuhuynh');
    expect(slip.temporary).toBe(true);
    expect(slip.role).toBe('parent');
    await ds.signOut();
    await expect(ds.signIn('phuhuynh', '123456')).rejects.toThrow(/Mật khẩu chưa đúng/);
    const me = await ds.signIn('phuhuynh', slip.password);
    expect(me.mustChangePassword).toBe(true);
    await expect(ds.changePassword('sai', 'Meo-lan-2026')).rejects.toThrow(/hiện tại chưa đúng/);
    await expect(ds.changePassword(slip.password, slip.password)).rejects.toThrow(/khác/);
    await ds.changePassword(slip.password, 'Meo-lan-2026');
    expect((await ds.getCurrentUser())?.mustChangePassword).toBeUndefined();
    await ds.signOut();
    expect((await ds.signIn('phuhuynh', 'Meo-lan-2026')).username).toBe('phuhuynh');
  });

  it('học sinh không bị bắt đổi; GV lớp khác không cấp được; không tự cấp cho mình', async () => {
    const { ds, school } = setup();
    await ds.signIn('colan', '123456');
    const s = await school.resetPassword('u-an2a1');
    expect(s.temporary).toBe(false);
    await expect(school.resetPassword('u-phuhuynh4a')).rejects.toThrow(/lớp mình chủ nhiệm/);
    await expect(school.resetPassword('u-colan')).rejects.toThrow();
    await ds.signOut();
    expect((await ds.signIn('an2a1', s.password)).mustChangePassword).toBeUndefined();
  });

  it('quản trị cấp mật khẩu tạm cho giáo viên', async () => {
    const { ds, school } = setup();
    await ds.signIn('admin', '123456');
    const t = await school.resetPassword('u-colan');
    expect(t.temporary).toBe(true);
    await ds.signOut();
    expect((await ds.signIn('colan', t.password)).mustChangePassword).toBe(true);
  });

  it('quên mật khẩu: tài khoản không có email thật được hướng dẫn nhờ thầy/cô', async () => {
    const { ds } = setup();
    await expect(ds.requestPasswordReset('0912345678', 'http://x/dat-lai-mat-khau')).rejects.toThrow(/thầy\/cô chủ nhiệm/);
  });
});
