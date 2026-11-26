import { expect, test } from '@playwright/test';
import { LEARNER, learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

test('GV: trang Phụ huynh — gửi thông báo, đã gửi, phụ huynh thấy gì, tin nhắn, chuông', async ({ page }) => {
  test.slow();
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await page.getByRole('link', { name: 'Phụ huynh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Phụ huynh', exact: true })).toBeVisible();

  // Gửi thông báo cả lớp, cần xác nhận
  const box = page.getByTestId('ph-compose');
  await box.getByRole('button', { name: 'Họp phụ huynh' }).click();
  await expect(box.getByTestId('ph-title')).toHaveValue('Mời họp phụ huynh');
  await expect(box.getByTestId('ph-ack')).toBeChecked();
  await box.getByTestId('ph-send').click();
  await expect(box.getByRole('status')).toContainText('Đã gửi “Mời họp phụ huynh”');
  await box.getByRole('button', { name: 'Xem đã gửi' }).click();
  const card = page.getByTestId('ph-sent-card').first();
  await expect(card).toContainText('Mời họp phụ huynh');
  await expect(card).toContainText(/Đã xác nhận \d+\/\d+/);
  await card.click();
  const dlg = page.getByRole('dialog', { name: 'Mời họp phụ huynh' });
  await expect(dlg.getByRole('columnheader', { name: 'Xác nhận' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Đóng' }).last().click();

  // Gửi riêng một em
  await page.getByRole('group', { name: 'Mục' }).getByRole('button', { name: 'Gửi phụ huynh' }).click();
  await box.getByRole('group', { name: 'Gửi tới' }).getByRole('button', { name: 'Chọn học sinh' }).click();
  await box.getByRole('button', { name: /^Ngọc Lan/ }).click();
  await box.getByTestId('ph-title').fill('Lan tiến bộ môn Toán');
  await box.getByTestId('ph-send').click();
  await expect(box.getByRole('status')).toContainText('Lan tiến bộ môn Toán');

  // Phụ huynh thấy gì: tắt Kết quả tự học, xem như phụ huynh
  await page.getByRole('group', { name: 'Mục' }).getByRole('button', { name: 'Phụ huynh thấy gì' }).click();
  const vis = page.getByTestId('ph-visibility');
  await expect(vis.getByRole('group', { name: 'Nhắc nhở nề nếp' }).getByRole('button', { name: 'Cô duyệt rồi mới gửi' })).toHaveAttribute('aria-pressed', 'true');
  await vis.getByRole('group', { name: 'Kết quả tự học' }).getByRole('button', { name: 'Không gửi' }).click();
  await vis.getByTestId('ph-vis-save').click();
  await expect(vis.getByText('Đã lưu.')).toBeVisible();
  await page.getByTestId('ph-preview-student').selectOption({ label: 'Ngọc Lan' });
  await expect(page.getByTestId('ph-preview')).toContainText('Kết quả tự học');
  await expect(page.getByTestId('ph-preview').locator('li.is-off')).toContainText('Kết quả tự học');

  // Tin nhắn: phụ huynh Ngọc Lan đã nhắn (dữ liệu mẫu) → cô trả lời
  await page.getByRole('group', { name: 'Mục' }).getByRole('button', { name: /Tin nhắn/ }).click();
  await page.getByTestId('ph-thread').filter({ hasText: 'Ngọc Lan' }).click();
  const chat = page.getByTestId('ph-chat');
  await expect(chat).toContainText('khám răng');
  await chat.getByTestId('ph-chat-input').fill('Cô đã nhận, cảm ơn anh.');
  await chat.getByTestId('ph-chat-send').click();
  await expect(chat).toContainText('Cô đã nhận, cảm ơn anh.');

  // Chờ duyệt mở được
  await page.getByRole('group', { name: 'Mục' }).getByRole('button', { name: /Chờ duyệt/ }).click();
  await expect(page.getByTestId('ph-queue').or(page.getByText('Không có mục nào chờ duyệt'))).toBeVisible();

  // Liên kết tài khoản vẫn ở đây
  await page.getByRole('group', { name: 'Mục' }).getByRole('button', { name: 'Liên kết tài khoản' }).click();
  await expect(page.getByRole('button', { name: 'Tạo mã mới cho cả lớp' })).toBeVisible();

  // Chuông: có tin mẫu, bấm → mở đúng trang
  await page.getByTestId('notify-bell').click();
  const panel = page.getByTestId('notify-panel');
  await expect(panel).toContainText('bài mới cần chấm');
  await panel.getByRole('button', { name: /bài mới cần chấm/ }).click();
  await expect(page).toHaveURL(/\/cham-bai/);

  // Cài đặt thông báo + gửi thử
  await spaGo(page, '/thong-bao');
  await expect(page.getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible();
  await expect(page.getByTestId('push-card')).toContainText('Bản demo không gửi thông báo đẩy');
  await page.getByTestId('notify-test').click();
  await page.getByTestId('notify-bell').click();
  await expect(page.getByTestId('notify-panel')).toContainText('Thông báo thử của OPEN-EDU');
  w.expectClean();
});

test('PH: thông báo của cô, xác nhận, nhắn tin với cô, trang thông báo', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto(`${LEARNER}/dang-nhap`);
  await page.getByRole('button', { name: 'Đăng nhập bằng tên' }).click();
  await page.locator('input.ln-input').first().fill('phuhuynh4a');
  await page.locator('input[type=password]').fill('123456');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/phu-huynh');
  const inbox = page.getByTestId('pp-inbox');
  await expect(inbox).toContainText('Thông báo của cô');
  await inbox.getByTestId('pp-post').filter({ hasText: 'Họp phụ huynh cuối học kì I' }).click();
  await inbox.getByTestId('pp-ack').click();
  await expect(inbox).toContainText('Đã xác nhận');

  await inbox.getByTestId('pp-chat-link').click();
  await page.waitForURL('**/phu-huynh/nhan-tin**');
  const chat = page.getByTestId('pp-chat');
  await expect(chat).toContainText('khám răng');
  await chat.getByTestId('pp-chat-input').fill('Dạ, gia đình sẽ dự họp ạ.');
  await chat.getByTestId('pp-chat-send').click();
  await expect(chat).toContainText('Dạ, gia đình sẽ dự họp ạ.');

  await spaGo(page, '/phu-huynh');
  await page.getByTestId('ln-bell').click();
  await page.waitForURL('**/thong-bao');
  await expect(page.getByTestId('ln-ntf-list')).toContainText('Bản tin tuần');
  await expect(page.getByTestId('ln-push')).toContainText('Bản demo không gửi thông báo');
  w.expectClean();
});

test('HS: chuông trên trang Nhà → trang Thông báo', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  const bell = page.getByTestId('ln-bell');
  await expect(bell).toHaveAccessibleName(/Thông báo: \d+ tin mới/);
  await bell.click();
  await page.waitForURL('**/thong-bao');
  await expect(page.getByTestId('ln-ntf-list')).toContainText('Bài mới: Ôn tập cuối tuần');
  await page.getByRole('button', { name: 'Đã đọc hết' }).click();
  await expect(page.locator('.ln-ntf__item.is-new')).toHaveCount(0);
  w.expectClean();
});
