import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createInitialSnapshot } from '../src/data/defaults';
import { STORAGE_KEY } from '../src/data/repository';
import type { Snapshot } from '../src/data/schema';
import { addDays, localDate } from '../src/shared/date';

async function navigate(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function seed(page: Page, snapshot: Snapshot) {
  await page.goto('/');
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: STORAGE_KEY,
    data: snapshot,
  });
  await page.reload();
}
async function read(page: Page): Promise<Snapshot> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), STORAGE_KEY);
}

test('待办中文输入、优先级、置顶、搜索、编辑、完成、刷新及删除', async ({ page }) => {
  await page.goto('/');
  await navigate(page, '待办清单');
  const newButton = page.getByRole('button', { name: '新建待办' }).first();
  await newButton.click();
  await page.getByLabel('标题', { exact: true }).fill('整理中文工作台');
  await page.getByLabel('优先级').selectOption('P0');
  await page.getByLabel('备注（可选）').fill('先做最重要的事');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '置顶 整理中文工作台', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消置顶 整理中文工作台' })).toBeVisible();
  await page.getByRole('button', { name: '编辑 整理中文工作台' }).click();
  await page.getByLabel('标题', { exact: true }).fill('工作台新版');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('searchbox').fill('不存在');
  await expect(page.getByText('没有找到匹配待办')).toBeVisible();
  await page.getByRole('searchbox').fill('新版');
  await expect(page.getByText('工作台新版', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('工作台新版', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成 工作台新版', exact: true }).click();
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await expect(page.getByText('工作台新版', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除 工作台新版' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('工作台新版', { exact: true })).toHaveCount(0);
  await newButton.click();
  await page.keyboard.press('Escape');
  await expect(newButton).toBeFocused();
});

test('习惯创建、当日打卡、撤销、历史补打与未来日期限制', async ({ page }) => {
  const today = localDate();
  const tomorrow = addDays(today, 1);
  await page.goto('/');
  await navigate(page, '习惯打卡');
  await page.getByRole('button', { name: '新建习惯' }).first().click();
  await page.getByLabel('习惯名称').fill('每天喝水');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: `每天喝水 ${today} 打卡`, exact: true }).click();
  await expect(page.getByRole('button', { name: `每天喝水 ${today} 撤销打卡` })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: `每天喝水 ${today} 撤销打卡` }).click();
  await expect(
    page.getByRole('button', { name: `每天喝水 ${today} 打卡`, exact: true }),
  ).toBeVisible();
  const future = page.getByRole('button', { name: `每天喝水 ${tomorrow} 打卡`, exact: true });
  if (await future.count()) await expect(future).toBeDisabled();
  await page.getByRole('button', { name: '上一周' }).click();
  const historical = page.getByRole('button', { name: /每天喝水 .* 打卡$/ }).first();
  await historical.click();
  await expect(page.getByRole('button', { name: /每天喝水 .* 撤销打卡$/ })).toHaveCount(1);
  await page.getByRole('button', { name: '编辑 每天喝水' }).click();
  await page.getByLabel('习惯名称').fill('每天八杯水');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('每天八杯水', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除 每天八杯水' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).data.habits).toHaveLength(0);
});

test('记账按月统计、金额精度、分类改名与停用后保留历史', async ({ page }) => {
  await page.goto('/');
  await navigate(page, '收支账本');
  await page.getByRole('button', { name: '记一笔' }).first().click();
  await page.getByLabel('标题', { exact: true }).fill('咖啡');
  await page.getByLabel('金额（元）').fill('0.001');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('最多保留两位小数');
  await page.getByLabel('金额（元）').fill('12.30');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).data.transactions[0]?.amountCents).toBe(1230);
  await page.getByRole('button', { name: '上一月' }).click();
  await expect(page.getByText('这个月还没有收支记录')).toBeVisible();
  await page.getByRole('button', { name: '下一月' }).click();
  await expect(page.getByText('咖啡', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '设置与备份' }).click();
  await page.getByRole('button', { name: '改名 支出 餐饮' }).click();
  await page.getByLabel('名称', { exact: true }).fill('饮食');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '停用 支出 饮食' }).click();
  await expect(page.getByRole('button', { name: '启用 支出 饮食' })).toBeVisible();
  await navigate(page, '收支账本');
  await expect(page.getByRole('table').getByText('饮食', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '记一笔' }).first().click();
  await expect(
    page.getByLabel('分类', { exact: true }).getByRole('option', { name: '饮食', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '编辑 咖啡' }).click();
  await page.getByLabel('金额（元）').fill('15.00');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).data.transactions[0]?.amountCents).toBe(1500);
  await page.getByRole('button', { name: '删除 咖啡' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('咖啡', { exact: true })).toHaveCount(0);
});

test('手动自习、计时暂停刷新恢复、重置不记时', async ({ page }) => {
  await page.goto('/');
  await navigate(page, '自习记录');
  await page.getByRole('button', { name: '记录自习' }).first().click();
  await page.getByLabel('标题', { exact: true }).fill('高数练习');
  await page.getByLabel('科目', { exact: true }).selectOption({ label: '数学' });
  await page.getByLabel('时长（分钟）').fill('30');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('高数练习', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑 高数练习' }).click();
  await page.getByLabel('时长（分钟）').fill('45');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '开始专注' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '重置番茄钟', exact: true }).click();
  await page.getByRole('button', { name: '确认重置' }).click();
  await expect(page.getByTestId('timer-time')).toHaveText('25:00');
  expect((await read(page)).data.studyRecords).toHaveLength(1);
  await page.getByRole('button', { name: '删除 高数练习' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).data.studyRecords).toHaveLength(0);
});

test('长时间停留后开始计时不会显示超过 25 分钟', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  await page.goto('/');
  await expect(page.getByTestId('timer-time')).toHaveText('25:00');
  await page.clock.fastForward(10 * 60 * 1000);
  await page.getByRole('button', { name: '开始专注' }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect(page.getByTestId('timer-time')).toHaveText('25:00');
  await page.clock.fastForward(2000);
  await expect(page.getByTestId('timer-time')).toHaveText('24:58');
});

test('过期专注刷新只记一次，休息结束手动准备下一轮', async ({ page }) => {
  const snapshot = createInitialSnapshot();
  snapshot.timer = {
    phase: 'focus',
    status: 'running',
    remainingMs: 1500000,
    deadline: Date.now() - 10000,
    sessionId: crypto.randomUUID(),
    subjectId: snapshot.data.subjects[0]!.id,
  };
  await seed(page, snapshot);
  await expect(page.getByRole('button', { name: '开始休息' })).toBeVisible();
  await expect(page.getByTestId('timer-time')).toHaveText('05:00');
  expect((await read(page)).data.studyRecords).toHaveLength(1);
  await page.reload();
  expect((await read(page)).data.studyRecords).toHaveLength(1);
  await page.getByRole('button', { name: '开始休息' }).click();
  const running = await read(page);
  running.timer.deadline = Date.now() - 1000;
  await seed(page, running);
  await expect(page.getByRole('button', { name: '开始专注' })).toBeVisible();
  expect((await read(page)).data.studyRecords).toHaveLength(1);
});

test('备份导出、取消导入、确认替换和非法文件', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '设置与备份' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份' }).click();
  expect((await download).suggestedFilename()).toMatch(/^workbench-.*\.json$/);
  const snapshot = createInitialSnapshot();
  snapshot.data.todos.push({
    id: crypto.randomUUID(),
    title: '来自备份',
    note: '',
    done: false,
    pinned: false,
    priority: 'P1',
    createdAt: 1,
    updatedAt: 1,
  });
  const backup = { version: 1, exportedAt: new Date().toISOString(), data: snapshot.data };
  const input = page.getByLabel('导入备份文件');
  await input.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('备份无效');
  await input.setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('dialog')).toContainText('1 项待办');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await navigate(page, '待办清单');
  await expect(page.getByText('来自备份', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '设置与备份' }).click();
  await page.getByLabel('导入备份文件').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: '确认替换' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, '待办清单');
  await expect(page.getByText('来自备份', { exact: true })).toBeVisible();
});

test('保存失败保留表单，损坏存储可恢复', async ({ page }) => {
  await page.goto('/');
  await navigate(page, '待办清单');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '新建待办' }).first().click();
  await page.getByLabel('标题', { exact: true }).fill('保留输入');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('保存失败');
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('保留输入');
  await page.reload();
  await page.evaluate((key) => localStorage.setItem(key, '{corrupt'), STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('原始数据未被覆盖');
  await page.getByRole('link', { name: '设置与备份' }).click();
  await expect(page.getByRole('button', { name: '导出原始数据' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{corrupt');
});

for (const width of [1280, 1440, 1920]) {
  test(`有数据的工作台 ${width}px，长文本和统计保持可用`, async ({ page }) => {
    const snapshot = createInitialSnapshot();
    const today = localDate();
    const base = {
      id: crypto.randomUUID(),
      title: '整理本周学习计划',
      note: '从一个小目标开始',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    snapshot.data.todos.push({ ...base, pinned: true, done: false, priority: 'P0' });
    snapshot.data.habits.push({
      ...base,
      id: crypto.randomUUID(),
      title: '每天阅读二十分钟',
      log: { [today]: true },
    });
    snapshot.data.transactions.push({
      ...base,
      id: crypto.randomUUID(),
      title: '购买学习资料',
      type: 'expense',
      amountCents: 12345,
      categoryId: snapshot.data.categories[0]!.id,
      date: today,
    });
    snapshot.data.studyRecords.push({
      ...base,
      id: crypto.randomUUID(),
      title: '高数第三章',
      subjectId: snapshot.data.subjects[1]!.id,
      minutes: 50,
      date: today,
      source: 'manual',
      sessionId: null,
    });
    await page.setViewportSize({ width, height: 1000 });
    await seed(page, snapshot);
    await expect(page.getByText('整理本周学习计划', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/overview-${width}.png`, fullPage: true });
    for (const name of ['概览', '待办清单', '习惯打卡', '收支账本', '自习记录']) {
      await navigate(page, name);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.getByRole('button', { name: '编辑 高数第三章' }).click();
    await page.getByLabel('标题', { exact: true }).fill('LongTitle'.repeat(13));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
  test(`桌面布局 ${width}px，路由刷新和无控制台异常`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    for (const name of ['概览', '待办清单', '习惯打卡', '收支账本', '自习记录']) {
      await navigate(page, name);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.reload();
    await expect(page.locator('main h1')).toHaveText('自习记录');
    await page.goBack();
    expect(errors).toEqual([]);
  });
}

test('多个标签页到期只结算一次，变更同步可见', async ({ page, context }) => {
  const snapshot = createInitialSnapshot();
  snapshot.timer = {
    phase: 'focus',
    status: 'running',
    remainingMs: 1500000,
    deadline: Date.now() + 1800,
    sessionId: crypto.randomUUID(),
    subjectId: snapshot.data.subjects[0]!.id,
  };
  await seed(page, snapshot);
  const other = await context.newPage();
  await other.goto('/');
  await expect(page.getByRole('button', { name: '开始休息' })).toBeVisible();
  await expect(other.getByRole('button', { name: '开始休息' })).toBeVisible();
  expect((await read(page)).data.studyRecords).toHaveLength(1);
  await other.close();
});

test('编辑中的待办保留另一标签页更新的完成与置顶状态', async ({ page, context }) => {
  const snapshot = createInitialSnapshot();
  snapshot.data.todos.push({
    id: crypto.randomUUID(),
    title: '跨页任务',
    note: '',
    done: false,
    pinned: false,
    priority: 'P1',
    createdAt: 1,
    updatedAt: 1,
  });
  await seed(page, snapshot);
  await navigate(page, '待办清单');
  await page.getByRole('button', { name: '编辑 跨页任务' }).click();
  const other = await context.newPage();
  await other.goto('/#/todos');
  await other.getByRole('button', { name: '置顶 跨页任务', exact: true }).click();
  await expect(other.getByRole('button', { name: '取消置顶 跨页任务' })).toBeVisible();
  await other.getByRole('button', { name: '完成 跨页任务', exact: true }).click();
  await expect(other.getByText('待办已全部完成')).toBeVisible();
  await page.getByLabel('标题', { exact: true }).fill('更新标题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).data.todos[0]).toMatchObject({
    title: '更新标题',
    pinned: true,
    done: true,
  });
  await other.close();
});

test('设置新增自定义分类和科目，记录中可选择且刷新保留', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '设置与备份' }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('数码设备');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '新增科目', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('计算机科学');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await navigate(page, '收支账本');
  await page.getByRole('button', { name: '记一笔' }).first().click();
  await page.getByLabel('分类', { exact: true }).selectOption({ label: '数码设备' });
  await page.keyboard.press('Escape');
  await navigate(page, '自习记录');
  await page.getByRole('button', { name: '记录自习' }).first().click();
  await page.getByLabel('科目', { exact: true }).selectOption({ label: '计算机科学' });
  await page.getByLabel('标题', { exact: true }).fill('学习数据结构');
  await page.getByLabel('时长（分钟）').fill('60');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('学习数据结构', { exact: true })).toBeVisible();
});

test.describe('跨日刷新', () => {
  test.use({ timezoneId: 'Asia/Shanghai' });
  test('凌晨更新今日日期，昨天的打卡不会算到今天', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-10T23:59:58+08:00') });
    const snapshot = createInitialSnapshot();
    snapshot.data.habits.push({
      id: crypto.randomUUID(),
      title: '夜间阅读',
      note: '',
      createdAt: 1,
      updatedAt: 1,
      log: { '2026-10-10': true },
    });
    await seed(page, snapshot);
    await expect(
      page.getByRole('button', { name: '夜间阅读 2026-10-11 打卡', exact: true }),
    ).toBeDisabled();
    await page.clock.fastForward(3000);
    await expect(page.getByText('10月11日星期日', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '夜间阅读 2026-10-11 打卡', exact: true }),
    ).toBeEnabled();
    expect((await read(page)).data.habits[0]?.log).toEqual({ '2026-10-10': true });
  });
});
