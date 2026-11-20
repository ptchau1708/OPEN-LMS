import { expect, type Page } from '@playwright/test';

export const LEARNER = 'http://localhost:4611';
export const TEACHER = 'http://localhost:4612';
export const PRESENT = 'http://localhost:4613';

/** Gom lỗi JavaScript của trang; gọi `expectClean()` cuối bài. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { errors, expectClean: () => expect(errors, 'không có lỗi JavaScript trên trang').toEqual([]) };
}

export async function teacherLogin(page: Page, username: string) {
  await page.goto(`${TEACHER}/`);
  await page.locator('input.tc-input').first().fill(username);
  await page.locator('input[type=password]').fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
}

export async function learnerLogin(page: Page, name = 'Minh An') {
  await page.goto(`${LEARNER}/`);
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByText(`Chào ${name}!`)).toBeVisible();
  // Hộp chúc mừng huy hiệu mới hiện trễ một nhịp và che trang — đợi rồi đóng.
  const pop = page.getByRole('dialog').filter({ hasText: /huy hiệu/i });
  if (await pop.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
    await pop.getByRole('button').last().click();
    await expect(pop).toBeHidden();
  }
}

/** Chuyển trang trong SPA mà không tải lại (giữ phiên demo). */
export async function spaGo(page: Page, path: string) {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
}
