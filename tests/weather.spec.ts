import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { WEATHER_STORAGE_KEY } from '../src/features/weather/model';

test.use({ timezoneId: 'Asia/Shanghai' });

async function mockWeather(page: Page) {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00+08:00') });
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        results: [
          { name: '北京', latitude: 39.9, longitude: 116.4, admin1: '北京市', country: '中国' },
          { name: '上海', latitude: 31.2, longitude: 121.5, admin1: '上海市', country: '中国' },
        ],
      },
    }),
  );
  await page.route('https://api.open-meteo.com/**', (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('forecast_days')).toBe('4');
    expect(url.searchParams.get('timezone')).toBe('auto');
    return route.fulfill({
      json: {
        timezone: 'Asia/Shanghai',
        current: {
          temperature_2m: Number(url.searchParams.get('latitude')) > 35 ? 18 : 24,
          weather_code: 2,
          is_day: 1,
        },
        daily: {
          time: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'],
          weather_code: [2, 61, 0, 3],
          temperature_2m_max: [22, 20, 24, 23],
          temperature_2m_min: [12, 11, 13, 14],
          precipitation_probability_max: [10, 70, 0, 20],
        },
      },
    });
  });
}
async function selectCity(page: Page, name = '北京') {
  await page.getByRole('button', { name: /^(选择城市|切换城市)$/ }).click();
  await page.getByLabel('城市名称').fill(name);
  await page.getByRole('button', { name: '搜索城市' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: name === '北京' ? '北京 北京市 · 中国' : '上海 上海市 · 中国' })
    .click();
}

test('定位授权、三天预报、缓存恢复、城市切换和刷新失败重试', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 39.9, longitude: 116.4 });
  await mockWeather(page);
  await page.goto('/');
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '天气', exact: true }) });
  await expect(card.getByText('看看今天的天气，再安排出发。')).toBeVisible();
  await page.getByRole('button', { name: '使用当前位置' }).click();
  await expect(card.getByText('当前位置', { exact: true })).toBeVisible();
  await expect(card.getByText('18°C', { exact: true })).toBeVisible();
  const forecast = page.getByLabel('未来三天天气');
  await expect(forecast.getByText('明天', { exact: true })).toBeVisible();
  await expect(forecast.getByText('后天', { exact: true })).toBeVisible();
  await expect(forecast.getByText('10/13', { exact: true })).toBeVisible();
  await expect(forecast.getByText('降水 70%', { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText('18°C', { exact: true })).toBeVisible();
  await selectCity(page, '上海');
  await expect(card.getByText('上海', { exact: true })).toBeVisible();
  await expect(card.getByText('24°C', { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText('上海', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).location.source,
      WEATHER_STORAGE_KEY,
    ),
  ).toBe('city');
  await page.route('https://api.open-meteo.com/**', (route) => route.abort());
  await page.getByRole('button', { name: '刷新天气' }).click();
  await expect(card.getByText(/天气暂时无法获取/)).toBeVisible();
  await expect(card.getByText('24°C', { exact: true })).toBeVisible();
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        timezone: 'Asia/Shanghai',
        current: { temperature_2m: 25 },
        daily: { time: ['2026-10-10'] },
      },
    }),
  );
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(card.getByText('25°C', { exact: true })).toBeVisible();
  await expect(card.getByText('今日 — / —', { exact: true })).toBeVisible();
  await expect(card.getByText(/天气暂时无法获取/)).toHaveCount(0);
});

test('拒绝定位后可手动选择城市；取消弹窗恢复焦点', async ({ page }) => {
  await mockWeather(page);
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) =>
      error?.({
        code: 1,
        message: 'denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '使用当前位置' }).click();
  await expect(page.getByText(/定位权限未开启/)).toBeVisible();
  const open = page.getByRole('button', { name: '选择城市', exact: true });
  await open.click();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await selectCity(page);
  await expect(page.getByText('18°C', { exact: true })).toBeVisible();
});

for (const width of [1280, 1440, 1920]) {
  test(`天气卡片 ${width}px 亮暗主题与页面导航`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light' });
    await mockWeather(page);
    await page.goto('/');
    await selectCity(page);
    await expect(page.getByText('18°C', { exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: '切换到暗色模式' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `test-results/weather-${width}-${theme}.png`, fullPage: true });
    }
    await page.getByRole('navigation').getByRole('link', { name: '待办清单' }).click();
    await expect(page.getByRole('heading', { name: '天气', exact: true })).toHaveCount(0);
    await page.getByRole('navigation').getByRole('link', { name: '概览', exact: true }).click();
    await expect(page.getByText('18°C', { exact: true })).toBeVisible();
  });
}
