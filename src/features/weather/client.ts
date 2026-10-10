import { z } from 'zod';
import { weatherSchema } from './model';
import type { WeatherData, WeatherLocation } from './model';
import { isDate } from '../../shared/date';

const optionalNumber = z.number().finite().nullish();
const forecastSchema = z.object({
  timezone: z.string(),
  current: z.object({
    temperature_2m: optionalNumber,
    weather_code: optionalNumber,
    is_day: optionalNumber,
  }),
  daily: z.object({
    time: z.array(z.string().refine(isDate)),
    weather_code: z.array(optionalNumber).optional(),
    temperature_2m_max: z.array(optionalNumber).optional(),
    temperature_2m_min: z.array(optionalNumber).optional(),
    precipitation_probability_max: z.array(optionalNumber).optional(),
  }),
});
const citiesSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().min(1),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        admin1: z.string().optional(),
        admin2: z.string().optional(),
        country: z.string().optional(),
      }),
    )
    .optional(),
});

async function requestJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

export async function fetchWeather(
  location: WeatherLocation,
  signal: AbortSignal,
): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    temperature_unit: 'celsius',
    forecast_days: '4',
  }).toString();
  const result = forecastSchema.parse(await requestJson(url, signal));
  return weatherSchema.parse({
    timezone: result.timezone,
    fetchedAt: Date.now(),
    current: {
      temperature: result.current.temperature_2m ?? null,
      code: result.current.weather_code ?? null,
      isDay: result.current.is_day !== 0,
    },
    days: result.daily.time.map((date, index) => ({
      date,
      code: result.daily.weather_code?.[index] ?? null,
      high: result.daily.temperature_2m_max?.[index] ?? null,
      low: result.daily.temperature_2m_min?.[index] ?? null,
      precipitation: result.daily.precipitation_probability_max?.[index] ?? null,
    })),
  });
}

export async function searchCities(query: string, signal: AbortSignal): Promise<WeatherLocation[]> {
  if (query.trim().length < 2) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({
    name: query.trim(),
    language: 'zh',
    count: '5',
    format: 'json',
  }).toString();
  const result = citiesSchema.parse(await requestJson(url, signal));
  return (result.results ?? []).map((city) => ({
    source: 'city',
    name: city.name,
    region: [...new Set([city.admin2, city.admin1, city.country].filter(Boolean))].join(' · '),
    latitude: city.latitude,
    longitude: city.longitude,
  }));
}
