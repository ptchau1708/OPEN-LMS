import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Thi đua: ghi nhận → thống kê, vinh danh, lịch sử từng em, xóa ghi nhận nhầm, xuất Excel', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/thi-dua');
  // Ghi nhận cả lớp một hành vi tích cực
  await page.getByRole('button', { name: 'Cả lớp', exact: true }).click();
  await page.locator('.tc-bhbtn.is-pos').first().click();
  await page.getByTestId('bh-stats-link').click();
  await page.waitForURL('**/thi-dua/thong-ke');
  await expect(page.getByTestId('bh-range')).toContainText('Tuần');
  await expect(page.getByTestId('honor-board').locator('li').first()).toBeVisible();
  expect(await page.getByTestId('honor-board').locator('li').count()).toBeLessThanOrEqual(40);
  await expect(page.getByTestId('bh-stats').locator('tbody tr').first()).toBeVisible();
  // Lịch sử từng em
  await page.getByTestId('bh-student-history').first().click();
  const dlg = page.getByTestId('bh-student-dialog');
  await expect(dlg.getByTestId('bh-history').locator('tbody tr').first()).toBeVisible();
  await dlg.getByRole('button', { name: 'Từ trước tới nay' }).click();
  await expect(dlg.getByTestId('bh-history')).toBeVisible();
  await page.keyboard.press('Escape');
  // Xóa một ghi nhận nhầm ở lịch sử cả lớp
  const hist = page.getByTestId('bh-history').last();
  const before = await hist.locator('tbody tr').count();
  await hist.getByRole('button', { name: 'Xóa ghi nhận nhầm' }).first().click();
  await hist.getByRole('button', { name: 'Xóa thật' }).click();
  await expect(hist.locator('tbody tr')).toHaveCount(before - 1);
  // Tháng, học kì; xuất Excel; trình chiếu
  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(page.getByTestId('bh-range')).toContainText('Tháng');
  await page.getByRole('button', { name: 'Học kì', exact: true }).click();
  await expect(page.getByTestId('bh-range')).toContainText('Học kì');
  const dl = page.waitForEvent('download');
  await page.getByTestId('bh-export').click();
  expect((await dl).suggestedFilename()).toMatch(/^thi-dua-.*\.xlsx$/);
  await page.getByTestId('honor-show').click();
  await expect(page.getByRole('dialog', { name: 'Bảng vinh danh' })).toContainText('Bảng vinh danh lớp');
  w.expectClean();
});
