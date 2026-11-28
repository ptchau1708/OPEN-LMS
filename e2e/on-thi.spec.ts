import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { LEARNER, learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

/** Ôn thi (docs/ON_THI.md): HS lớp 5A làm bài kiểu Trạng Nguyên, kiểu VioEdu, luyện theo dạng; GV tạo bài, xem kết quả. */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOT_DIR) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: process.env.SHOT_FULL === '1' });
};

test.describe('Ôn thi — học sinh', () => {
  test('kiểu Trạng Nguyên: quy định, gõ thử, làm bài bằng bảng câu, nộp, xem lại', async ({ page }) => {
    const w = watchErrors(page);
    await learnerLogin(page, 'Minh Khang');
    await page.getByTestId('home-onthi').click();
    await expect(page.getByRole('heading', { name: 'Ôn thi' })).toBeVisible();
    await expect(page.getByTestId('onthi-hub-tn')).toContainText('2 bài luyện');
    await shot(page, 'hs-on-thi-cong');
    await page.getByTestId('onthi-hub-tn').click();
    const sets = page.getByTestId('onthi-set');
    await expect(sets).toHaveCount(2);
    await expect(sets.nth(1)).toContainText('Đạt bài “Tiếng Việt 5 – Bài luyện 1” để mở');
    await expect(sets.nth(1).getByRole('button', { name: 'Bắt đầu' })).toBeDisabled();
    await expect(page.getByTestId('onthi-type-MATCHING')).toBeVisible();
    await shot(page, 'hs-on-thi-tn-danh-sach');

    await sets.first().getByRole('button', { name: 'Bắt đầu' }).click();
    await expect(page.getByText('Gõ thử chữ có dấu')).toBeVisible();
    await page.locator('#ot-typing').fill('Trạng nguyên');
    await expect(page.getByText('Bộ gõ tiếng Việt của em đã đúng.')).toBeVisible();
    await shot(page, 'hs-on-thi-tn-quy-dinh');
    await page.getByTestId('onthi-start').click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByLabel('Bảng câu hỏi')).toBeVisible();

    // Câu 1 (chọn 1 đáp án): chọn "chăm chỉ".
    await page.getByRole('radio', { name: 'chăm chỉ' }).click();
    await expect(page.getByLabel('Câu 1, đã làm')).toBeVisible();
    await shot(page, 'hs-on-thi-tn-phong-thi');
    // Nhảy sang câu 4 bằng bảng câu (điền l hoặc n).
    await page.getByLabel('Câu 4, chưa làm').click();
    await page.getByRole('textbox').first().fill('l');
    await expect(page.getByLabel('Câu 4, đã làm')).toBeVisible();
    await page.getByTestId('onthi-submit-open').click();
    await expect(page.getByRole('dialog', { name: 'Nộp bài' })).toContainText('Còn 6 câu chưa làm');
    await page.getByTestId('onthi-submit').click();

    await expect(page.getByTestId('onthi-score')).toContainText('20');
    await expect(page.getByText('Chưa đạt', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Xem lại bài' })).toBeVisible();
    await shot(page, 'hs-on-thi-tn-ket-qua');
    // Xem lại một câu bỏ qua: có đáp án đúng và giải thích.
    await page.locator('.ln-ot-review__head').first().click();
    await expect(page.locator('.ln-ot-review__expl').first()).toBeVisible();
    w.expectClean();
  });

  test('kiểu VioEdu: từng câu, Bỏ qua quay lại cuối bài, thanh nhịp, Đúng – Sai nhiều ý', async ({ page }) => {
    const w = watchErrors(page);
    await learnerLogin(page, 'Minh Khang');
    await spaGo(page, '/on-thi/vioedu');
    const first = page.getByTestId('onthi-set').first();
    await expect(first).toContainText('Toán 5 – Đấu trường 1');
    await first.getByRole('button', { name: 'Bắt đầu' }).click();
    await expect(page.getByText('Mỗi lần một câu')).toBeVisible();
    await page.getByTestId('onthi-start').click();
    await expect(page.getByRole('img', { name: /nhịp/ })).toBeVisible();
    await expect(page.getByTestId('onthi-next')).toBeDisabled();
    // Câu 1: 3,75 + 2,5 → 6,25
    await page.getByRole('radio', { name: '6,25' }).click();
    await page.getByTestId('onthi-next').click();
    await expect(page.locator('.ln-ex-q__no')).toContainText('Câu 2');
    await shot(page, 'hs-on-thi-vio-phong-thi');
    // Bỏ qua các câu còn lại tới câu Đúng – Sai nhiều ý (câu 14).
    for (let i = 2; i < 14; i++) await page.getByTestId('onthi-skip').click();
    await expect(page.locator('.ln-ot-qtype')).toHaveText('Đúng – Sai nhiều ý');
    const rows = page.locator('.ae-tfm__row');
    await expect(rows).toHaveCount(4);
    for (const [i, v] of [[0, 'Đúng'], [1, 'Sai'], [2, 'Đúng'], [3, 'Sai']] as const) await rows.nth(i).getByRole('button', { name: v }).click();
    await shot(page, 'hs-on-thi-vio-dung-sai');
    await page.getByTestId('onthi-next').click();
    await page.getByTestId('onthi-skip').click(); // câu 15
    // Hết lượt đầu → quay lại câu 2 đã bỏ qua.
    await expect(page.getByText('Em quay lại các câu đã bỏ qua nhé.')).toBeVisible();
    await expect(page.locator('.ln-ex-q__no')).toContainText('Câu 2');
    await page.getByTestId('onthi-submit-open').click();
    await page.getByTestId('onthi-submit').click();
    await expect(page.getByTestId('onthi-score')).toContainText('2');
    await expect(page.getByText('Bỏ qua 13')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bảng xếp hạng' })).toBeVisible();
    await shot(page, 'hs-on-thi-vio-ket-qua');
    w.expectClean();
  });

  test('luyện theo dạng: kiểm tra từng câu, biết đúng sai ngay', async ({ page }) => {
    const w = watchErrors(page);
    await learnerLogin(page, 'Minh Khang');
    await spaGo(page, '/on-thi/vioedu');
    await page.getByTestId('onthi-type-TRUE_FALSE_MULTI').click();
    await expect(page.getByRole('heading', { name: 'Luyện: Đúng – Sai nhiều ý' })).toBeVisible();
    const rows = page.locator('.ae-tfm__row');
    await expect(rows).toHaveCount(4);
    await expect(page.getByTestId('onthi-practice-check')).toBeDisabled();
    for (let i = 0; i < 4; i++) await rows.nth(i).getByRole('button', { name: 'Đúng' }).click();
    await page.getByTestId('onthi-practice-check').click();
    await expect(page.locator('.ln-ot-feedback')).toBeVisible();
    await shot(page, 'hs-on-thi-luyen-dang');
    await page.getByTestId('onthi-practice-next').click();
    await page.locator('.ae-tfm__row').nth(0).getByRole('button', { name: 'Sai' }).waitFor();
    w.expectClean();
  });

  test('điện thoại: cổng và danh sách vừa màn hình 390 px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await learnerLogin(page, 'Minh Khang');
    await spaGo(page, '/on-thi/trang-nguyen');
    await expect(page.getByTestId('onthi-set').first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
    await shot(page, 'hs-on-thi-dien-thoai');
    await ctx.close();
  });
});

test.describe('Ôn thi — trang Chơi', () => {
  test('lối vào từ trang Chơi', async ({ page }) => {
    await learnerLogin(page, 'Minh Khang');
    await spaGo(page, '/choi');
    await page.getByTestId('play-onthi').click();
    await expect(page).toHaveURL(`${LEARNER}/on-thi`);
  });
});

test.describe('Ôn thi — giáo viên', () => {
  test('tải tệp Word mẫu, tạo bài luyện từ tệp, bài mới vào danh sách khối', async ({ page }) => {
    const w = watchErrors(page);
    await teacherLogin(page, 'thayquang');
    await page.getByRole('link', { name: 'Ôn thi', exact: true }).click();
    await expect(page.getByTestId('ot-sets')).toContainText('Tiếng Việt 5 – Bài luyện 1');
    await shot(page, 'gv-on-thi-danh-sach');
    const dl = page.waitForEvent('download');
    await page.getByTestId('ot-template').click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe('mau-on-thi-trang-nguyen.docx');
    const bytes = readFileSync((await download.path())!);
    await page.getByTestId('ot-import-open').click();
    await page.getByTestId('ot-file').setInputFiles({ name: 'Bai luyen tu Word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes });
    await expect(page.getByTestId('ot-qlist').locator('li')).toHaveCount(9);
    await expect(page.getByTestId('ot-create')).toContainText('9 câu');
    await expect(page.getByTestId('ot-pass')).toHaveValue('72');
    await page.getByTestId('ot-title').fill('Bài luyện từ Word');
    await shot(page, 'gv-on-thi-tao-tu-word');
    await page.getByTestId('ot-create').click();
    await expect(page.getByRole('heading', { name: 'Bài luyện từ Word' })).toBeVisible();
    await expect(page.getByTestId('ot-results')).toContainText('Minh Khang');
    w.expectClean();

    // Bài mới đứng cuối danh sách khối 5 (học sinh thấy ở mục Ôn thi — app HS dùng dữ liệu demo riêng nên không kiểm ở đây).
    await page.getByRole('button', { name: 'Danh sách' }).click();
    await expect(page.getByTestId('ot-sets').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('ot-sets').locator('tbody tr').nth(2)).toContainText('Bài luyện từ Word');
  });

  test('kết quả cả khối, tỉ lệ đúng theo câu, sửa mức đạt', async ({ page }) => {
    const w = watchErrors(page);
    await teacherLogin(page, 'thayquang');
    await page.getByRole('link', { name: 'Ôn thi', exact: true }).click();
    await page.getByTestId('ot-sets').getByRole('row', { name: /Tiếng Việt 5 – Bài luyện 1/ }).getByRole('button', { name: 'Kết quả' }).click();
    await expect(page.getByTestId('ot-results').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('ot-results').locator('tbody tr').first()).toContainText('Bảo Ngân');
    await expect(page.getByTestId('ot-items').locator('tbody tr')).toHaveCount(8);
    await shot(page, 'gv-on-thi-ket-qua');
    await page.getByTestId('ot-edit').click();
    await page.getByTestId('ot-edit-pass').fill('50');
    await page.getByTestId('ot-save').click();
    await expect(page.getByText(/mức đạt 50\/80/)).toBeVisible();
    w.expectClean();
  });
});
