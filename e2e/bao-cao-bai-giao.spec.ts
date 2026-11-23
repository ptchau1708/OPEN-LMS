import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Giao bài: xem báo cáo một bài → giao lại lượt 2 cho cả lớp', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/giao-bai');
  await page.getByTestId('assign-report').first().click();
  const d = page.getByTestId('assign-detail');
  await expect(d.getByTestId('detail-students')).toBeVisible();
  await expect(d.getByTestId('detail-questions')).toBeVisible();
  await page.getByTestId('detail-retry').click();
  await page.getByRole('button', { name: 'Cả lớp', exact: true }).last().click();
  await page.getByTestId('retry-go').click();
  await expect(d.getByRole('button', { name: 'Lượt 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(page.locator('.tc-assigncard').getByText('Lượt 2').first()).toBeVisible();
  w.expectClean();
});

test('Báo cáo bài giao theo đợt: đổi ngày / tuần / tháng / học kì, xuất Excel', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/bao-cao-bai-giao');
  await page.getByRole('button', { name: 'Học kì', exact: true }).click();
  await expect(page.getByTestId('report-range')).toContainText('Học kì');
  await expect(page.getByTestId('report-table')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  expect((await dl).suggestedFilename()).toMatch(/^bao-cao-bai-giao-.*\.xlsx$/);
  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(page.getByTestId('report-range')).toContainText('Tháng');
  await page.getByRole('button', { name: 'Ngày', exact: true }).click();
  await expect(page.getByTestId('report-range')).toContainText('Ngày');
  w.expectClean();
});
