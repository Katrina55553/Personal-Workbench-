import { z } from 'zod';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';
import { isDate } from '../../shared/date';

export const WEATHER_STORAGE_KEY = 'personal-workbench-weather-v1';
export const WEATHER_TTL = 30 * 60 * 1000;

const dateSchema = z.string().refine(isDate);
const nullableNumber = z.number().finite().nullable();
const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
});

export const locationSchema = z.object({
  source: z.enum(['geolocation', 'city']),
  name: z.string().min(1),
  region: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const weatherSchema = z.object({
  timezone: timezoneSchema,
  fetchedAt: z.number().finite().nonnegative(),
  current: z.object({
    temperature: nullableNumber,
    code: nullableNumber,
    isDay: z.boolean(),
  }),
  days: z.array(
    z.object({
      date: dateSchema,
      code: nullableNumber,
      high: nullableNumber,
      low: nullableNumber,
      precipitation: nullableNumber,
    }),
  ),
});
export const cacheSchema = z.object({
  location: locationSchema,
  data: weatherSchema.nullable(),
});
export type WeatherLocation = z.infer<typeof locationSchema>;
export type WeatherData = z.infer<typeof weatherSchema>;

export function weatherDate(timezone: string, time = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isWeatherStale(data: WeatherData | null, now = Date.now()): boolean {
  return (
    !data ||
    now < data.fetchedAt ||
    now - data.fetchedAt >= WEATHER_TTL ||
    weatherDate(data.timezone, now) !== weatherDate(data.timezone, data.fetchedAt)
  );
}

export function temperature(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}°`;
}
export function precipitation(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`;
}

export function weatherCondition(code: number | null | undefined, isDay = true) {
  switch (code) {
    case 0:
      return { label: '晴', Icon: isDay ? Sun : Moon };
    case 1:
      return { label: '晴间多云', Icon: isDay ? CloudSun : CloudMoon };
    case 2:
      return { label: '多云', Icon: isDay ? CloudSun : CloudMoon };
    case 3:
      return { label: '阴', Icon: Cloud };
    case 45:
      return { label: '雾', Icon: CloudFog };
    case 48:
      return { label: '雾凇', Icon: CloudFog };
    case 51:
    case 53:
    case 55:
      return { label: { 51: '小毛毛雨', 53: '毛毛雨', 55: '强毛毛雨' }[code], Icon: CloudDrizzle };
    case 56:
    case 57:
      return { label: '冻毛毛雨', Icon: CloudDrizzle };
    case 61:
    case 63:
    case 65:
      return { label: { 61: '小雨', 63: '中雨', 65: '大雨' }[code], Icon: CloudRain };
    case 66:
    case 67:
      return { label: '冻雨', Icon: CloudRain };
    case 71:
    case 73:
    case 75:
      return { label: { 71: '小雪', 73: '中雪', 75: '大雪' }[code], Icon: CloudSnow };
    case 77:
      return { label: '雪粒', Icon: CloudSnow };
    case 80:
    case 81:
    case 82:
      return { label: code === 82 ? '强阵雨' : '阵雨', Icon: CloudRain };
    case 85:
    case 86:
      return { label: '阵雪', Icon: CloudSnow };
    case 95:
    case 97:
      return { label: code === 97 ? '强雷暴' : '雷暴', Icon: CloudLightning };
    case 96:
    case 99:
      return { label: '雷暴伴冰雹', Icon: CloudHail };
    default:
      return { label: '天气未知', Icon: Cloud };
  }
}
