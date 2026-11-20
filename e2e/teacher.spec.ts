import { expect, test } from '@playwright/test';
import { PRESENT, spaGo, teacherLogin, watchErrors } from './helpers';

test('giáo viên: Tổng quan có ô chỉ số và biểu đồ của lớp', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await expect(page.getByRole('heading', { name: 'Lớp 4A' })).toBeVisible();
  await expect(page.locator('.db-tile')).toHaveCount(6);
  await expect(page.locator('.db-col')).toHaveCount(14);
  await page.locator('.db-col').nth(12).hover();
  await expect(page.locator('.db-readout')).toContainText(/đúng/);
  await expect(page.getByRole('heading', { name: 'Mức thành thạo kiến thức' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Học sinh cần chú ý' })).toBeVisible();
  w.expectClean();
});

test('giáo viên: mọi trang trong menu đều mở được, không lỗi', async ({ page }) => {
  test.slow();
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  const paths = ['/bai-giang', '/ngan-hang', '/giao-bai', '/lop', '/kien-thuc', '/truc-tiep', '/bai-viet', '/cham-bai', '/de-kiem-tra', '/rubric', '/tt27', '/thi-dua', '/vuon-lop', '/diem-danh', '/bao-cao', '/phu-huynh'];
  for (const p of paths) {
    await spaGo(page, p);
    await expect(page.locator('.tc-page').first(), `trang ${p}`).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'vừa gặp lỗi' }), `trang ${p}`).toHaveCount(0);
  }
  w.expectClean();
});

test('giáo viên thường không vào được trang quản trị', async ({ page }) => {
  await teacherLogin(page, 'cothu');
  await expect(page.getByRole('link', { name: 'Quản lí lớp' })).toHaveCount(0);
  await spaGo(page, '/quan-tri/tai-khoan');
  await expect(page).not.toHaveURL(/quan-tri/);
});

test('quản trị: thêm học sinh vào lớp → hiện phiếu tài khoản, lớp có thêm học sinh', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'admin');
  await expect(page.getByRole('link', { name: 'Quản lí lớp' })).toBeVisible();
  await spaGo(page, '/lop');
  const head = page.locator('.tc-classes .tc-card__head h2').first();
  const before = Number((await head.innerText()).match(/(\d+) học sinh/)?.[1]);
  await page.getByRole('button', { name: 'Thêm học sinh' }).click();
  await page.locator('textarea').fill('Nguyễn Minh Khôi\nTrần Bảo Ngọc');
  await page.getByRole('button', { name: /Tạo 2 tài khoản/ }).click();
  await expect(page.getByText('Mật khẩu chỉ hiện một lần')).toBeVisible();
  await expect(page.getByText('Nguyễn Minh Khôi')).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(head).toContainText(`${before + 2} học sinh`);
  w.expectClean();
});

test('nút dạng liên kết luôn đọc được chữ (không trùng màu nền)', async ({ page }) => {
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/lop');
  const bad = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a.tc-btn')].filter((a) => { const s = getComputedStyle(a); return s.color === s.backgroundColor; }).map((a) => a.innerText));
  expect(bad).toEqual([]);
});

test('màn hình lớp (TV) mở được', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto(`${PRESENT}/`);
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.getByRole('alert').filter({ hasText: 'trục trặc' })).toHaveCount(0);
  w.expectClean();
});

test('hồ sơ học sinh: danh sách có tìm kiếm + nhóm phân hóa; hồ sơ có ô chỉ số và biểu đồ 8 tuần', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await page.getByRole('link', { name: 'Hồ sơ học sinh' }).click();
  await expect(page.locator('.st-card')).toHaveCount(8);
  await page.getByRole('searchbox', { name: 'Tìm học sinh' }).fill('hoai nam');
  await expect(page.locator('.st-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Tìm học sinh' }).fill('');
  await page.getByRole('button', { name: /Cần hỗ trợ/ }).click();
  const n = await page.locator('.st-card').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(8);
  await page.locator('.st-card').first().click();
  await expect(page.locator('.pf-dash .db-tile')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Tiến bộ 8 tuần' })).toBeVisible();
  await expect(page.locator('.pf-weeks .db-col')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Nên làm gì tiếp' })).toBeVisible();
  w.expectClean();
});
