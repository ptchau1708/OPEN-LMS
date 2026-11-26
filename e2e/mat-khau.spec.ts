import { expect, test } from '@playwright/test';
import { LEARNER, TEACHER, spaGo, teacherLogin, watchErrors } from './helpers';

test('quên mật khẩu: tài khoản SĐT / tên đăng nhập được hướng dẫn nhờ thầy cô, không gửi thư', async ({ page }) => {
  await page.goto(`${LEARNER}/dang-nhap`);
  await page.getByRole('button', { name: 'Đăng nhập bằng tên' }).click();
  await page.getByTestId('login-forgot').click();
  await page.waitForURL('**/quen-mat-khau');
  await page.getByTestId('forgot-email').fill('0912 345 678');
  await expect(page.getByTestId('forgot-no-email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi thư đặt lại mật khẩu' })).toBeDisabled();
  await page.getByTestId('forgot-email').fill('me.lan@gmail.com');
  await expect(page.getByTestId('forgot-no-email')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Gửi thư đặt lại mật khẩu' })).toBeEnabled();
});

test('phụ huynh tự đổi mật khẩu rồi đăng nhập bằng mật khẩu mới', async ({ page }) => {
  await page.goto(`${LEARNER}/dang-nhap`);
  await page.getByText('Mẹ bạn Minh An', { exact: true }).click();
  await page.waitForURL('**/phu-huynh');
  await page.getByTestId('parent-change-pw').click();
  await page.getByTestId('pw-current').fill('123456');
  await page.getByTestId('pw-new').fill('Meo-lan-2026');
  await page.getByTestId('pw-again').fill('Meo-lan-2026');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByText('Đã đổi mật khẩu!')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL('**/dang-nhap');
  await page.getByRole('button', { name: 'Đăng nhập bằng tên' }).click();
  await page.locator('input.ln-input').first().fill('phuhuynh');
  await page.locator('input[type=password]').fill('Meo-lan-2026');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/phu-huynh');
});

test('GVCN cấp lại mật khẩu cho phụ huynh lớp mình → phiếu mật khẩu tạm', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/phu-huynh?the=lien-ket');
  await page.getByTestId('parent-reset-pw').first().click();
  await expect(page.locator('.ad-slip--acc')).toContainText('Mật khẩu tạm');
  await expect(page.locator('.ad-slip--acc')).toContainText('Phụ huynh');
  w.expectClean();
});

test('quản trị cấp mật khẩu tạm cho giáo viên → giáo viên phải đổi ngay khi đăng nhập', async ({ page }) => {
  await teacherLogin(page, 'admin');
  await spaGo(page, '/quan-tri/tai-khoan');
  await page.getByRole('radio', { name: 'Giáo viên' }).or(page.getByRole('button', { name: 'Giáo viên', exact: true })).first().click();
  const row = page.locator('tr', { hasText: 'Cô Lan' });
  await row.getByRole('button', { name: /mật khẩu/ }).click();
  const temp = (await page.locator('.ad-slip__acc dd').nth(1).innerText()).trim();
  expect(temp).toMatch(/^\d{6}$/);
  await page.locator('.tc-user__btn').click();
  await page.getByRole('menuitem', { name: /Đăng xuất/ }).click();
  await page.goto(`${TEACHER}/`);
  await page.locator('input.tc-input').first().fill('colan');
  await page.locator('input[type=password]').fill(temp);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible();
  await page.getByTestId('pw-current').fill(temp);
  await page.getByTestId('pw-new').fill('Co-lan-2026');
  await page.getByTestId('pw-again').fill('Co-lan-2026');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
});
