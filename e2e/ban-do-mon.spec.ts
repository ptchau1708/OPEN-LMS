import { expect, test } from '@playwright/test';
import { spaGo, teacherLogin, watchErrors } from './helpers';

test('Bản đồ kiến thức: GV tự chọn môn hiện cho lớp, nhớ sau khi tải lại', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/lop/c-4a/ban-do-kien-thuc');
  const seg = page.getByRole('group', { name: 'Môn', exact: true });
  // Mặc định lớp 4: các môn GVCN thường dạy — không có TN&XH (lớp 1–3), Tin học / Công nghệ để GV bộ môn tự chọn
  const DEF = ['Tiếng Việt', 'Toán', 'Tiếng Anh', 'Lịch sử và Địa lí', 'Khoa học'];
  await expect(seg.getByRole('button')).toHaveText(DEF);

  // Thầy/cô dạy Toán + Khoa học + Tin học
  await page.getByTestId('hm-pick-open').click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('checkbox')).toHaveCount(13);
  await expect(dlg.getByText('Tự nhiên và Xã hội')).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Bỏ chọn hết' }).click();
  await expect(dlg.getByTestId('hm-pick-save')).toBeDisabled();
  for (const n of ['Toán', 'Khoa học', 'Tin học']) await dlg.getByRole('checkbox', { name: n, exact: true }).check();
  await dlg.getByTestId('hm-pick-save').click();
  await expect(seg.getByRole('button')).toHaveText(['Toán', 'Khoa học', 'Tin học']);

  // Khoa học lớp 4 đã có danh mục kĩ năng theo chủ đề CT 2018
  await seg.getByRole('button', { name: 'Khoa học' }).click();
  await page.getByText('Ẩn kĩ năng chưa em nào làm').click();
  await expect(page.locator('.tc-hm').getByText('Ánh sáng và bóng tối').first()).toBeVisible();
  await expect(page.locator('.tc-hm').getByText('Năng lượng', { exact: true }).first()).toBeVisible();

  // Tải lại: vẫn đúng các môn đã chọn và môn đang xem
  await page.reload();
  await expect(seg.getByRole('button')).toHaveText(['Toán', 'Khoa học', 'Tin học']);
  await expect(seg.getByRole('button', { name: 'Khoa học' })).toHaveAttribute('aria-pressed', 'true');

  // Chọn nhiều môn → ô chọn dạng danh sách; "Về mặc định" trả lại như cũ
  await page.getByTestId('hm-pick-open').click();
  await dlg.getByRole('button', { name: 'Chọn tất cả' }).click();
  await dlg.getByTestId('hm-pick-save').click();
  await expect(page.getByTestId('hm-subject').locator('option')).toHaveCount(13);
  await page.getByTestId('hm-pick-open').click();
  await dlg.getByRole('button', { name: 'Về mặc định' }).click();
  await expect(seg.getByRole('button')).toHaveText(DEF);
  w.expectClean();
});
