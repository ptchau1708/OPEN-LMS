import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('TT27: chọn môn hiển thị, ngân hàng nhận xét gợi ý, nhập chung cho nhiều em', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/tt27');
  const table = page.locator('table.tc-tt27');
  await expect(table.locator('thead th').filter({ hasText: 'Khoa học' })).toHaveCount(1);
  // Môn tự chọn (Tiếng dân tộc thiểu số) mặc định không hiện
  await expect(table.locator('thead th').filter({ hasText: 'Tiếng dân tộc' })).toHaveCount(0);

  // Cô chỉ dạy Toán + Tiếng Việt
  await page.getByTestId('tt27-cols').click();
  const cols = page.getByRole('dialog');
  await expect(cols.getByText('Môn học tự chọn')).toBeVisible();
  await cols.getByRole('button', { name: 'Bỏ chọn hết' }).click();
  await cols.getByRole('checkbox', { name: 'Toán', exact: true }).check();
  await cols.getByRole('checkbox', { name: 'Tiếng Việt', exact: true }).check();
  await cols.getByTestId('tt27-cols-save').click();
  await expect(table.locator('thead th').filter({ hasText: /^(Toán|Tiếng Việt|Khoa học|Đạo đức)$/ })).toHaveText(['Tiếng Việt', 'Toán']);
  await expect(page.getByTestId('tt27-cols')).toContainText('2/');

  // Nhập nhận xét → Lưu nháp → câu vào ngân hàng
  await page.getByLabel('Nhận xét Toán của Minh Hải').fill('Em tính nhanh và trình bày sạch đẹp.');
  await page.getByLabel('Nhận xét Tiếng Việt của Thanh Mai').fill('Em đọc to, rõ ràng, diễn cảm.');
  await page.getByLabel('Nhận xét Tiếng Việt của Anh Tuấn').fill('Anh Tuấn cần viết chữ đều hơn.'); // có tên riêng → không vào ngân hàng
  await page.getByRole('button', { name: /^Lưu nháp/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu nháp' })).toContainText('2 câu nhận xét mới đã vào ngân hàng');

  // Bấm vào ô của em khác → gợi ý từ ngân hàng
  const lan = page.getByLabel('Nhận xét Toán của Ngọc Lan');
  await lan.click();
  const sugg = page.getByRole('listbox', { name: 'Gợi ý từ ngân hàng nhận xét' });
  await expect(sugg).toBeVisible();
  await sugg.getByRole('option', { name: /Em tính nhanh và trình bày sạch đẹp/ }).click();
  await expect(lan).toHaveValue(/(^|\s)Em tính nhanh và trình bày sạch đẹp\.$/);
  // Gõ không dấu cũng lọc được
  const khoa = page.getByLabel('Nhận xét Toán của Đăng Khoa');
  await khoa.fill('trinh bay');
  await expect(sugg.getByRole('option')).toHaveCount(1);
  await khoa.press('ArrowDown');
  await khoa.press('Enter');
  await expect(khoa).toHaveValue('Em tính nhanh và trình bày sạch đẹp.');

  // Nhập chung: chọn cả lớp → đặt mức T + nhận xét chung cho Toán
  await page.getByTestId('tt27-bulk-open').click();
  const bulk = page.getByTestId('tt27-bulk');
  await expect(bulk).toContainText('Đã chọn 8 em');
  await bulk.getByLabel('Môn áp dụng').selectOption('toan');
  await bulk.getByRole('radiogroup', { name: 'Mức cho các em đã chọn' }).getByRole('radio', { name: 'T' }).click();
  await bulk.getByLabel('Nhận xét môn cho các em đã chọn').fill('Em nắm vững bảng nhân.');
  await bulk.getByRole('button', { name: 'Áp dụng nhận xét môn' }).click();
  await expect(page.getByLabel('Nhận xét Toán của Phương Thảo')).toHaveValue('Em nắm vững bảng nhân.');
  await expect(page.getByRole('radiogroup', { name: 'Phương Thảo · Toán' }).getByRole('radio', { name: 'T' })).toHaveAttribute('aria-checked', 'true');

  // Quản lí ngân hàng: thấy câu đã lưu, xoá được
  await page.getByTestId('tt27-bank').click();
  const bank = page.getByRole('dialog', { name: 'Ngân hàng nhận xét' });
  await bank.getByTestId('bank-scope').selectOption('tt27:toan');
  await expect(bank.getByTestId('bank-list')).toContainText('Em tính nhanh và trình bày sạch đẹp.');
  await bank.getByLabel('Câu nhận xét mới').fill('Em cần luyện thêm phép chia.');
  await bank.getByTestId('bank-add').click();
  await expect(bank.getByTestId('bank-list')).toContainText('Em cần luyện thêm phép chia.');
  await bank.getByRole('button', { name: 'Xoá câu: Em cần luyện thêm phép chia.' }).click();
  await expect(bank.getByTestId('bank-list')).not.toContainText('phép chia');
  w.expectClean();
});

test('Hồ sơ học sinh: thông tin bổ sung — nhập tay, từ Word, Excel cả lớp; phụ huynh chỉ thấy mục được chia sẻ', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/hoc-sinh/u-hai4a1');
  const card = page.getByTestId('notes-card');
  await expect(card).toContainText('Chưa có thông tin bổ sung');

  // Nhập tay, cho phụ huynh xem
  await card.getByTestId('note-add').click();
  let dlg = page.getByRole('dialog');
  await dlg.getByLabel('Tiêu đề ghi chép').fill('Năng khiếu cờ vua');
  await dlg.getByLabel('Nhóm ghi chép').selectOption('nang-khieu');
  await dlg.getByLabel('Nội dung ghi chép').fill('Em đạt giải Nhì cờ vua cấp huyện.');
  await dlg.getByTestId('note-field-add').click();
  await dlg.getByLabel('Tên mục 1').fill('Giải');
  await dlg.getByLabel('Giá trị mục 1').fill('Nhì');
  await dlg.getByTestId('note-share').check();
  await dlg.getByTestId('note-save').click();
  const chess = card.getByTestId('note-item').filter({ hasText: 'Năng khiếu cờ vua' });
  await expect(chess).toContainText('Phụ huynh xem được');
  await expect(chess).toContainText('Giải');

  // Từ Word (chỉ thầy cô xem)
  await card.getByTestId('note-word-file').setInputFiles(path.join(FIX, 'ghi-chep-quan-sat.docx'));
  dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Nội dung ghi chép')).toHaveValue(/tích cực phát biểu/);
  await expect(dlg.getByLabel('Tiêu đề ghi chép')).toHaveValue('ghi chep quan sat');
  await dlg.getByLabel('Tiêu đề ghi chép').fill('Phiếu quan sát tháng 11');
  await dlg.getByTestId('note-save').click();
  await expect(card.getByTestId('note-item').filter({ hasText: 'Phiếu quan sát tháng 11' })).toContainText('Từ Word: ghi-chep-quan-sat.docx');

  // Xem như phụ huynh: chỉ mục được chia sẻ
  await page.getByText('Xem như phụ huynh').click();
  await expect(card.getByTestId('note-item')).toHaveCount(1);
  await expect(card).toContainText('Năng khiếu cờ vua');
  await page.getByText('Xem như phụ huynh').click();

  // Excel cả lớp
  await spaGo(page, '/hoc-sinh?c=c-4a');
  await page.getByTestId('nx-open').click();
  const nx = page.getByRole('dialog');
  const dl = page.waitForEvent('download');
  await nx.getByTestId('nx-template').click();
  expect((await dl).suggestedFilename()).toMatch(/^thong-tin-bo-sung-lop-4A\.xlsx$/);
  await nx.getByTestId('nx-file').setInputFiles(path.join(FIX, 'thong-tin-4a.xlsx'));
  await expect(nx.getByTestId('nx-summary')).toContainText('2 em ghép được');
  await expect(nx.getByTestId('nx-summary')).toContainText('1 dòng chưa ghép');
  await expect(nx.getByText('Không tìm thấy học sinh này trong lớp')).toBeVisible();
  await nx.getByLabel('Tiêu đề ghi chép').fill('Khám sức khoẻ đầu năm');
  await nx.getByLabel('Nhóm ghi chép').selectOption('suc-khoe');
  await nx.getByTestId('nx-import').click();
  await expect(page.getByRole('status')).toContainText('Đã nhập 2 ghi chép');

  await spaGo(page, '/hoc-sinh/u-lan4a2');
  const lan = page.getByTestId('notes-card').getByTestId('note-item').filter({ hasText: 'Khám sức khoẻ đầu năm' });
  await expect(lan).toContainText('Thị lực');
  await expect(lan).toContainText('9/10');
  await expect(lan).toContainText('Từ Excel: thong-tin-4a.xlsx');
  w.expectClean();
});

test('Tạo bài giảng: ô chọn môn chia nhóm theo Thông tư 32', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/bai-giang');
  await page.getByRole('button', { name: 'Tạo bài giảng' }).first().click();
  const sel = page.getByRole('dialog').getByRole('combobox');
  await page.getByRole('dialog').getByRole('button', { name: 'Lớp 3', exact: true }).click();
  await expect(sel.locator('optgroup')).toHaveCount(4);
  await expect(sel.locator('optgroup[label="Môn học tự chọn"] option')).toHaveText(['Tiếng dân tộc thiểu số']);
  await expect(sel.locator('optgroup[label="Hoạt động giáo dục bắt buộc"] option')).toHaveText(['Hoạt động trải nghiệm']);
  await expect(sel.locator('optgroup[label="Môn học bắt buộc"] option', { hasText: 'Tin học (Tin học và Công nghệ)' })).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Lớp 1', exact: true }).click();
  await expect(sel.locator('optgroup[label="Môn học tự chọn"] option')).toHaveText(['Tiếng Anh (tự chọn)', 'Tiếng dân tộc thiểu số']);
  w.expectClean();
});
