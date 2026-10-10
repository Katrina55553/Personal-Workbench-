import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WeatherController } from './controller';
import { fetchWeather } from './client';
import { WEATHER_STORAGE_KEY, WEATHER_TTL } from './model';
import type { WeatherData, WeatherLocation } from './model';

vi.mock('./client', () => ({ fetchWeather: vi.fn() }));
const fetchMock = vi.mocked(fetchWeather);
const location: WeatherLocation = {
  source: 'city',
  name: '北京',
  region: '中国',
  latitude: 39.9,
  longitude: 116.4,
};
const controllers: WeatherController[] = [];
const data = (): WeatherData => ({
  timezone: 'Asia/Shanghai',
  fetchedAt: Date.now(),
  current: { temperature: 20, code: 0, isDay: true },
  days: [],
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const start = () => {
  const controller = new WeatherController();
  controllers.push(controller);
  controller.start();
  return controller;
};
function cache(value = data()) {
  localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ location, data: value }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T04:00:00Z'));
  localStorage.clear();
  fetchMock.mockReset().mockImplementation(async () => data());
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.stop());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('新用户不自动请求定位或天气，损坏缓存不会使概览崩溃', () => {
  localStorage.setItem(WEATHER_STORAGE_KEY, '{broken');
  const controller = start();
  expect(controller.getSnapshot().location).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('立即显示新鲜缓存，三十分钟后刷新；停止后不再请求', async () => {
  cache();
  const controller = start();
  expect(controller.getSnapshot().data?.current.temperature).toBe(20);
  expect(fetchMock).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(WEATHER_TTL);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  controller.stop();
  await vi.advanceTimersByTimeAsync(WEATHER_TTL);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('所在地跨日时即使未满三十分钟也刷新', async () => {
  vi.setSystemTime(new Date('2026-10-10T15:50:00Z'));
  cache();
  start();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('隐藏页面暂停自动请求，返回时刷新过期缓存', async () => {
  cache();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  start();
  await vi.advanceTimersByTimeAsync(WEATHER_TTL);
  expect(fetchMock).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('请求失败保留缓存与更新时间，手动重试恢复', async () => {
  const original = { ...data(), fetchedAt: Date.now() - WEATHER_TTL };
  cache(original);
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  const controller = start();
  await flush();
  expect(controller.getSnapshot().data).toEqual(original);
  expect(controller.getSnapshot().error).toContain('天气暂时无法获取');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await controller.refresh();
  expect(controller.getSnapshot().error).toBe('');
  expect(controller.getSnapshot().data?.fetchedAt).toBe(Date.now());
});

it('切换城市中止旧请求，并忽略迟到的旧响应', async () => {
  let resolveOld!: (value: WeatherData) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const controller = start();
  controller.selectLocation(location);
  const oldSignal = fetchMock.mock.calls[0]![1];
  const nextLocation = { ...location, name: '上海', latitude: 31.2, longitude: 121.5 };
  controller.selectLocation(nextLocation);
  await flush();
  resolveOld({ ...data(), current: { temperature: 99, code: 0, isDay: true } });
  await flush();
  expect(oldSignal.aborted).toBe(true);
  expect(controller.getSnapshot().location?.name).toBe('上海');
  expect(controller.getSnapshot().data?.current.temperature).toBe(20);
  expect(JSON.parse(localStorage.getItem(WEATHER_STORAGE_KEY)!).location.name).toBe('上海');
});

it('定位成功保存当前位置，但切换城市后忽略迟到的定位回调', async () => {
  let success!: PositionCallback;
  const getCurrentPosition = vi.fn((callback: PositionCallback) => {
    success = callback;
  });
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const controller = start();
  controller.locate();
  expect(controller.getSnapshot().locating).toBe(true);
  const position: GeolocationPosition = {
    timestamp: Date.now(),
    coords: {
      latitude: 40,
      longitude: 116,
      accuracy: 100,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    toJSON: () => ({}),
  };
  success(position);
  await flush();
  expect(controller.getSnapshot().location?.source).toBe('geolocation');
  expect(controller.getSnapshot().location?.name).toBe('当前位置');
  controller.locate();
  controller.selectLocation(location);
  success(position);
  await flush();
  expect(controller.getSnapshot().location?.name).toBe('北京');
});

it.each([
  [1, '定位权限未开启'],
  [2, '无法获取位置'],
  [3, '定位超时'],
])('定位错误 %s 提示手动选择', (code, message) => {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
        error({ code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
    },
  });
  const controller = start();
  controller.locate();
  expect(controller.getSnapshot().error).toContain(message);
  expect(controller.getSnapshot().locating).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('不安全上下文降级为城市选择，存储失败仍能显示天气', async () => {
  vi.stubGlobal('isSecureContext', false);
  const controller = start();
  controller.locate();
  expect(controller.getSnapshot().error).toContain('不支持定位');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  controller.selectLocation(location);
  await flush();
  expect(controller.getSnapshot().data?.current.temperature).toBe(20);
  expect(controller.getSnapshot().storageWarning).toContain('未能保存');
});

it('停止后忽略未完成请求，重新开始可以恢复加载', async () => {
  let resolveOld!: (value: WeatherData) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const controller = start();
  controller.selectLocation(location);
  controller.stop();
  controller.start();
  await flush();
  resolveOld({ ...data(), current: { temperature: 99, code: 0, isDay: true } });
  await flush();
  expect(controller.getSnapshot().data?.current.temperature).toBe(20);
  expect(controller.getSnapshot().loading).toBe(false);
});
