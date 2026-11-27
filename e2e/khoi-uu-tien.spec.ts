import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Khối ưu tiên: mặc định lớp 5 ở ngân hàng, bài giảng, tạo mới; đổi ở Cài đặt cá nhân', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await expect(page.locator('.tc-user__text small').first()).toContainText('ưu tiên lớp 5');

  // Ngân hàng: lọc sẵn lớp 5, chỉ hiện câu lớp 5
  await spaGo(page, '/ngan-hang');
  const gradeSel = page.getByLabel('Lớp', { exact: true }).first();
  await expect(gradeSel).toHaveValue('5');
  await expect(page.locator('.tc-qbrow').first()).toBeVisible();
  // Thêm nhanh nhiều câu: lớp mặc định 5
  await page.getByTestId('qb-open').click();
  await expect(page.getByRole('group', { name: 'Lớp mặc định' }).getByRole('button', { name: 'Lớp 5' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // Bài giảng: lọc sẵn lớp 5; tạo bài giảng chọn sẵn lớp 5
  await spaGo(page, '/bai-giang');
  await expect(page.getByLabel('Lớp', { exact: true })).toHaveValue('5');
  await page.getByRole('button', { name: 'Tạo bài giảng' }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Lớp 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy' }).click();

  // Danh mục kĩ năng mở sẵn lớp 5
  await spaGo(page, '/ki-nang');
  await expect(page.getByLabel('Lớp', { exact: true }).first()).toHaveValue('5');

  // Đổi khối ưu tiên → lớp 3
  await page.locator('.tc-side .tc-user__btn').click();
  await page.getByTestId('menu-settings').click();
  const box = page.getByTestId('focus-grade');
  await box.getByRole('button', { name: 'Lớp 3' }).click();
  await expect(box.getByRole('status')).toContainText('Đang ưu tiên lớp 3');
  await expect(page.locator('.tc-user__text small').first()).toContainText('ưu tiên lớp 3');
  await spaGo(page, '/ngan-hang');
  await expect(page.getByLabel('Lớp', { exact: true }).first()).toHaveValue('3');
  w.expectClean();
});
