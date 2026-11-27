import { expect, test } from '@playwright/test';
import { LEARNER, TEACHER, watchErrors } from './helpers';

test('đăng nhập chung: thầy/cô đăng nhập ở app học sinh → tự sang app giáo viên, không hỏi lại mật khẩu', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto(`${LEARNER}/`);
  await expect(page.getByTestId('login-staff-note')).toBeVisible();
  await page.getByText('Cô Lan', { exact: true }).first().click();
  await page.waitForURL(`${TEACHER}/**`);
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  // Phiên đã được đọc và xóa khỏi thanh địa chỉ.
  expect(new URL(page.url()).hash).toBe('');
  // App học sinh đã bỏ phiên của thầy/cô.
  await page.goto(`${LEARNER}/`);
  await expect(page.getByTestId('login-staff-note')).toBeVisible();
  w.expectClean();
});

test('đăng nhập chung: học sinh đăng nhập nhầm ở app giáo viên → tự về Góc học tập', async ({ page }) => {
  await page.goto(`${TEACHER}/`);
  await page.locator('input.tc-input').first().fill('an2a1');
  await page.locator('input[type=password]').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(`${LEARNER}/**`);
  await expect(page.getByText('Chào Minh An!')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});
