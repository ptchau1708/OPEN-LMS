import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { patchXls, readXls } from '../packages/data/src/export/xls';
import { LEARNER, learnerLogin, spaGo, teacherLogin, watchErrors } from './helpers';

const FIX = fileURLToPath(new URL('../packages/data/src/export/__fixtures__/vnedu-so-diem-mau.xls', import.meta.url));

/** Sổ điểm VnEdu (.xls) của lớp 4A demo, giữa kì I: từ tệp mẫu giả, đổi tên học sinh / tiêu đề cho khớp dữ liệu demo. */
function soDiem4A(): Buffer {
  const names = [['Nguyễn Minh', 'Hải'], ['Trần Ngọc', 'Lan'], ['Lê Đăng', 'Khoa'], ['Phạm Thanh', 'Mai'], ['Hoàng Anh', 'Tuấn'], ['Vũ Tường', 'Vy']];
  const sheets = ['tieng_viet_5a1', 'dao_duc_5a1', 'am_nhac_5a1'];
  const mon = ['TIẾNG VIỆT', 'ĐẠO ĐỨC', 'ÂM NHẠC'];
  const code = [50, 56, 58];
  const out = patchXls(new Uint8Array(readFileSync(FIX)), sheets.map((sheet, i) => ({
    sheet,
    patches: [
      { r: 3, c: 0, value: `BẢNG ĐIỂM CHI TIẾT - MÔN ${mon[i]} - HỌC KỲ 1 - GIỮA KỲ 1 - NĂM HỌC 2026 - 2027` },
      { r: 4, c: 0, value: 'Khối 4 - Lớp 4A' },
      { r: 5, c: 1, value: `1234567890-${code[i]}-1-gk1-2026` },
      ...names.flatMap(([ho, ten], k) => [{ r: 7 + k, c: 2, value: ho }, { r: 7 + k, c: 3, value: ten }]),
    ],
  })));
  return Buffer.from(out.bytes);
}

test('xuất / nhập: sổ điểm VnEdu (.xls) được nhận ra, điền nhận xét + mức đạt, tải về .xls', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/xuat-nhap');
  await page.getByRole('combobox', { name: /^K/ }).selectOption('GK1');
  await page.getByTestId('br-fill-file').setInputFiles({ name: 'so_diem_cac_mon_lop_4a.xls', mimeType: 'application/vnd.ms-excel', buffer: soDiem4A() });
  const box = page.getByTestId('br-vnedu');
  await expect(box).toContainText('Đã nhận ra tệp VnEdu');
  await expect(box).toContainText('Sổ điểm 3 môn');
  await expect(box).toContainText('lớp 4A');
  await expect(box.getByRole('row', { name: /TIẾNG VIỆT/ })).toContainText('6/6');
  // CT GDPT 2018: Đạo đức đã có trong OPEN-EDU (SQL 17)
  await expect(box.getByRole('row', { name: /ĐẠO ĐỨC/ })).not.toContainText('OPEN-EDU chưa có môn này');
  await expect(page.getByTestId('br-vn-filled')).not.toHaveText('Sẽ điền 0 ô');
  const dl = page.waitForEvent('download');
  await page.getByTestId('br-vn-download').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('so_diem_cac_mon_lop_4a-da-dien.xls');
  const wb = readXls(new Uint8Array(readFileSync(await file.path())));
  if (process.env.E2E_DUMP) (await import('node:fs')).writeFileSync(process.env.E2E_DUMP, readFileSync(await file.path()));
  const tv = wb.sheets[0];
  expect(tv.rows[5][1]).toBe('1234567890-50-1-gk1-2026');
  // Demo: Ngọc Lan (dòng 9) có đánh giá TT27 Tiếng Việt giữa kì I; dòng không có dữ liệu để nguyên.
  expect(['T', 'H', 'C']).toContain(tv.rows[8][6]);
  expect(String(tv.rows[8][4])).toContain('giữa học kì I');
  await expect(page.getByTestId('br-vn-done')).toBeVisible();
  w.expectClean();
});

test('quản trị: bật LTI 1.3 cho app → có cấu hình để dán vào app ngoài', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'admin');
  await spaGo(page, '/quan-tri/ung-dung');
  await page.getByRole('button', { name: 'Thêm ứng dụng' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Tên ứng dụng').fill('Luyện đọc hiểu');
  await dlg.getByLabel('Mã ứng dụng').fill('luyen-doc');
  await dlg.getByTestId('lti-on').check();
  await dlg.getByTestId('lti-login').fill('http://doc.truong.edu.vn/lti/login');
  await dlg.getByTestId('lti-launch').fill('https://doc.truong.edu.vn/lti/launch');
  await dlg.getByTestId('lti-jwks').fill('https://doc.truong.edu.vn/lti/jwks');
  await expect(dlg.getByTestId('lti-err')).toContainText('Login URL');
  await expect(dlg.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  await dlg.getByTestId('lti-login').fill('https://doc.truong.edu.vn/lti/login');
  await dlg.getByRole('button', { name: 'Lưu' }).click();
  await expect(dlg).toBeHidden();
  await page.getByTestId('lti-info-luyen-doc').click();
  const info = page.getByTestId('lti-info');
  await expect(info).toContainText('Client ID');
  await expect(info).toContainText(/openedu-[0-9a-f]{24}/);
  await expect(info).toContainText('/lti/auth');
  await expect(info).toContainText('chế độ thử');
  w.expectClean();
});

test('học sinh: trang /lti/auth thiếu tham số → hướng dẫn mở lại; chế độ thử báo cần máy chủ', async ({ page }) => {
  const w = watchErrors(page);
  await learnerLogin(page);
  await spaGo(page, '/lti/auth');
  await expect(page.getByText('Chưa mở được ứng dụng')).toBeVisible();
  const uid = 'u-an2a1';
  await page.goto(`${LEARNER}/lti/auth?scope=openid&response_type=id_token&response_mode=form_post&client_id=cid-12345678&redirect_uri=https%3A%2F%2Fdoc.vn%2Flti%2Flaunch&login_hint=${uid}&nonce=n1&state=s1`);
  await expect(page.getByTestId('lti-auth-error')).toContainText('máy chủ');
  await spaGo(page, '/ung-dung');
  await expect(page.getByText('Ứng dụng học')).toBeVisible();
  w.expectClean();
});

test('giáo viên: Trang học — cho phép nhúng trang mới, thêm trang cho lớp, ẩn / hiện, bớt trang', async ({ page }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/trang-hoc');
  await expect(page.getByRole('heading', { name: 'Trang học', level: 1 })).toBeVisible();
  await expect(page.getByTestId('pg-sites')).toContainText('https://scratch.mit.edu');
  // Thêm trang web chưa được phép → nút "Cho phép nhúng trang này".
  await page.getByTestId('pg-add').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByTestId('pg-title').fill('Bài đọc: Cây bàng');
  await dlg.getByTestId('pg-url').fill('https://doc.truong.edu.vn/bai/3');
  await expect(dlg).toContainText('chưa có trong danh sách được phép nhúng');
  await dlg.getByTestId('pg-allow').click();
  await expect(dlg).toContainText('Trang này được phép nhúng.');
  await dlg.getByTestId('pg-save').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('pg-list')).toContainText('Bài đọc: Cây bàng');
  await expect(page.getByTestId('pg-list')).toContainText('mở trong OPEN-EDU');
  await expect(page.getByTestId('pg-sites')).toContainText('https://doc.truong.edu.vn');
  await page.getByTestId('pg-list').getByRole('button', { name: 'Ẩn' }).click();
  await expect(page.getByTestId('pg-list')).toContainText('đang ẩn');
  // Bớt một trang có sẵn.
  await page.getByRole('button', { name: 'Bớt https://padlet.com' }).click();
  await expect(page.getByTestId('pg-sites')).not.toContainText('https://padlet.com');
  w.expectClean();
});

test('học sinh: Ứng dụng học → mở trang ngay trong OPEN-EDU (trang được phép) hoặc thẻ mới (chưa được phép)', async ({ page }) => {
  const w = watchErrors(page);
  // Demo: app học sinh và giáo viên khác origin → đặt sẵn dữ liệu Trang học cho lớp 2A (trước khi trang nạp).
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const pg = (id: string, title: string, url: string) => ({ id, classId: 'c-2a', title, description: '', kind: 'link', url, appId: null, lti: {}, openIn: 'iframe', position: 0, hidden: false, createdAt: now });
    localStorage.setItem('openedu:v1:pages', JSON.stringify({
      sites: [{ origin: location.origin, name: 'Trang thử', builtin: false, createdAt: now }],
      pages: [pg('pg-1', 'Trang được phép', `${location.origin}/robots.txt`), pg('pg-2', 'Trang chưa được phép', 'https://example.com/bai')],
    }));
  });
  await learnerLogin(page);
  await expect(page.getByTestId('home-lti')).toBeVisible();
  await spaGo(page, '/ung-dung');
  await expect(page.getByText('Thầy cô giao')).toBeVisible();
  await page.getByTestId('page-open-pg-1').click();
  await expect(page.getByTestId('page-frame')).toHaveAttribute('src', /robots\.txt$/);
  await spaGo(page, '/trang/pg-2');
  await expect(page.getByTestId('page-reason')).toContainText('thẻ mới');
  await expect(page.getByTestId('page-newtab')).toHaveAttribute('href', 'https://example.com/bai');
  w.expectClean();
});
