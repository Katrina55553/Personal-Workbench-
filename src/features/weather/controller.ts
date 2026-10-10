import { fetchWeather } from './client';
import {
  cacheSchema,
  isWeatherStale,
  locationSchema,
  weatherDate,
  WEATHER_STORAGE_KEY,
  WEATHER_TTL,
} from './model';
import type { WeatherData, WeatherLocation } from './model';

type WeatherState = {
  location: WeatherLocation | null;
  data: WeatherData | null;
  loading: boolean;
  locating: boolean;
  error: string;
  storageWarning: string;
  now: number;
};

function readCache() {
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    const result = raw && cacheSchema.safeParse(JSON.parse(raw));
    return result && result.success ? result.data : null;
  } catch {
    return null;
  }
}

export class WeatherController {
  private state: WeatherState;
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private request: AbortController | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastAttempt = -Infinity;

  constructor() {
    const cache = readCache();
    this.state = {
      location: cache?.location ?? null,
      data: cache?.data ?? null,
      loading: false,
      locating: false,
      error: '',
      storageWarning: '',
      now: Date.now(),
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<WeatherState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private persist() {
    if (!this.state.location) return;
    try {
      localStorage.setItem(
        WEATHER_STORAGE_KEY,
        JSON.stringify({
          location: this.state.location,
          data: this.state.data,
        }),
      );
      this.update({ storageWarning: '' });
    } catch {
      this.update({ storageWarning: '天气偏好未能保存，刷新页面后可能需要重新选择位置。' });
    }
  }

  start() {
    this.active = true;
    this.update({ loading: false, locating: false });
    this.check(true);
    this.interval = setInterval(() => this.check(false), 60_000);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  stop() {
    this.active = false;
    this.generation++;
    this.request?.abort();
    if (this.interval) clearInterval(this.interval);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    window.removeEventListener('online', this.onVisible);
  }

  private onVisible = () => this.check(true);
  private check(forceRetry: boolean) {
    if (!this.active || document.visibilityState === 'hidden') return;
    this.update({ now: Date.now() });
    if (
      this.state.location &&
      !this.state.loading &&
      !this.state.locating &&
      isWeatherStale(this.state.data) &&
      (forceRetry ||
        Date.now() - this.lastAttempt >= WEATHER_TTL ||
        (this.state.data &&
          Number.isFinite(this.lastAttempt) &&
          weatherDate(this.state.data.timezone) !==
            weatherDate(this.state.data.timezone, this.lastAttempt)))
    )
      void this.refresh();
  }

  selectLocation = (location: WeatherLocation) => {
    if (!this.active) return;
    this.generation++;
    this.request?.abort();
    this.update({
      location: locationSchema.parse(location),
      data: null,
      locating: false,
      error: '',
    });
    this.persist();
    void this.refresh();
  };

  refresh = async () => {
    if (!this.active || !this.state.location) return;
    const generation = ++this.generation;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.lastAttempt = Date.now();
    this.update({ loading: true, locating: false, error: '' });
    try {
      const data = await fetchWeather(this.state.location, request.signal);
      if (!this.active || generation !== this.generation) return;
      this.update({ data, loading: false, now: Date.now() });
      this.persist();
    } catch {
      if (!this.active || generation !== this.generation) return;
      this.update({ loading: false, error: '天气暂时无法获取，请检查网络后重试。' });
    }
  };

  locate = () => {
    if (!this.active) return;
    const generation = ++this.generation;
    this.request?.abort();
    this.update({ locating: true, loading: false, error: '' });
    const fail = (message: string) => {
      if (this.active && generation === this.generation)
        this.update({ locating: false, error: message });
    };
    if (!window.isSecureContext || !navigator.geolocation) {
      fail('当前环境不支持定位，请手动选择城市。');
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!this.active || generation !== this.generation) return;
          const result = locationSchema.safeParse({
            source: 'geolocation',
            name: '当前位置',
            region: '',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          if (result.success) this.selectLocation(result.data);
          else fail('定位结果无效，请手动选择城市。');
        },
        (error) =>
          fail(
            error.code === 1
              ? '定位权限未开启，请手动选择城市。'
              : error.code === 3
                ? '定位超时，请重试或手动选择城市。'
                : '无法获取位置，请手动选择城市。',
          ),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
      );
    } catch {
      fail('无法获取位置，请手动选择城市。');
    }
  };
}
