import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('TT27: chọn nhiều học sinh rồi đặt mức và nhận xét một lần', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/tt27');
  await page.getByTestId('tt27-pick-all').check();
  const bar = page.getByTestId('tt27-bulk');
  await expect(bar).toContainText('Đã chọn');
  // Bỏ chọn em đầu tiên → chỉ các em còn lại được áp dụng.
  const rows = page.locator('table.tc-tt27 tbody tr');
  const n = await rows.count();
  await rows.first().locator('input[type=checkbox]').uncheck();
  await expect(bar).toContainText(`Đã chọn ${n - 1} em`);
  await bar.getByRole('radio', { name: 'T' }).first().click();
  await bar.getByLabel('Nhận xét môn cho các em đã chọn').fill('Nắm vững kiến thức.');
  await bar.getByRole('button', { name: 'Áp dụng nhận xét môn' }).click();
  await expect(rows.nth(1).locator('textarea').first()).toHaveValue(/Nắm vững kiến thức\./);
  await expect(rows.nth(1).locator('.tc-tt27__cell').first().getByRole('radio', { name: 'T' })).toHaveAttribute('aria-checked', 'true');
  await expect(rows.first().locator('textarea').first()).not.toHaveValue(/Nắm vững kiến thức\./);
  await expect(page.getByRole('button', { name: /Lưu nháp \(\d+\)/ })).toBeVisible();
  w.expectClean();
});

test('Hành vi: hai nhóm tích cực / cần cố gắng, đổi được biểu tượng', async ({ page }) => {
  await teacherLogin(page, 'colan');
  await spaGo(page, '/thi-dua');
  await page.getByRole('button', { name: 'Sửa danh sách hành vi' }).click();
  const pos = page.getByTestId('bh-group-pos');
  const neg = page.getByTestId('bh-group-neg');
  await expect(pos.getByLabel('Tên hành vi').first()).toHaveValue('Hăng hái phát biểu');
  await expect(neg.getByLabel('Tên hành vi').first()).toHaveValue(/Quên đồ dùng/);
  await expect(pos.locator('select').first().locator('option')).toHaveText(['+1', '+2', '+3']);
  await pos.getByTestId('bh-icon').first().click();
  await page.getByRole('button', { name: 'Biểu tượng 🌟' }).click();
  await expect(pos.getByTestId('bh-icon').first()).toHaveText('🌟');
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
});

test('Điểm danh: tháng 11 (30 ngày) tải được, không lỗi ngày 31', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/diem-danh');
  await page.locator('input[type=date]').fill('2026-11-23');
  await expect(page.getByText(/out of range|Không tải được điểm danh/)).toHaveCount(0);
  w.expectClean();
});

test('Lớp học: lên đến 10 tổ, chọn nhiều học sinh xếp vào tổ một lần', async ({ page }) => {
  await teacherLogin(page, 'colan');
  await spaGo(page, '/lop');
  await page.getByTestId('team-count').selectOption('10');
  await expect(page.locator('.tc-teamed')).toHaveCount(10);
  await page.getByTestId('roster-pick-all').check();
  const bar = page.getByTestId('team-movebar');
  await bar.getByRole('button', { name: 'Tổ Sóc Nâu' }).click();
  const last = page.locator('.tc-teamed').nth(9);
  const n = await page.locator('.tc-roster li').count();
  await expect(last.locator('.tc-chip--student')).toHaveCount(n);
  await expect(bar).toHaveCount(0);
});

test('Ngân hàng câu hỏi: chọn nhiều câu → giao cho học sinh → sang Giao bài với bài luyện tập vừa tạo', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/ngan-hang');
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi' })).toBeVisible();
  const rows = page.locator('.tc-qbrow__pick');
  await rows.nth(0).check();
  await rows.nth(1).check();
  await rows.nth(2).check();
  await page.getByTestId('qb-assign').click();
  await page.getByTestId('qb-assign-go').click();
  await page.waitForURL(/\/giao-bai\?bai=/);
  await expect(page.getByLabel('Chọn nội dung')).not.toHaveValue('');
  await expect(page.getByLabel('Chọn nội dung').locator('option:checked')).toContainText('3 slide');
  w.expectClean();
});
