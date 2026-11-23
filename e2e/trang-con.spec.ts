import { expect, test } from '@playwright/test';
import { learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

test('GV: tạo trang nội dung, trang con, trang web nhúng bên trong; đổi thứ tự', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/trang-hoc');
  // Trang chính
  await page.getByTestId('pg-add-section').click();
  await page.getByTestId('pg-title').fill('Tiếng Việt');
  await page.getByTestId('pg-body').fill('Các bài đọc của lớp.\n\n- Đọc to\n- Trả lời câu hỏi');
  await page.getByTestId('pg-save').click();
  // Trang con
  await page.getByTestId('pg-add-child').first().click();
  await page.getByTestId('pg-title').fill('Tuần 12');
  await page.getByTestId('pg-save').click();
  // Trang web nhúng trong "Tuần 12", địa chỉ chưa được phép → lưu với "hiện ngay trong trang" tự thêm vào danh sách
  await page.getByTestId('pg-add').click();
  await page.getByTestId('pg-title').fill('Bài đọc: Cây bàng');
  await page.getByTestId('pg-parent').selectOption({ label: '   └ Tuần 12' });
  await page.getByTestId('pg-url').fill('https://doc.truong-thu.edu.vn/bai/3');
  await page.getByTestId('pg-open-iframe').check();
  await page.getByTestId('pg-save').click();
  const rows = page.getByTestId('pg-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('Bài đọc: Cây bàng');
  await expect(rows.nth(2)).toContainText('mở trong OPEN-EDU');
  await expect(page.getByTestId('pg-sites')).toContainText('https://doc.truong-thu.edu.vn');
  // Thêm trang chính thứ hai rồi đưa lên trên
  await page.getByTestId('pg-add-section').click();
  await page.getByTestId('pg-title').fill('Toán');
  await page.getByTestId('pg-save').click();
  await expect(rows.nth(3)).toContainText('Toán');
  await rows.nth(3).getByTestId('pg-up').click();
  await expect(rows.nth(0)).toContainText('Toán');
  w.expectClean();
});

test('HS: trang chính → trang con có mục lục, đường dẫn, nội dung và trang web nhúng', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const pg = (id: string, title: string, kind: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({ id, classId: 'c-2a', title, description: '', kind, url: null, appId: null, lti: {}, openIn: 'iframe', position: 0, hidden: false, createdAt: now, parentId, body: '', ...extra });
    localStorage.setItem('openedu:v1:pages', JSON.stringify({
      sites: [{ origin: location.origin, name: 'Trang thử', builtin: false, createdAt: now }],
      pages: [
        pg('tv', 'Tiếng Việt', 'section', null, { body: 'Các bài đọc của lớp.\n\n- Đọc to\n- Trả lời câu hỏi' }),
        pg('t12', 'Tuần 12', 'section', 'tv', { description: 'Bài đọc tuần này' }),
        pg('bai', 'Bài đọc: Cây bàng', 'link', 't12', { url: `${location.origin}/robots.txt`, body: 'Đọc kĩ rồi làm bài nhé.' }),
        pg('an', 'Trang ẩn', 'section', 'tv', { hidden: true }),
      ],
    }));
  });
  await learnerLogin(page);
  await spaGo(page, '/ung-dung');
  await expect(page.getByText('1 trang bên trong')).toBeVisible();
  await page.getByTestId('page-open-tv').click();
  await expect(page.getByTestId('page-body').locator('li')).toHaveCount(2);
  await page.getByTestId('page-children').getByText('Tuần 12').click();
  await page.getByTestId('page-children').getByText('Bài đọc: Cây bàng').click();
  await expect(page.locator('.ln-crumbs')).toContainText('Tiếng Việt');
  await expect(page.locator('.ln-crumbs')).toContainText('Tuần 12');
  await expect(page.getByTestId('page-frame')).toBeVisible();
  await expect(page.getByTestId('page-body')).toContainText('Đọc kĩ');
  await expect(page.getByTestId('page-nav')).not.toContainText('Trang ẩn');
  await page.getByRole('button', { name: 'Về' }).click();
  await expect(page).toHaveURL(/\/trang\/t12$/);
});
