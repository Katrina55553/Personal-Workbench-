import { expect, test } from '@playwright/test';
import { THEME_STORAGE_KEY } from '../src/shared/theme';
import { STORAGE_KEY } from '../src/data/repository';
import { createInitialSnapshot } from '../src/data/defaults';
import { localDate } from '../src/shared/date';

test('外观使用系统默认，支持键盘切换并记住手动选择', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByRole('button', { name: '切换到亮色模式' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: '切换到暗色模式' })).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await page.getByRole('button', { name: '切换到暗色模式' }).click();
  await page.getByRole('link', { name: '待办清单', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#111822');
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe('dark');
});

test('外观同步到同源标签页，切换不会改动业务数据', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const other = await context.newPage();
  await other.goto('/#/settings');
  await page.getByRole('button', { name: '切换到暗色模式' }).click();
  await expect(other.getByRole('button', { name: '切换到亮色模式' })).toBeVisible();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.getByRole('button', { name: '切换到亮色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  await other.close();
});

test('偏好保存失败时仍可切换并给出反馈', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '切换到暗色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('alert')).toContainText('偏好未能保存');
  await page.getByRole('button', { name: '切换到亮色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

for (const width of [1280, 1440, 1920]) {
  test(`暗色模式 ${width}px：全部页面、表格与弹窗适配`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const snapshot = createInitialSnapshot();
    const today = localDate();
    const base = {
      id: crypto.randomUUID(),
      title: '完成今日学习计划',
      note: '检查暗色模式下的内容显示',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    snapshot.data.todos.push({ ...base, done: false, pinned: true, priority: 'P0' });
    snapshot.data.habits.push({
      ...base,
      id: crypto.randomUUID(),
      title: '每日复习',
      log: { [today]: true },
    });
    snapshot.data.transactions.push({
      ...base,
      id: crypto.randomUUID(),
      title: '学习资料',
      type: 'expense',
      amountCents: 2500,
      categoryId: snapshot.data.categories[0]!.id,
      date: today,
    });
    snapshot.data.studyRecords.push({
      ...base,
      id: crypto.randomUUID(),
      title: '数学练习',
      date: today,
      minutes: 45,
      subjectId: snapshot.data.subjects[1]!.id,
      source: 'manual',
      sessionId: null,
    });
    await page.goto('/');
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
      key: STORAGE_KEY,
      data: snapshot,
    });
    await page.reload();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(page.locator('aside')).toHaveCSS('background-color', 'rgb(27, 37, 51)');
    await expect(page.getByText('完成今日学习计划', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/theme-dark-${width}.png`, fullPage: true });
    for (const name of ['概览', '待办清单', '习惯打卡', '收支账本', '自习记录', '设置与备份']) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main section').first()).toHaveCSS(
        'background-color',
        'rgb(27, 37, 51)',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.getByRole('link', { name: '待办清单', exact: true }).click();
    const open = page.getByRole('button', { name: '新建待办' }).first();
    await open.click();
    await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(27, 37, 51)');
    await expect(page.getByLabel('标题', { exact: true })).toHaveCSS(
      'background-color',
      'rgb(27, 37, 51)',
    );
    await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCSS(
      'color',
      'rgb(21, 34, 58)',
    );
    await page.getByLabel('标题', { exact: true }).fill('键盘操作');
    await page.screenshot({ path: `test-results/theme-dark-modal-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
    expect(errors).toEqual([]);
  });
}
