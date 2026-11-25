import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Ngân hàng: tải mẫu Word đủ các dạng, tải lên lại → 18 câu đủ 16 dạng, lưu vào ngân hàng; môn học CT 2018', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  // Môn học theo CT GDPT 2018 — "Mọi lớp" hiện đủ các môn, có cả TN&XH
  const subj = page.getByLabel('Môn', { exact: true }).first();
  for (const name of ['Tự nhiên và Xã hội', 'Lịch sử và Địa lí', 'Tin học', 'Công nghệ', 'Đạo đức', 'Giáo dục thể chất', 'Hoạt động trải nghiệm']) {
    await expect(subj.locator('option', { hasText: name })).toHaveCount(1);
  }

  await page.getByTestId('qb-open').click();
  await page.getByRole('tab', { name: /Từ tệp Excel \/ Word/ }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('qb-template-word').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('mau-cau-hoi-word.docx');
  const path = await file.path();
  await page.getByTestId('qb-file').setInputFiles({ name: 'mau-cau-hoi-word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: (await import('node:fs')).readFileSync(path) });
  await expect(page.getByTestId('qb-row')).toHaveCount(18);
  await expect(page.getByTestId('qb-save')).toContainText('17 câu');
  await page.getByTestId('qb-save').click();
  await expect(page.getByText(/Đã lưu 17 câu/)).toBeVisible();
  w.expectClean();
});

test('Môn học hiện theo lớp được chọn (CT GDPT 2018): bộ lọc ngân hàng và hộp thoại tạo bài giảng', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  const subj = page.getByLabel('Môn', { exact: true }).first();
  const grade = page.getByLabel('Lớp', { exact: true }).first();
  const names = async () => (await subj.locator('option').allTextContents()).filter((t) => t !== 'Mọi môn');

  await grade.selectOption('1');
  expect(await names()).toEqual(['Tiếng Việt', 'Toán', 'Tiếng Anh', 'Đạo đức', 'Tự nhiên và Xã hội', 'Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm', 'Tiếng dân tộc thiểu số', 'Khác']);
  await subj.selectOption({ label: 'Tự nhiên và Xã hội' });
  // lớp 4 không có TN&XH → ô môn trở về "Mọi môn"
  await grade.selectOption('4');
  await expect(subj).toHaveValue('');
  expect(await names()).toEqual(['Tiếng Việt', 'Toán', 'Tiếng Anh', 'Đạo đức', 'Lịch sử và Địa lí', 'Khoa học', 'Tin học', 'Công nghệ', 'Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm', 'Tiếng dân tộc thiểu số', 'Khác']);
  await grade.selectOption('3');
  expect(await names()).toContain('Tin học');
  expect(await names()).not.toContain('Khoa học');

  // Tạo bài giảng: đổi lớp → danh sách môn đổi theo, môn không có ở lớp mới tự chuyển
  await spaGo(page, '/bai-giang');
  await page.getByRole('button', { name: 'Tạo bài giảng' }).first().click();
  const dlg = page.getByRole('dialog');
  const dsubj = dlg.getByRole('combobox');
  await dlg.getByRole('button', { name: 'Lớp 4', exact: true }).click();
  await dsubj.selectOption({ label: 'Khoa học' });
  await dlg.getByRole('button', { name: 'Lớp 2', exact: true }).click();
  await expect(dsubj).toHaveValue('tieng-viet');
  await expect(dsubj.locator('option', { hasText: 'Khoa học' })).toHaveCount(0);
  await expect(dsubj.locator('option', { hasText: 'Tự nhiên và Xã hội' })).toHaveCount(1);
  await expect(dsubj.locator('option', { hasText: 'Tiếng Anh (tự chọn)' })).toHaveCount(1);
  w.expectClean();
});
