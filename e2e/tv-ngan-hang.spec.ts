import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PRESENT, spaGo, teacherLogin, watchErrors } from './helpers';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('Lớp trực tiếp: link TV kèm mã lớp, QR phóng to (máy GV + TV), TV nhập mã vào được', async ({ page, browser }) => {
  test.slow();
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  await page.getByLabel('Dạng', { exact: true }).selectOption('MCQ');
  const picks = page.locator('.tc-qbrow__pick');
  await picks.nth(0).check();
  await picks.nth(1).check();
  await page.getByTestId('qb-play').click();
  await page.getByTestId('game-mode-paper').click();
  await expect(page.getByTestId('game-print-cards')).toBeVisible();
  await page.getByTestId('game-mode-class').click();
  await page.getByTestId('game-go').click();
  await expect(page.getByTestId('game-control')).toBeVisible({ timeout: 15_000 });
  const pin = (await page.locator('.tc-live__pin strong').innerText()).replace(/\D/g, '');
  const sessionId = new URL(page.url()).pathname.split('/').pop()!;

  // "Mở trên TV" mang theo mã lớp (TV chưa đăng nhập vẫn xem được — SQL 21)
  const tvHref = await page.getByRole('link', { name: 'Mở trên TV' }).getAttribute('href');
  expect(tvHref).toContain(`s=${sessionId}`);
  expect(tvHref).toContain(`p=${pin}`);

  // QR vào lớp: thẻ QR to hơn + phóng to toàn màn hình, Esc để thu nhỏ
  await page.getByTestId('join-toggle').click();
  await expect(page.getByTestId('join-card')).toBeVisible();
  await page.getByTestId('join-zoom').click();
  const big = page.getByTestId('join-big');
  await expect(big).toBeVisible();
  await expect(big).toContainText(`${pin.slice(0, 3)} ${pin.slice(3)}`);
  const box = await big.locator('svg').boundingBox();
  expect(box!.width).toBeGreaterThan(400);
  await page.keyboard.press('Escape');
  await expect(big).toBeHidden();

  // TV: nhập mã 6 số → vào phòng chờ; bấm QR → phóng to
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`${PRESENT}/`);
  await expect(tv.getByText('Màn hình lớp')).toBeVisible();
  await tv.keyboard.type(pin); // đủ 6 số → tự vào lớp
  await expect(tv.locator('.pr-join__qr')).toBeVisible({ timeout: 15_000 });
  expect(new URL(tv.url()).searchParams.get('p')).toBe(pin);
  await tv.locator('.pr-join__qr').click();
  await expect(tv.getByTestId('tv-qr-big')).toBeVisible();
  await tv.getByTestId('tv-qr-big').click();
  await expect(tv.getByTestId('tv-qr-big')).toBeHidden();
  await tv.keyboard.press('q');
  await expect(tv.getByTestId('tv-qr-big')).toBeVisible();
  await tv.keyboard.press('Escape');

  // Trang Lớp học trực tiếp có lối vào "In thẻ giấy"
  await spaGo(page, '/truc-tiep');
  await page.getByTestId('live-print-cards').click();
  await expect(page.getByRole('heading', { name: 'In thẻ giấy' })).toBeVisible();
  w.expectClean();
});

test('Ngân hàng câu hỏi: nút Sửa / Xoá từng câu, xoá nhiều câu đã chọn', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  const rows = page.locator('.tc-qbrow');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();

  // Sửa: mở thẳng trình sửa
  await rows.first().getByTestId('qb-row-edit').click();
  await expect(page.getByRole('complementary', { name: 'Chi tiết hoạt động' })).toContainText('Sửa hoạt động');
  await page.getByRole('button', { name: 'Hủy' }).click();

  // Xoá một câu: hỏi lại rồi xoá
  const firstText = await rows.first().locator('.tc-listrow__main').innerText();
  await rows.first().getByTestId('qb-row-del').click();
  await rows.first().locator('.tc-qbrow__confirm').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(page.getByText('Đã xoá câu hỏi.')).toBeVisible();
  await expect(rows).toHaveCount(total - 1);
  await expect(page.locator('.tc-listrow__main').filter({ hasText: firstText })).toHaveCount(0);

  // Xoá nhiều câu
  await rows.nth(0).locator('.tc-qbrow__pick').check();
  await rows.nth(1).locator('.tc-qbrow__pick').check();
  await page.getByTestId('qb-del-picked').click();
  await page.getByTestId('qb-bar').getByRole('button', { name: 'Xoá 2 câu' }).last().click();
  await expect(page.getByText('Đã xoá 2 câu.')).toBeVisible();
  await expect(rows).toHaveCount(total - 3);
  w.expectClean();
});

test('Dán đề: tự nhận môn, lớp, kĩ năng ở đầu đề; tệp mẫu có danh mục kĩ năng', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  await page.getByTestId('qb-open').click();
  await page.getByRole('tab', { name: /Dán văn bản/ }).click();
  await page.getByTestId('qb-paste').fill([
    'ĐỐ VUI LỊCH SỬ VÀ ĐỊA LÍ – LỚP 5',
    'Mã kĩ năng: LSDL5.XDBV.LY-TRAN',
    'Câu 1: Năm 1010, vua Lý Thái Tổ dời kinh đô từ Hoa Lư ra địa điểm nào?',
    'A. Cổ Loa', 'B. Thành Đại La', 'C. Lam Sơn', 'D. Phú Xuân',
    'Đáp án: B',
    'Câu 2: Ai là người viết Chiếu dời đô?',
    'A. Lý Thái Tổ', 'B. Lê Lợi',
    'Đáp án: A',
    'Kĩ năng: Đấu tranh giành độc lập',
  ].join('\n'));
  await expect(page.getByTestId('qb-detected')).toContainText('môn Lịch sử và Địa lí, lớp 5, kĩ năng Triều Lý, triều Trần');
  await page.getByTestId('qb-parse').click();
  await expect(page.getByTestId('qb-review-notes')).toContainText('Nhận ra từ đề');
  await expect(page.getByLabel('Môn cho các câu đã chọn')).toHaveValue('lich-su-dia-li');
  await expect(page.getByLabel('Lớp cho các câu đã chọn')).toHaveValue('5');
  const r = page.getByTestId('qb-row');
  await expect(r.nth(0).getByLabel('Môn', { exact: true })).toHaveValue('lich-su-dia-li');
  await expect(r.nth(0).locator('.tc-qb-skills .tc-chip')).toHaveText(['Triều Lý, triều Trần×']);
  await expect(r.nth(1).locator('.tc-qb-skills .tc-chip')).toHaveText(['Đấu tranh giành độc lập×']);
  await page.getByRole('button', { name: 'Quay lại' }).click();

  // Tệp mẫu Excel kèm danh mục kĩ năng; tải riêng danh mục
  await page.getByRole('tab', { name: /Từ tệp Excel/ }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('qb-skills-xlsx').click();
  expect((await dl).suggestedFilename()).toBe('danh-muc-ki-nang.xlsx');
  w.expectClean();
});

test('Danh mục kĩ năng: xuất Excel, nhập lại (sửa chữ, thêm mới, báo dòng lỗi)', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  await page.getByTestId('qb-skills').click();
  await expect(page.getByRole('heading', { name: 'Danh mục kĩ năng' })).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByTestId('sk-export').click();
  expect((await dl).suggestedFilename()).toMatch(/^danh-muc-ki-nang-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.getByTestId('sk-import').click();
  await page.getByTestId('sk-import-file').setInputFiles(path.join(FIX, 'danh-muc-ki-nang-sua.xlsx'));
  const sum = page.getByTestId('sk-import-summary');
  await expect(sum).toContainText('Thêm mới: 1');
  await expect(sum).toContainText('Sửa chữ: 1');
  await expect(sum).toContainText('Lỗi: 1');
  await expect(page.getByRole('dialog')).toContainText('không học ở lớp 2');
  await page.getByTestId('sk-import-go').click();
  await expect(page.getByText(/Đã cập nhật danh mục kĩ năng: 2 thay đổi/)).toBeVisible();

  await page.getByLabel('Lớp', { exact: true }).selectOption('4');
  await page.getByTestId('sk-subject').selectOption('khoa-hoc');
  await expect(page.getByTestId('sk-row').filter({ hasText: 'KH4.NL.ANH-SANG' })).toContainText('Ánh sáng quanh em');
  await expect(page.getByTestId('sk-row').filter({ hasText: 'KH4.GV.TIET-KIEM-DIEN' })).toContainText('Thầy/cô thêm');
  w.expectClean();
});
