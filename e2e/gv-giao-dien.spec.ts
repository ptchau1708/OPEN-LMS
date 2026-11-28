import { expect, test } from '@playwright/test';
import { teacherLogin, watchErrors } from './helpers';

test('GV: Việc hôm nay, thanh bên màu ẩn/hiện (Ctrl+\\), số việc, tìm nhanh Ctrl+K', async ({ page }) => {
  const w = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await teacherLogin(page, 'cothu');

  // Việc hôm nay: có bài viết cần chấm (dữ liệu mẫu), bấm tới hàng chấm bài
  const today = page.getByTestId('today-work');
  await expect(today).toContainText('Việc hôm nay');
  await expect(today.getByTestId('todo-review')).toContainText('bài viết chờ chấm');
  const side = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(side.getByRole('link', { name: 'Chấm bài', exact: true })).toContainText(/\d/);

  // Thanh bên phẳng như cũ: mục nào cũng thấy, có tiêu đề "Đánh giá", ô biểu tượng màu
  await expect(side.getByRole('link', { name: 'Bài giảng', exact: true })).toBeVisible();
  await expect(side.getByText('Đánh giá', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  // Ẩn thanh bên → còn dải biểu tượng; nhớ sau khi tải lại; rê chuột vào thì hiện đầy đủ; bấm để hiện lại
  const app = page.locator('.tc-app');
  await page.getByTestId('side-toggle').click();
  await expect(app).toHaveClass(/tc-app--rail/);
  await page.mouse.move(900, 400);
  await expect(side.getByRole('link', { name: 'Bài giảng', exact: true }).locator('span').last()).toBeHidden();
  await page.reload();
  await expect(page.locator('.tc-app')).toHaveClass(/tc-app--rail/);
  await page.getByTestId('side').hover();
  await expect(side.getByRole('link', { name: 'Bài giảng', exact: true }).locator('span').last()).toBeVisible();
  await page.getByTestId('side-toggle').click();
  await expect(page.locator('.tc-app')).not.toHaveClass(/tc-app--rail/);
  // Ctrl+\ cũng ẩn / hiện
  await page.mouse.move(900, 400);
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.tc-app')).toHaveClass(/tc-app--rail/);
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.tc-app')).not.toHaveClass(/tc-app--rail/);

  // Ctrl+K: tìm học sinh không dấu
  await page.keyboard.press('Control+k');
  const box = page.getByTestId('cmdk');
  await expect(box).toBeVisible();
  await page.getByTestId('cmdk-input').fill('ngoc lan');
  await expect(box.getByRole('option').first()).toContainText('Ngọc Lan');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hoc-sinh\//);
  await expect(box).toHaveCount(0);

  // Mở bằng nút, gõ trang
  await page.getByTestId('cmdk-open').click();
  await page.getByTestId('cmdk-input').fill('diem danh');
  await expect(page.getByRole('option', { name: /Điểm danh/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/diem-danh/);

  // Esc đóng
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('cmdk')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cmdk')).toHaveCount(0);
  w.expectClean();
});

test('GV điện thoại: ngăn kéo và ô tìm nhanh', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await teacherLogin(page, 'cothu');
  await page.getByRole('button', { name: 'Tìm nhanh', exact: true }).click();
  await page.getByTestId('cmdk-input').fill('phu huynh');
  await page.getByRole('option', { name: /^Phụ huynh/ }).first().click();
  await expect(page).toHaveURL(/\/phu-huynh/);
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Thảo luận', exact: true })).toBeVisible();
  await ctx.close();
});
