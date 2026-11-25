import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Danh mục kĩ năng mở: thêm, sửa kĩ năng gốc, khôi phục, ẩn, xoá — bản đồ kiến thức dùng ngay', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ki-nang');
  await page.getByLabel('Lớp', { exact: true }).selectOption('4');
  await page.getByTestId('sk-subject').selectOption('khoa-hoc');
  await expect(page.getByTestId('sk-row').filter({ hasText: 'Ánh sáng và bóng tối' })).toBeVisible();

  // Thêm kĩ năng mới
  await page.getByTestId('sk-add').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Chủ đề / mạch nội dung').fill('Chất');
  await dlg.getByRole('textbox', { name: 'Tên ngắn' }).fill('Tiết kiệm nước');
  await dlg.getByRole('textbox', { name: 'Mô tả' }).fill('Nêu được cách tiết kiệm nước ở gia đình và nhà trường');
  await expect(dlg.getByText('KH4.GV.TIET-KIEM-NUOC')).toBeVisible();
  await dlg.getByTestId('sk-save').click();
  const mine = page.getByTestId('sk-row').filter({ hasText: 'Tiết kiệm nước' });
  await expect(mine).toContainText('Thầy cô thêm');

  // Sửa chữ kĩ năng gốc → "Đã sửa", khôi phục được
  const light = page.getByTestId('sk-row').filter({ hasText: 'KH4.NL.ANH-SANG' });
  await light.getByRole('button', { name: /^Sửa/ }).click();
  await dlg.getByRole('textbox', { name: 'Tên ngắn' }).fill('Ánh sáng quanh em');
  await dlg.getByTestId('sk-save').click();
  await expect(light).toContainText('Ánh sáng quanh em');
  await expect(light).toContainText('Đã sửa');
  await light.getByTestId('sk-restore').click();
  await expect(light).toContainText('Ánh sáng và bóng tối');
  await expect(light).not.toContainText('Đã sửa');

  // Ẩn kĩ năng gốc → biến mất (hiện lại khi tích "Hiện kĩ năng đã ẩn")
  const heat = page.getByTestId('sk-row').filter({ hasText: 'KH4.NL.NHIET' });
  await heat.getByTestId('sk-hide').click();
  await expect(heat).toHaveCount(0);
  await page.getByText('Hiện kĩ năng đã ẩn').click();
  await expect(heat).toContainText('Đã ẩn');

  // Bản đồ kiến thức lớp 4A, môn Khoa học: có kĩ năng tự thêm, không có kĩ năng đã ẩn
  await spaGo(page, '/lop/c-4a/ban-do-kien-thuc');
  await page.getByRole('group', { name: 'Môn', exact: true }).getByRole('button', { name: 'Khoa học' }).click();
  await page.getByText('Ẩn kĩ năng chưa em nào làm').click();
  await expect(page.locator('.tc-hm').getByText('Tiết kiệm nước').first()).toBeVisible();
  await expect(page.locator('.tc-hm').getByText('Nhiệt và vật dẫn nhiệt')).toHaveCount(0);

  // Xoá kĩ năng tự thêm (chưa có dữ liệu → xoá hẳn)
  await spaGo(page, '/ki-nang');
  await page.getByLabel('Lớp', { exact: true }).selectOption('4');
  await page.getByTestId('sk-subject').selectOption('khoa-hoc');
  await mine.getByTestId('sk-delete').click();
  await mine.getByRole('button', { name: 'Xóa' }).click();
  await expect(page.getByRole('status')).toContainText('Đã xoá “Tiết kiệm nước”');
  await expect(mine).toHaveCount(0);
  w.expectClean();
});

test('Giao bài: sửa tên, hạn nộp; xoá bài đã giao', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/giao-bai');
  const card = page.locator('.tc-assigncard').first();
  await expect(card).toBeVisible();
  const before = await page.locator('.tc-assigncard').count();
  await card.getByTestId('assign-edit').click();
  const dlg = page.getByRole('dialog', { name: 'Sửa bài đã giao' });
  await dlg.getByLabel('Tên hiển thị cho HS').fill('Bài đã sửa tên');
  await dlg.getByLabel('Hạn nộp', { exact: true }).fill('2030-01-15T20:00');
  await dlg.getByTestId('assign-edit-save').click();
  await expect(page.getByText('Đã sửa “Bài đã sửa tên”.')).toBeVisible();
  const edited = page.locator('.tc-assigncard').filter({ hasText: 'Bài đã sửa tên' });
  await expect(edited).toContainText('Hạn 20:00 · 15-01');
  await edited.getByTestId('assign-delete').click();
  await edited.getByRole('button', { name: 'Xóa' }).click();
  await expect(page.locator('.tc-assigncard')).toHaveCount(before - 1);
  await expect(page.locator('.tc-assigncard').filter({ hasText: 'Bài đã sửa tên' })).toHaveCount(0);
  w.expectClean();
});

test('Xoá hành vi thi đua, xoá đề kiểm tra, thu hồi huy hiệu, nhân bản bài giảng của người khác', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');

  // Hành vi thi đua
  await spaGo(page, '/thi-dua');
  await page.getByRole('button', { name: 'Sửa danh sách hành vi' }).click();
  const dlg = page.getByRole('dialog');
  const pos = dlg.getByTestId('bh-group-pos');
  const n = await pos.locator('li').count();
  const label = await pos.locator('li').first().getByLabel('Tên hành vi').inputValue();
  await pos.locator('li').first().getByTestId('bh-delete').click();
  await expect(dlg.getByText('1 hành vi sẽ bị xoá')).toBeVisible();
  await dlg.getByRole('button', { name: 'Lưu' }).click();
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa danh sách hành vi' }).click();
  await expect(page.getByRole('dialog').getByTestId('bh-group-pos').locator('li')).toHaveCount(n - 1);
  await expect(page.getByRole('dialog').getByTestId('bh-group-pos').getByLabel('Tên hành vi').first()).not.toHaveValue(label);
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy' }).click();

  // Đề kiểm tra
  await spaGo(page, '/de-kiem-tra');
  const exams = page.getByTestId('exam-delete');
  await expect(exams.first()).toBeVisible();
  const ne = await exams.count();
  expect(ne).toBeGreaterThan(0);
  await exams.first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xóa' }).click();
  await expect(page.getByTestId('exam-delete')).toHaveCount(ne - 1);

  // Huy hiệu của cô: tặng rồi thu hồi
  await spaGo(page, '/vuon-lop');
  await page.getByLabel('Tên huy hiệu (tối đa 40 kí tự)').fill('Tặng nhầm');
  await page.locator('.tc-tbadge__st').first().click();
  await page.getByRole('button', { name: 'Tặng huy hiệu' }).click();
  const given = page.locator('.tc-tbadge__list li').filter({ hasText: 'Tặng nhầm' });
  await expect(given).toHaveCount(1);
  await given.getByTestId('tbadge-revoke').click();
  await given.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(page.locator('.tc-tbadge__list li').filter({ hasText: 'Tặng nhầm' })).toHaveCount(0);

  // Bài giảng của thầy cô khác: chỉ xem; nhân bản thành bài của mình
  await spaGo(page, '/bai-giang');
  await page.getByText('Chỉ bài của tôi').click();
  const other = page.locator('.br-cardwrap').filter({ hasText: 'Con vật sống ở đâu?' }).first();
  await other.locator('.tc-lessoncard').click();
  await expect(page.getByTestId('lesson-readonly')).toBeVisible();
  await page.getByTestId('lesson-duplicate').click();
  await expect(page.getByRole('textbox', { name: 'Tên bài giảng' })).toHaveValue('Con vật sống ở đâu? (bản sao)');
  await expect(page.getByTestId('lesson-readonly')).toHaveCount(0);
  w.expectClean();
});

test('Mẫu nhận xét của tôi khi tự chấm; câu trả lời nhanh của phòng trò chuyện', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/cham-bai?tab=cho-cham');
  await page.locator('.tc-queue__row').first().click();
  const panel = page.getByRole('region', { name: 'Tự chấm' });
  await panel.getByRole('radio', { name: /^T/ }).click();
  await panel.getByTestId('bank-open').click();
  const bank = page.getByRole('dialog', { name: 'Mẫu nhận xét của tôi' });
  await bank.getByTestId('bank-add-student').click();
  await bank.getByRole('textbox', { name: 'Cho học sinh — câu 2' }).fill('Chữ em đẹp và trình bày sạch sẽ.');
  await bank.getByTestId('bank-save').click();
  await panel.getByRole('group', { name: 'Câu mẫu cho học sinh' }).getByRole('button', { name: 'Chữ em đẹp và trình bày sạch sẽ.' }).click();
  await expect(panel.getByLabel('Nhận xét cho học sinh')).toHaveValue('Chữ em đẹp và trình bày sạch sẽ.');

  // Câu trả lời nhanh
  await spaGo(page, '/thao-luan');
  await page.getByTestId('dc-new-chat').click();
  const ed = page.getByRole('dialog');
  await ed.getByTestId('dc-quick').getByRole('textbox', { name: 'Câu trả lời nhanh 1' }).fill('Tổ mình bắt đầu nhé!');
  await ed.getByTestId('dc-quick-add').click();
  await ed.getByTestId('dc-quick').getByRole('textbox', { name: 'Câu trả lời nhanh 5' }).fill('Em cần cô giúp ạ');
  await ed.getByTestId('dc-save').click();
  await spaGo(page, '/thao-luan');
  await page.getByRole('button', { name: /^Sửa Trò chuyện nhóm/ }).first().click();
  const q = page.getByRole('dialog').getByTestId('dc-quick');
  await expect(q.getByRole('textbox', { name: 'Câu trả lời nhanh 1' })).toHaveValue('Tổ mình bắt đầu nhé!');
  await expect(q.getByRole('textbox', { name: 'Câu trả lời nhanh 5' })).toHaveValue('Em cần cô giúp ạ');
  w.expectClean();
});

test('Quản trị: đổi tên / ẩn môn học cho cả trường', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'admin');
  await spaGo(page, '/quan-tri/cai-dat');
  const box = page.getByTestId('subject-settings');
  await box.getByLabel('Tên hiển thị Khác').fill('Giáo dục địa phương');
  await box.getByLabel('Dùng môn Âm nhạc').uncheck();
  await box.getByTestId('subject-save').click();
  await expect(box.getByText(/Đã lưu/)).toBeVisible();
  await spaGo(page, '/ngan-hang');
  const subj = page.getByLabel('Môn', { exact: true }).first();
  await expect(subj.locator('option', { hasText: 'Giáo dục địa phương' })).toHaveCount(1);
  await expect(subj.locator('option', { hasText: 'Âm nhạc' })).toHaveCount(0);
  // Khôi phục
  await spaGo(page, '/quan-tri/cai-dat');
  await box.getByRole('button', { name: 'Khôi phục Khác' }).click();
  await box.getByRole('button', { name: 'Khôi phục Âm nhạc' }).click();
  await box.getByTestId('subject-save').click();
  await spaGo(page, '/ngan-hang');
  await expect(page.getByLabel('Môn', { exact: true }).first().locator('option', { hasText: 'Âm nhạc' })).toHaveCount(1);
  w.expectClean();
});
