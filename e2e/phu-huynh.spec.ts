import { expect, test } from '@playwright/test';
import { LEARNER } from './helpers';

test('phụ huynh: quét QR → tạo tài khoản bằng SĐT → xem việc học của con → đăng nhập lại bằng mọi cách viết số', async ({ page }) => {
  await page.goto(`${LEARNER}/phu-huynh/lien-ket?ma=CHAU2A3K`);
  await expect(page.locator('.ln-pl__code')).toHaveValue('CHAU-2A3K');
  await page.locator('select').selectOption('Mẹ');
  await page.getByPlaceholder('Mẹ bé Khoa').fill('Mẹ bé Chi');
  await page.getByPlaceholder('0912 345 678').fill('0912 345 678');
  await page.locator('input[type=password]').fill('matkhau1');
  await page.getByRole('button', { name: /Tạo tài khoản/ }).click();
  await expect(page.getByText('Đã liên kết với Bảo Chi!')).toBeVisible();
  await page.getByRole('button', { name: /Xem việc học/ }).click();
  await expect(page.getByRole('heading', { name: 'Bảo Chi' })).toBeVisible();
  await expect(page.getByText('Bài được giao')).toBeVisible();
  for (const login of ['0912 345 678', '+84912345678', '84 912 345 678']) {
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL('**/dang-nhap');
    await page.getByRole('button', { name: 'Đăng nhập bằng tên' }).click();
    await page.locator('input.ln-input').first().fill(login);
    await page.locator('input[type=password]').fill('matkhau1');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL('**/phu-huynh');
  }
});
