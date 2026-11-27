import { expect, test, type Browser, type Page } from '@playwright/test';
import { learnerLogin, PRESENT, spaGo, teacherLogin, watchErrors } from './helpers';

/** GV chọn 2 câu chọn-1-đáp-án trong ngân hàng → "Chơi trực tiếp" với kiểu chơi đã chọn. Trả về mã PIN + sessionId. */
async function openGame(page: Page, mode: 'class' | 'self' | 'paper') {
  await teacherLogin(page, 'cothu');
  await spaGo(page, '/ngan-hang');
  await page.getByLabel('Dạng', { exact: true }).selectOption('MCQ');
  const picks = page.locator('.tc-qbrow__pick');
  await expect(picks.first()).toBeVisible();
  await picks.nth(0).check();
  await picks.nth(1).check();
  await page.getByTestId('qb-play').click();
  await page.getByTestId(`game-mode-${mode}`).click();
  await page.getByTestId('game-go').click();
  await expect(page.getByTestId('game-control')).toBeVisible({ timeout: 15_000 });
  const pin = (await page.locator('.tc-live__pin strong').innerText()).replace(/\D/g, '');
  const sessionId = new URL(page.url()).pathname.split('/').pop()!;
  return { pin, sessionId };
}

async function student(browser: Browser, pin: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await learnerLogin(p);
  await p.goto(`${p.url().replace(/\/[^/]*$/, '')}/lop?pin=${pin}`);
  return p;
}

test('Đố vui kiểu Kahoot: HS vào bằng mã, trả lời, bảng xếp hạng, kết thúc + xuất Excel', async ({ page, browser }) => {
  test.slow();
  const w = watchErrors(page);
  const { pin, sessionId } = await openGame(page, 'class');
  const kid = await student(browser, pin);
  await expect(kid.getByText('Chờ thầy/cô bắt đầu nhé!')).toBeVisible({ timeout: 15_000 });
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`${PRESENT}/?s=${sessionId}`);

  await page.getByTestId('game-open').click();
  // Câu 1: HS chọn đáp án đầu tiên rồi gửi → cả lớp đã trả lời → tự chốt và hiện đáp án
  await expect(tv.locator('.pr-gtile').first()).toBeVisible();
  await kid.locator('.lp-live__card [role="radio"]').first().click();
  await kid.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Đã tính điểm câu này.')).toBeVisible();
  await page.getByTestId('game-board').click();
  await expect(tv.getByTestId('tv-leaderboard')).toBeVisible();
  await expect(kid.getByTestId('game-bar')).toContainText('Hạng 1');
  // Câu 2 → kết thúc
  await page.getByTestId('game-next').click();
  await expect(kid.getByRole('button', { name: 'Gửi' })).toBeVisible();
  await page.getByTestId('game-reveal').click();
  await page.getByTestId('game-finish').click();
  await expect(page.getByTestId('game-ended')).toBeVisible();
  await expect(tv.getByTestId('tv-podium')).toBeVisible();
  await expect(kid.getByTestId('game-over')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByTestId('game-export').click();
  expect((await dl).suggestedFilename()).toMatch(/^do-vui-\d{6}\.xlsx$/);
  w.expectClean();
});

test('Đố vui kiểu Quizizz: HS tự làm theo nhịp, GV thấy tiến độ, TV xếp hạng trực tiếp', async ({ page, browser }) => {
  test.slow();
  const w = watchErrors(page);
  const { pin, sessionId } = await openGame(page, 'self');
  const kid = await student(browser, pin);
  await expect(kid.getByText('Chờ thầy/cô bấm “Bắt đầu” nhé!')).toBeVisible({ timeout: 15_000 });
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`${PRESENT}/?s=${sessionId}`);
  await page.getByTestId('game-start').click();
  for (let i = 0; i < 2; i++) {
    await expect(kid.getByTestId('self-play')).toBeVisible();
    await kid.locator('.lp-live__card [role="radio"]').first().click();
    await kid.getByRole('button', { name: 'Gửi' }).click();
    await expect(kid.getByTestId('self-flash')).toBeVisible();
  }
  await expect(kid.getByTestId('self-finished')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('self-progress')).toContainText('2/2');
  await expect(tv.getByTestId('tv-self')).toContainText('1 bạn đã xong');
  await page.getByTestId('game-end').click();
  await page.getByRole('button', { name: 'Kết thúc', exact: true }).click();
  await expect(page.getByTestId('game-ended')).toBeVisible();
  w.expectClean();
});

test('Đố vui thẻ giấy: in thẻ, GV chạm chọn đáp án cho từng em, chấm và xếp hạng', async ({ page, browser }) => {
  test.slow();
  const w = watchErrors(page);
  const { sessionId } = await openGame(page, 'paper');
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`${PRESENT}/?s=${sessionId}`);
  await expect(tv.getByText('Hôm nay chơi bằng')).toBeVisible();
  await page.getByTestId('game-open').click();
  const panel = page.getByTestId('paper-panel');
  await expect(panel).toBeVisible();
  const rows = panel.locator('.tc-paper__grid li');
  await rows.nth(0).getByRole('button', { name: 'A', exact: true }).click();
  await rows.nth(1).getByRole('button', { name: 'B', exact: true }).click();
  await expect(page.getByText(/2\/\d+/).first()).toBeVisible();
  await expect(tv.locator('.pr-gcount')).toContainText('2/');
  await page.getByTestId('game-reveal').click();
  await expect(rows.nth(0)).toHaveClass(/is-(ok|bad)/);
  await expect(tv.locator('.pr-gbars')).toBeVisible();
  await page.getByTestId('game-board').click();
  await expect(tv.getByTestId('tv-leaderboard')).toBeVisible();
  // Trang in thẻ
  await spaGo(page, '/truc-tiep/the-giay');
  await expect(page.getByTestId('paper-cards').locator('.tc-pcard').first()).toBeVisible();
  w.expectClean();
});
