import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeatherCard } from './Weather';
import { fetchWeather, searchCities } from './client';
import { weatherDate, WEATHER_STORAGE_KEY } from './model';
import type { WeatherData, WeatherLocation } from './model';
import { addDays } from '../../shared/date';

vi.mock('./client', () => ({ fetchWeather: vi.fn(), searchCities: vi.fn() }));
const beijing: WeatherLocation = {
  source: 'city',
  name: '北京',
  region: '北京市 · 中国',
  latitude: 39.9,
  longitude: 116.4,
};
const shanghai: WeatherLocation = {
  ...beijing,
  name: '上海',
  region: '上海市 · 中国',
  latitude: 31.2,
  longitude: 121.5,
};
function weatherData(): WeatherData {
  const today = weatherDate('Asia/Shanghai');
  return {
    timezone: 'Asia/Shanghai',
    fetchedAt: Date.now(),
    current: { temperature: 0, code: 0, isDay: false },
    days: Array.from({ length: 4 }, (_, index) => ({
      date: addDays(today, index),
      code: index === 1 ? 61 : 0,
      high: 10 + index,
      low: 0,
      precipitation: 0,
    })),
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchWeather)
    .mockReset()
    .mockImplementation(async () => weatherData());
  vi.mocked(searchCities).mockReset().mockResolvedValue([beijing, shanghai]);
  vi.stubGlobal('isSecureContext', false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('未设置位置时不自动定位，定位失败后可搜索并选择城市、展示三天预报', async () => {
  const user = userEvent.setup();
  render(<WeatherCard />);
  expect(fetchWeather).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '使用当前位置' }));
  expect(screen.getByText(/当前环境不支持定位/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '手动选择城市' }));
  await user.type(screen.getByLabelText('城市名称'), '北京');
  await user.click(screen.getByRole('button', { name: '搜索城市' }));
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByText('北京市 · 中国')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '上海 上海市 · 中国' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('上海')).toBeInTheDocument();
  expect(await screen.findByText('今日 0° / 10°')).toBeInTheDocument();
  const forecast = screen.getByLabelText('未来三天天气');
  expect(within(forecast).getByText('明天')).toBeInTheDocument();
  expect(within(forecast).getByText('后天')).toBeInTheDocument();
  expect(within(forecast).getByText('小雨')).toBeInTheDocument();
  expect(within(forecast).getAllByText('降水 0%')).toHaveLength(3);
  expect(vi.mocked(fetchWeather).mock.calls[0]?.[0].name).toBe('上海');
});

it('取消城市弹窗恢复焦点；输入改变时忽略旧搜索结果', async () => {
  let resolveSearch!: (value: WeatherLocation[]) => void;
  vi.mocked(searchCities).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<WeatherCard />);
  const open = screen.getByRole('button', { name: '选择城市' });
  await user.click(open);
  const input = screen.getByLabelText('城市名称');
  await user.type(input, '北京');
  await user.click(screen.getByRole('button', { name: '搜索城市' }));
  await user.clear(input);
  await user.type(input, '上海');
  resolveSearch([beijing]);
  await waitFor(() => expect(screen.queryByText('北京市 · 中国')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: '搜索城市' }));
  expect(await screen.findByText('上海市 · 中国')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(open).toHaveFocus();
});

it('缓存缺失字段显示占位值；刷新失败保留数据并提供重试', async () => {
  const data = weatherData();
  data.current = { temperature: null, code: 999, isDay: true };
  data.days = [];
  localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ location: beijing, data }));
  vi.mocked(fetchWeather).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<WeatherCard />);
  expect(screen.getByText('今日 — / —')).toBeInTheDocument();
  expect(screen.getAllByText('天气未知')).toHaveLength(4);
  await user.click(screen.getByRole('button', { name: '刷新天气' }));
  expect(await screen.findByText(/天气暂时无法获取/)).toBeInTheDocument();
  expect(screen.getByText('今日 — / —')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('今日 0° / 10°')).toBeInTheDocument();
});

it('城市搜索无结果与错误时保留输入并允许重试', async () => {
  vi.mocked(searchCities).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<WeatherCard />);
  await user.click(screen.getByRole('button', { name: '选择城市' }));
  await user.type(screen.getByLabelText('城市名称'), '未知城市');
  const search = screen.getByRole('button', { name: '搜索城市' });
  await user.click(search);
  expect(await screen.findByText(/没有找到城市/)).toBeInTheDocument();
  await user.click(search);
  expect(await screen.findByText(/城市搜索失败/)).toBeInTheDocument();
  expect(screen.getByLabelText('城市名称')).toHaveValue('未知城市');
});
