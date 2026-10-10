import { test as base, expect } from '@playwright/test';
import type { Page, Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudSchema } from '../src/data/cloud-schema';
import { createInitialSnapshot } from '../src/data/defaults';
import type { CloudSnapshot } from '../src/data/cloud-schema';

interface Accounts {
  email: string;
  otherEmail: string;
  password: string;
  api: SupabaseClient;
  other: SupabaseClient;
}
const test = base.extend<{ accounts: Accounts }>({
  accounts: async ({ browserName }, run) => {
    const url = process.env.SUPABASE_TEST_URL!;
    const key = process.env.SUPABASE_TEST_ANON_KEY!;
    const admin = createClient(url, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `Workbench-${crypto.randomUUID()}`;
    const emails = [
      `workbench-${browserName}-${crypto.randomUUID()}@example.test`,
      `workbench-${browserName}-${crypto.randomUUID()}@example.test`,
    ];
    const ids: string[] = [];
    const clients: SupabaseClient[] = [];
    try {
      for (const email of emails) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) throw error;
        ids.push(data.user.id);
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
        clients.push(client);
      }
      await run({
        email: emails[0]!,
        otherEmail: emails[1]!,
        password,
        api: clients[0]!,
        other: clients[1]!,
      });
    } finally {
      for (const client of clients) await client.auth.signOut();
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
  },
});
async function read(api: SupabaseClient): Promise<CloudSnapshot> {
  const { data, error } = await api.rpc('read_workbench');
  if (error) throw error;
  return cloudSchema.parse(data);
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('云端已同步', { exact: true })).toBeVisible();
}
async function pair(browser: Browser, accounts: Accounts) {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  await Promise.all(pages.map((page) => login(page, accounts.email, accounts.password)));
  return {
    a: pages[0]!,
    b: pages[1]!,
    contexts,
    close: async () => {
      await Promise.all(contexts.map((context) => context.close()));
    },
  };
}
async function createTodo(page: Page, title: string) {
  await page.goto('/#/todos');
  await page.getByRole('button', { name: '新建待办', exact: true }).first().click();
  await page.getByLabel('标题', { exact: true }).fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('真实 Supabase：两浏览器自动同步新增、修改、删除和字典', async ({ browser, accounts }) => {
  const devices = await pair(browser, accounts);
  const { a, b } = devices;
  try {
    await b.goto('/#/todos');
    await createTodo(a, '跨电脑待办');
    await expect(b.getByText('跨电脑待办', { exact: true })).toBeVisible({ timeout: 15000 });
    await a.getByRole('button', { name: '编辑 跨电脑待办', exact: true }).click();
    await a.getByLabel('标题', { exact: true }).fill('同步后的标题');
    await a.getByRole('button', { name: '保存', exact: true }).click();
    await expect(b.getByText('同步后的标题', { exact: true })).toBeVisible({ timeout: 15000 });
    await a.getByRole('button', { name: '删除 同步后的标题', exact: true }).click();
    await a.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(b.getByText('同步后的标题', { exact: true })).toHaveCount(0);
    await a.goto('/#/settings');
    await b.goto('/#/settings');
    await a.getByRole('button', { name: '改名科目 语文', exact: true }).click();
    await a.getByLabel('名称', { exact: true }).fill('共享科目');
    await a.getByRole('button', { name: '保存', exact: true }).click();
    await expect(b.getByText('共享科目', { exact: true })).toBeVisible({ timeout: 15000 });
  } finally {
    await devices.close();
  }
});

test('真实 Supabase：旧表单保存被阻止并保留输入', async ({ browser, accounts }) => {
  const devices = await pair(browser, accounts);
  const { a, b } = devices;
  try {
    await createTodo(a, '编辑冲突');
    await b.goto('/#/todos');
    await expect(b.getByText('编辑冲突', { exact: true })).toBeVisible({ timeout: 15000 });
    await b.getByRole('button', { name: '编辑 编辑冲突', exact: true }).click();
    await b.getByLabel('标题', { exact: true }).fill('未丢弃的输入');
    const current = await read(accounts.api);
    current.data.subjects[0]!.name = '另一个设备修改';
    const saved = await accounts.api.rpc('commit_workbench', {
      p_data: current.data,
      p_expected_revision: current.revision,
    });
    expect(saved.error).toBeNull();
    await expect
      .poll(async () =>
        b.evaluate(() => {
          const raw = Object.entries(localStorage).find(([key]) =>
            key.startsWith('personal-workbench-cloud-v1:'),
          )?.[1];
          return raw ? JSON.parse(raw).cloud.revision : -1;
        }),
      )
      .toBe(current.revision + 1);
    await b.getByRole('button', { name: '保存', exact: true }).click();
    await expect(b.getByRole('alert')).toContainText('重新保存');
    await expect(b.getByLabel('标题', { exact: true })).toHaveValue('未丢弃的输入');
    expect((await read(accounts.api)).data.todos[0]?.title).toBe('编辑冲突');
  } finally {
    await devices.close();
  }
});

test('真实 Supabase：独立计时、离线补交与缓存只读', async ({ browser, accounts }) => {
  const devices = await pair(browser, accounts);
  const { a, b } = devices;
  try {
    await a.goto('/#/study');
    await b.goto('/#/study');
    await a.getByRole('button', { name: '开始专注', exact: true }).click();
    await expect(a.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: '开始专注', exact: true })).toBeVisible();
    await a.evaluate(() => {
      const entry = Object.entries(localStorage).find(([key]) =>
        key.startsWith('personal-workbench-cloud-v1:'),
      )!;
      const state = JSON.parse(entry[1]);
      state.timer.deadline = Date.now() + 2500;
      localStorage.setItem(entry[0], JSON.stringify(state));
    });
    await a.reload();
    await expect(a.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
    await devices.contexts[0]!.setOffline(true);
    await expect(a.getByText('离线 · 仅供查看', { exact: true })).toBeVisible();
    await expect(a.getByText('1 条计时记录待上传', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    expect((await read(accounts.api)).data.studyRecords).toHaveLength(0);
    await devices.contexts[0]!.setOffline(false);
    await expect.poll(async () => (await read(accounts.api)).data.studyRecords.length).toBe(1);
    await expect(b.getByText('番茄钟专注', { exact: true })).toBeVisible({ timeout: 15000 });
    await a.goto('/#/todos');
    await devices.contexts[0]!.setOffline(true);
    await expect(a.getByRole('button', { name: '新建待办', exact: true }).first()).toBeDisabled();
  } finally {
    await devices.close();
  }
});

test('真实 Supabase：登录恢复、退出及另一个账号的数据隔离', async ({ page, accounts }) => {
  await login(page, accounts.email, accounts.password);
  await createTodo(page, '只属于第一个账号');
  await page.reload();
  await expect(page.getByText('只属于第一个账号', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录我的工作台' })).toBeVisible();
  await login(page, accounts.otherEmail, accounts.password);
  await page.goto('/#/todos');
  await expect(page.getByText('只属于第一个账号', { exact: true })).toHaveCount(0);
  const owner = (await accounts.api.auth.getUser()).data.user!.id;
  const forbidden = await accounts.other.from('todos').select('*').eq('owner_id', owner);
  expect(forbidden.error).toBeNull();
  expect(forbidden.data).toEqual([]);
  const direct = await accounts.api.from('todos').delete().eq('owner_id', owner);
  expect(direct.error).not.toBeNull();
});

test('真实 Supabase：并发事务只有一个版本成功，导入重置所有设备计时', async ({
  browser,
  accounts,
}) => {
  const state = await read(accounts.api);
  const results = await Promise.all([
    accounts.api.rpc('commit_workbench', {
      p_data: state.data,
      p_expected_revision: state.revision,
    }),
    accounts.api.rpc('commit_workbench', {
      p_data: state.data,
      p_expected_revision: state.revision,
    }),
  ]);
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error?.message).toContain('WORKBENCH_CONFLICT');
  const devices = await pair(browser, accounts);
  const { a, b } = devices;
  try {
    await a.goto('/#/study');
    await b.goto('/#/study');
    await a.getByRole('button', { name: '开始专注', exact: true }).click();
    await b.getByRole('button', { name: '开始专注', exact: true }).click();
    const current = await read(accounts.api);
    const imported = await accounts.api.rpc('replace_workbench', {
      p_data: createInitialSnapshot().data,
      p_expected_revision: current.revision,
    });
    expect(imported.error).toBeNull();
    await expect(a.getByRole('button', { name: '开始专注', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(b.getByRole('button', { name: '开始专注', exact: true })).toBeVisible({
      timeout: 15000,
    });
  } finally {
    await devices.close();
  }
});
