import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Chấm bài: GV tự chấm (không cần AI) — chọn mức, nhập điểm, nhận xét → duyệt', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/cham-bai?tab=cho-cham');
  await page.locator('.tc-queue__row').first().click();
  const panel = page.getByRole('region', { name: 'Tự chấm' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lưu & duyệt' })).toBeDisabled();
  await panel.getByRole('radio', { name: /^H/ }).click();
  await expect(panel.getByRole('textbox', { name: 'Điểm', exact: true })).toHaveValue('7');
  await panel.getByRole('textbox', { name: 'Điểm', exact: true }).fill('8,5');
  await expect(panel.getByRole('radio', { name: /^T/ })).toHaveAttribute('aria-checked', 'true');
  await panel.getByLabel('Nhận xét cho học sinh').fill('Em trình bày rõ ràng, cô khen em.');
  await panel.getByRole('button', { name: 'Lưu & duyệt' }).click();
  await expect(page.getByRole('status')).toContainText('Đã duyệt');
  await spaGo(page, '/cham-bai?tab=da-duyet');
  const row = page.locator('.tc-queue__row').filter({ hasText: 'GV tự chấm' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('8,5');
  // Mở lại: bảng chấm hiện nhãn GV tự chấm và có nút Tự chấm để sửa
  await row.click();
  await expect(page.locator('.tc-gradepanel').getByText('GV tự chấm')).toBeVisible();
  await page.getByRole('button', { name: 'Tự chấm' }).click();
  await expect(page.getByRole('region', { name: 'Tự chấm' }).getByRole('textbox', { name: 'Điểm', exact: true })).toHaveValue('8.5');
  w.expectClean();
});
