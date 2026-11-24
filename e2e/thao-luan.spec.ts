import { expect, test } from '@playwright/test';
import { learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

test('HS: vào phòng thảo luận, chọn tab, đăng bài (chờ cô duyệt), thả tim, bình luận, phòng nhỏ của tổ', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  await page.getByTestId('home-discuss').click();
  await page.getByTestId('dc-enter').first().click();
  await expect(page.getByRole('tab', { name: /Ý kiến/ })).toBeVisible();
  // Phòng nhỏ: Cả lớp + tổ của em (Tổ Mặt Trời), không thấy Tổ Cầu Vồng
  await expect(page.getByRole('tab', { name: /Tổ Mặt Trời/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Tổ Cầu Vồng/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /Cả lớp/ }).click();
  // Thả tim bài của bạn
  const friend = page.getByTestId('dc-card').filter({ hasText: 'tắt điện' });
  await friend.getByRole('button', { name: 'Thả tim' }).click();
  await expect(friend.getByRole('button', { name: 'Thả tim' })).toHaveAttribute('aria-pressed', 'true');
  // Đăng vào tab Câu hỏi
  await page.getByRole('tab', { name: /Câu hỏi/ }).click();
  await page.getByRole('button', { name: 'Em muốn hỏi:' }).click();
  await page.getByTestId('dc-body').fill('Em muốn hỏi: rác nhựa tái chế thành gì ạ?');
  await page.getByTestId('dc-send').click();
  await expect(page.getByTestId('dc-done')).toContainText('khi cô xem xong');
  const mine = page.getByTestId('dc-card').filter({ hasText: 'rác nhựa' });
  await expect(mine).toContainText('Đang chờ cô xem');
  // Bình luận dưới bài của bạn
  await page.getByRole('tab', { name: /Ý kiến/ }).click();
  await friend.getByTestId('dc-replies').click();
  await friend.getByTestId('dc-reply').click();
  await page.getByTestId('dc-body').fill('Em đồng ý với bạn vì tiết kiệm điện.');
  await page.getByTestId('dc-send').click();
  await expect(page.getByTestId('dc-done')).toBeVisible();
  // Phòng nhỏ của tổ
  await page.getByRole('tab', { name: /Tổ Mặt Trời/ }).click();
  await expect(page.getByTestId('dc-card').filter({ hasText: 'áp phích' })).toBeVisible();
  w.expectClean();
});

test('GV: duyệt bài chờ, ẩn bài có từ chưa phù hợp, tạo phòng chia theo tổ + tab, khóa phòng, xuất Excel', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/thao-luan');
  await expect(page.getByTestId('dc-pending-count')).toContainText('2 chờ duyệt');
  await page.getByTestId('dc-open').first().click();
  await expect(page.getByTestId('dc-pending')).toContainText('2');
  await page.getByTestId('dc-approve-all').click();
  await expect(page.getByTestId('dc-pending')).toContainText('1 bài chờ duyệt');
  const bad = page.getByTestId('dc-card').filter({ hasText: 'Từ chưa phù hợp' });
  await bad.getByRole('button', { name: 'Ẩn' }).click();
  await expect(page.getByTestId('dc-pending')).toHaveCount(0);
  // GV đăng bài (hiện ngay)
  await page.getByTestId('dc-body').fill('Cô khen cả lớp, các em tiếp tục nhé!');
  await page.getByTestId('dc-send').click();
  await expect(page.getByTestId('dc-card').filter({ hasText: 'Cô khen cả lớp' })).toBeVisible();
  // Khóa phòng
  await page.getByTestId('dc-lock').click();
  await expect(page.getByTestId('dc-open-15')).toBeVisible();
  // Xuất Excel
  const dl = page.waitForEvent('download');
  await page.getByTestId('dc-export').click();
  expect((await dl).suggestedFilename()).toMatch(/^thao-luan-4A-.*\.xlsx$/);
  // Tạo phòng mới: chia theo tổ, thêm tab
  await spaGo(page, '/thao-luan');
  await page.getByTestId('dc-new').click();
  await page.getByTestId('dc-title').fill('Kể về một cuốn sách em thích');
  await page.getByTestId('dc-rooms-teams').click();
  await page.getByTestId('dc-tab-add').click();
  await page.getByLabel('Tên tab 3').fill('Hình ảnh');
  await page.getByTestId('dc-save').click();
  await expect(page.getByRole('heading', { name: 'Kể về một cuốn sách em thích' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Phòng nhỏ' }).getByRole('tab')).not.toHaveCount(1);
  await expect(page.getByRole('tab', { name: /Hình ảnh/ })).toBeVisible();
  await page.getByRole('button', { name: 'Xem dạng cột' }).click();
  await expect(page.locator('.tc-dcol')).toHaveCount(3);
  w.expectClean();
});

test('TV: bảng ý tưởng chữ to, mã QR, ẩn tên, xem dạng cột', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/thao-luan/dc-c-4a/tv');
  await expect(page.getByTestId('dc-tv')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Quét để vào phòng thảo luận' })).toBeVisible();
  const cards = page.getByTestId('dc-card');
  await expect(cards.filter({ hasText: 'nhặt rác' })).toBeVisible();
  await expect(cards.filter({ hasText: 'Bạn ấy ngu' })).toHaveCount(0); // bài chờ duyệt không lên TV
  await page.getByTestId('tv-hide-names').check();
  await expect(cards.filter({ hasText: 'nhặt rác' })).toContainText('Một bạn');
  await page.getByLabel('Dạng cột').check();
  await expect(page.locator('.tc-dcol')).toHaveCount(3);
  w.expectClean();
});

test('HS trò chuyện nhóm theo tổ: thấy tin của cô, nhắn, trả lời nhanh; không thấy nhóm khác', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  await page.getByTestId('home-discuss').click();
  await page.locator('.ln-dhome__card').filter({ hasText: 'Trò chuyện nhóm' }).getByTestId('dc-enter').click();
  await expect(page.getByText('Nhóm Tổ Mặt Trời')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Tổ Cầu Vồng/ })).toHaveCount(0);
  await expect(page.getByTestId('chat-msg').filter({ hasText: 'mỗi bạn nói một ý' })).toBeVisible();
  await page.getByTestId('chat-input').fill('Tổ mình vẽ thùng rác phân loại nhé!');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-msg').filter({ hasText: 'thùng rác phân loại' })).toHaveClass(/is-mine/);
  await expect(page.getByTestId('chat-input')).toHaveValue('');
  await page.getByRole('button', { name: 'Mình làm phần này nhé!' }).click();
  await expect(page.getByTestId('chat-msg').filter({ hasText: 'Mình làm phần này nhé!' })).toBeVisible();
  await page.getByTestId('chat-input').fill('đồ ngu');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-msg').filter({ hasText: 'đồ ngu' })).toContainText('chờ cô xem');
  w.expectClean();
});

test('GV trò chuyện nhóm: xem mọi nhóm, nhắn vào nhóm, khóa rồi mở 15 phút, khen tin nhắn vào Thi đua', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/thao-luan');
  await page.getByTestId('dc-open').filter({ hasText: 'Trò chuyện nhóm' }).click();
  const panes = page.getByTestId('chat-pane');
  await expect(panes).toHaveCount(2);
  const first = panes.first();
  await first.getByRole('textbox').fill('Cô ghé nhóm mình nè!');
  await first.getByRole('button', { name: 'Gửi' }).click();
  await expect(first.locator('.tc-msg').filter({ hasText: 'Cô ghé nhóm' })).toBeVisible();
  // Khen tin nhắn của HS → Thi đua
  await first.getByTestId('dc-praise').first().click();
  await page.getByRole('menuitem', { name: /Hăng hái phát biểu/ }).click();
  await expect(first.getByText('+1 Hăng hái phát biểu')).toBeVisible();
  // Khóa → mở 15 phút
  await page.getByTestId('dc-lock').click();
  await page.getByTestId('dc-open-15').click();
  await expect(page.getByTestId('dc-lock')).toBeVisible();
  await expect(page.getByText(/đóng/).first()).toBeVisible();
  // Tạo phòng trò chuyện mới theo tổ: mặc định đang khóa
  await spaGo(page, '/thao-luan');
  await page.getByTestId('dc-new-chat').click();
  await page.getByTestId('dc-save').click();
  await expect(page.getByTestId('dc-open-15')).toBeVisible();
  w.expectClean();
});

test('Khen bài trên bảng vào Thi đua; chèn phòng thảo luận vào Trang học', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/thao-luan/dc-c-4a');
  const card = page.getByTestId('dc-card').filter({ hasText: 'tắt điện' });
  await card.getByTestId('dc-praise').click();
  await page.getByRole('menuitem', { name: /Giúp đỡ bạn/ }).click();
  await expect(card.getByText('+2 Giúp đỡ bạn')).toBeVisible();
  await spaGo(page, '/thi-dua/thong-ke');
  await expect(page.getByText(/Thảo luận: Em làm gì/).first()).toBeVisible();
  // Trang học: chèn phòng thảo luận vào nội dung trang
  await spaGo(page, '/trang-hoc');
  await page.getByRole('button', { name: /Thêm trang/ }).first().click();
  await page.getByTestId('pg-insert-discussion').selectOption({ label: 'Em làm gì để bảo vệ môi trường?' });
  await expect(page.getByTestId('pg-body')).toHaveValue(/\[\[thao-luan:dc-c-4a\|Em làm gì để bảo vệ môi trường\?\]\]/);
  w.expectClean();
});
