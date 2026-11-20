import { expect, test } from '@playwright/test';
import { LEARNER, learnerLogin, spaGo, watchErrors } from './helpers';

test('học sinh: chọn tên là vào được trang Hôm nay', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  await expect(page.getByText('Nhiệm vụ hôm nay')).toBeVisible();
  w.expectClean();
});

test('học sinh: các trang chính đều mở được, không lỗi', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  for (const [path, text] of [['/hoc', 'Bản đồ phiêu lưu'], ['/choi', /Leo tháp|Đấu/], ['/toi/tai-ve', /Tải về|Bài đã tải/], ['/cua-hang', /Cửa hàng/], ['/vuon-lop', /Vườn/]] as const) {
    await spaGo(page, path);
    await expect(page.getByText(text).first(), `trang ${path}`).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'trục trặc' })).toHaveCount(0);
  }
  w.expectClean();
});

test('học sinh: bấm nhiệm vụ đầu tiên là vào được bài', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  await page.locator('.ln-home__tasks .ln-task').first().click();
  await expect(page).toHaveURL(/\/(bai|goi|on-tap|bai-viet|choi)\//);
  await expect(page.getByRole('alert').filter({ hasText: 'trục trặc' })).toHaveCount(0);
  w.expectClean();
});

test('học sinh: mảnh mã không tải được → hiện màn hình "Tải lại", không trắng trang', async ({ page }) => {
  await learnerLogin(page);
  await page.route(/assets\/(Shop|Garden)[^/]*\.js/, (r) => r.abort());
  await spaGo(page, '/cua-hang');
  await expect(page.getByRole('alert')).toContainText(/Có bản mới rồi|cần có mạng/);
  await expect(page.getByRole('button', { name: 'Tải lại' })).toBeVisible();
  await page.unroute(/assets\/(Shop|Garden)[^/]*\.js/);
  await spaGo(page, '/hoc');
  await expect(page.getByText('Bản đồ phiêu lưu')).toBeVisible();
});

test('phụ huynh: trang liên kết mở được khi chưa đăng nhập', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto(`${LEARNER}/phu-huynh/lien-ket`);
  await expect(page.getByText(/mã liên kết|Mã liên kết/).first()).toBeVisible();
  w.expectClean();
});
