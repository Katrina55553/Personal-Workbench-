import { afterEach, expect, it, vi } from 'vitest';
import { fetchWeather, searchCities } from './client';
import { isWeatherStale, precipitation, temperature, weatherCondition, weatherDate } from './model';
import type { WeatherLocation } from './model';
import { Cloud, Moon, Sun } from 'lucide-react';

const location: WeatherLocation = {
  source: 'city',
  name: '北京',
  region: '中国',
  latitude: 39.9,
  longitude: 116.4,
};
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

it('请求四天天气并保留缺失字段，零度与零降水正确显示', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      timezone: 'Asia/Shanghai',
      current: { temperature_2m: 0, weather_code: 0, is_day: 0 },
      daily: {
        time: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'],
        temperature_2m_max: [0, 10],
        precipitation_probability_max: [0, null],
      },
    }),
  });
  vi.stubGlobal('fetch', fetch);
  const data = await fetchWeather(location, signal());
  const url = new URL(fetch.mock.calls[0]![0]);
  expect(url.searchParams.get('timezone')).toBe('auto');
  expect(url.searchParams.get('forecast_days')).toBe('4');
  expect(url.searchParams.get('temperature_unit')).toBe('celsius');
  expect(data.current).toEqual({ temperature: 0, code: 0, isDay: false });
  expect(data.days[3]).toEqual({
    date: '2026-10-13',
    high: null,
    low: null,
    precipitation: null,
    code: null,
  });
  expect(temperature(0)).toBe('0°');
  expect(temperature(null)).toBe('—');
  expect(precipitation(0)).toBe('0%');
  expect(precipitation(undefined)).toBe('—');
});

it('中文城市搜索保留同名候选及地区，不自动选择第一个', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        { name: '北京', latitude: 39.9, longitude: 116.4, admin1: '北京市', country: '中国' },
        { name: '北京', latitude: 30.7, longitude: 108.6, admin1: '重庆市', country: '中国' },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(await searchCities('北', signal())).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  const results = await searchCities(' 北京 ', signal());
  expect(new URL(fetch.mock.calls[0]![0]).searchParams.get('name')).toBe('北京');
  expect(results.map((city) => city.region)).toEqual(['北京市 · 中国', '重庆市 · 中国']);
  expect(results[0]?.source).toBe('city');
});

it('城市不存在时返回空列表，HTTP 或无效时区报错', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ timezone: 'bad-zone', current: {}, daily: { time: [] } }),
    });
  vi.stubGlobal('fetch', fetch);
  expect(await searchCities('未知', signal())).toEqual([]);
  await expect(fetchWeather(location, signal())).rejects.toThrow('503');
  await expect(fetchWeather(location, signal())).rejects.toThrow();
});

it('中止信号传递给底层请求', async () => {
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal ?? undefined;
          requestSignal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ),
  );
  const controller = new AbortController();
  const result = fetchWeather(location, controller.signal);
  controller.abort();
  await expect(result).rejects.toThrow('Aborted');
  expect(requestSignal?.aborted).toBe(true);
});

it('映射晴夜、雨雪雷暴与未知代码', () => {
  expect(weatherCondition(0).Icon).toBe(Sun);
  expect(weatherCondition(0, false).Icon).toBe(Moon);
  for (const code of [
    1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95,
    96, 97, 99,
  ]) {
    expect(weatherCondition(code).label).not.toBe('天气未知');
  }
  expect(weatherCondition(999)).toEqual({ label: '天气未知', Icon: Cloud });
});

it('缓存按三十分钟和所在地跨日失效，而非浏览器日期', () => {
  const fetchedAt = new Date('2026-10-10T15:50:00Z').getTime();
  const data = {
    timezone: 'Asia/Shanghai',
    fetchedAt,
    current: { temperature: 0, code: 0, isDay: true },
    days: [],
  };
  expect(weatherDate('Asia/Shanghai', fetchedAt)).toBe('2026-10-10');
  expect(isWeatherStale(data, fetchedAt + 5 * 60_000)).toBe(false);
  expect(isWeatherStale(data, fetchedAt + 10 * 60_000)).toBe(true);
  expect(isWeatherStale({ ...data, timezone: 'UTC' }, fetchedAt + 29 * 60_000)).toBe(false);
  expect(isWeatherStale({ ...data, timezone: 'UTC' }, fetchedAt + 30 * 60_000)).toBe(true);
});
