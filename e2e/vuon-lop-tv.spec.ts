import { expect, test } from '@playwright/test';
import { PRESENT, spaGo, teacherLogin, watchErrors } from './helpers';

test('Vườn lớp: GV bấm "Mở trên TV" → link có khóa lớp, TV mở được vườn không cần đăng nhập', async ({ page, context }) => {
  const w = watchErrors(page);
  await teacherLogin(page, 'colan');
  await spaGo(page, '/vuon-lop');
  const popup = context.waitForEvent('page');
  await page.getByTestId('garden-tv-open').click();
  const tv = await popup;
  await tv.waitForURL(/\/vuon-lop\?lop=.+&ma=.+/);
  expect(tv.url().startsWith(PRESENT)).toBe(true);
  await expect(tv.getByRole('heading', { name: /^Vườn lớp / })).toBeVisible();
  await expect(page.getByTestId('garden-tv-link')).toBeVisible();
  w.expectClean();
});
