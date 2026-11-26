import { expect, test } from '@playwright/test';
import { learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

test('GV: cài đặt Đấu trường, mở giải loại trực tiếp, đóng vòng đến khi có vô địch, in giấy khen, kết thúc mùa', async ({ page }) => {
  test.slow();
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await page.getByRole('link', { name: 'Đấu trường' }).click();
  await expect(page.getByRole('heading', { name: 'Đấu trường' })).toBeVisible();

  // Cài đặt: giờ mở cửa + phạm vi khối
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  const set = page.getByTestId('arena-settings');
  await set.getByRole('group', { name: 'Phạm vi ghép đấu' }).getByRole('button', { name: /^Cả khối \d$/ }).click();
  await set.getByTestId('arena-hour-add').click();
  await expect(set.getByTestId('arena-hour')).toHaveCount(1);
  await set.getByTestId('arena-save').click();
  await expect(set.getByText('Đã lưu.')).toBeVisible();
  await expect(set.getByRole('status').first()).toContainText('T2–T6 19:00–21:00');

  // Mở giải: 3 câu mỗi trận
  await page.getByRole('button', { name: 'Giải đấu', exact: true }).click();
  await page.getByTestId('cup-new').click();
  const dlg = page.getByRole('dialog', { name: 'Mở giải đấu loại trực tiếp' });
  await dlg.getByTestId('cup-title').fill('Giải Toán tuần 12');
  await dlg.getByRole('button', { name: '3 câu', exact: true }).click();
  await dlg.getByTestId('cup-create').click();
  await expect(page.getByRole('heading', { name: 'Giải Toán tuần 12' })).toBeVisible();
  await expect(page.getByTestId('cup-bracket')).toBeVisible();
  await expect(page.getByTestId('cup-status')).toContainText('Đang đấu');

  // Đóng vòng cho đến hết (bản demo mô phỏng kết quả các bạn)
  for (let i = 0; i < 8; i++) {
    if (await page.getByTestId('cup-podium').isVisible()) break;
    await page.getByTestId('cup-close').click();
    await page.getByRole('button', { name: 'Kết thúc vòng', exact: true }).click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('cup-podium')).toContainText('Vô địch');
  await expect(page.getByTestId('cup-status')).toHaveText('Đã kết thúc');

  // Giấy khen
  await page.getByTestId('cup-print').click();
  await expect(page.getByTestId('cert').first()).toContainText('GIẤY KHEN');
  await expect(page.getByTestId('cert').first()).toContainText('VÔ ĐỊCH');
  expect(await page.getByTestId('cert').count()).toBeGreaterThanOrEqual(2);

  // Bảng xếp hạng: kết thúc mùa
  await spaGo(page, '/dau-truong?the=xep-hang');
  const board = page.getByTestId('arena-board');
  await expect(board.locator('tbody tr').first()).toBeVisible();
  await board.getByTestId('season-end').click();
  await board.getByTestId('season-title').fill('Mùa thử');
  await board.getByRole('button', { name: 'Kết thúc mùa', exact: true }).click();
  await expect(board.getByText(/Đã kết thúc "Mùa thử"/)).toBeVisible();
  await expect(board.getByText('Các mùa đã kết thúc')).toBeVisible();
  w.expectClean();
});

test('GV: Ngân hàng câu hỏi → Đưa vào Đấu trường', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  await page.getByLabel('Dạng', { exact: true }).selectOption('MCQ');
  const picks = page.locator('.tc-qbrow__pick');
  for (let i = 0; i < 3; i++) await picks.nth(i).check();
  await page.getByTestId('qb-arena').click();
  await page.getByTestId('pool-add').click();
  await expect(page.getByText(/Đã đưa 3 câu vào Đấu trường lớp/)).toBeVisible();
  w.expectClean();
});

test('HS: thấy giải đấu, vào trận, đấu xong thấy kết quả; bảng xếp hạng top 10', async ({ page }) => {
  test.slow();
  const w = watchErrors(page);
  await page.clock.install();
  await learnerLogin(page);
  await spaGo(page, '/choi');
  const strip = page.getByTestId('cup-strip');
  await expect(strip).toContainText('Giải thử sức (bản demo)');
  await strip.getByTestId('cup-card').first().click();
  await expect(page.getByTestId('cup-me')).toBeVisible();
  await page.getByTestId('cup-go').click();
  await page.getByTestId('cup-play-start').click();
  await expect(page.getByTestId('cup-play')).toBeVisible();
  // Để hết giờ từng câu (20 giây / câu)
  for (let i = 0; i < 12 && await page.getByTestId('cup-play').isVisible(); i++) {
    await page.clock.fastForward(21_000);
    await page.clock.fastForward(1_500);
  }
  await expect(page.getByTestId('cup-me')).toContainText(/Em vào|Em dừng|Vô địch|Á quân|Hạng ba/);
  await page.getByRole('button', { name: 'Về Đấu trường' }).click();
  await expect(page.getByTestId('arena-board')).toBeVisible();
  w.expectClean();
});
