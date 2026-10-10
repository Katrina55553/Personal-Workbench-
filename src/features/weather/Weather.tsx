import { useEffect, useRef, useState } from 'react';
import { CloudSun, Droplets, LocateFixed, MapPin, RefreshCw, Search } from 'lucide-react';
import { Card, Field, Modal } from '../../shared/components';
import { addDays } from '../../shared/date';
import { searchCities } from './client';
import { precipitation, temperature, weatherCondition, weatherDate } from './model';
import type { WeatherLocation } from './model';
import { useWeather } from './useWeather';
import styles from './Weather.module.css';

function CityPicker({
  onClose,
  onSelect,
  returnFocus,
}: {
  onClose: () => void;
  onSelect: (location: WeatherLocation) => void;
  returnFocus: HTMLElement | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    request.current?.abort();
    if (query.trim().length < 2) {
      setMessage('请输入至少两个字符的城市名称。');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setResults([]);
    setMessage('');
    try {
      const cities = await searchCities(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(cities);
      if (!cities.length) setMessage('没有找到城市，可以尝试完整名称或英文名称。');
    } catch {
      if (!controller.signal.aborted) setMessage('城市搜索失败，请检查网络后重试。');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Modal
      title="选择天气城市"
      description="搜索城市后，从候选位置中选择。"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <form onSubmit={(event) => void search(event)}>
        <Field label="城市名称" id="weather-city" hint="支持中文或英文名称，例如北京、Shanghai。">
          <div className={styles.searchRow}>
            <input
              id="weather-city"
              value={query}
              onChange={(event) => {
                request.current?.abort();
                setBusy(false);
                setResults([]);
                setMessage('');
                setQuery(event.target.value);
              }}
              placeholder="输入城市名称"
              autoComplete="off"
            />
            <button className="button primary" type="submit" disabled={busy}>
              <Search size={15} />
              {busy ? '搜索中…' : '搜索城市'}
            </button>
          </div>
        </Field>
      </form>
      <div aria-live="polite">
        {message && <p className={styles.message}>{message}</p>}
        <ul className={styles.cities}>
          {results.map((city, index) => (
            <li key={`${city.latitude}-${city.longitude}-${index}`}>
              <button
                type="button"
                aria-label={`${city.name} ${city.region || '地区信息暂缺'}`}
                onClick={() => onSelect(city)}
              >
                <MapPin size={17} />
                <span>
                  <strong>{city.name}</strong>
                  <small>{city.region || '地区信息暂缺'}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.credit}>
        城市数据来自{' '}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>{' '}
        / Open-Meteo
      </p>
    </Modal>
  );
}

export function WeatherCard() {
  const weather = useWeather();
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const data = weather.data;
  const today = data ? weatherDate(data.timezone, weather.now) : '';
  const daily = data?.days.find((day) => day.date === today);
  const current = weatherCondition(data?.current.code, data?.current.isDay);
  const busy = weather.loading || weather.locating;
  const openPicker = (button: HTMLElement) => setPicker(button);

  return (
    <>
      <Card
        title="天气"
        icon={CloudSun}
        className={styles.card}
        action={
          <div className={styles.headingActions}>
            <button
              type="button"
              className="text-button"
              onClick={(event) => openPicker(event.currentTarget)}
            >
              {weather.location ? '切换城市' : '选择城市'}
            </button>
            {weather.location && (
              <button
                type="button"
                className="icon-button"
                aria-label="刷新天气"
                title="刷新天气"
                disabled={busy}
                onClick={() => void weather.refresh()}
              >
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        }
      >
        {weather.location && (
          <div className={styles.location}>
            <MapPin size={13} />
            <span
              title={[weather.location.name, weather.location.region].filter(Boolean).join(' · ')}
            >
              {weather.location.name}
            </span>
          </div>
        )}
        {data ? (
          <>
            <div className={styles.current}>
              <div>
                <strong>
                  {temperature(data.current.temperature)}
                  {data.current.temperature != null && <small>C</small>}
                </strong>
                <p>{current.label}</p>
              </div>
              <current.Icon size={49} strokeWidth={1.3} aria-hidden="true" />
            </div>
            <div className={styles.today}>
              <span>
                今日 {temperature(daily?.low)} / {temperature(daily?.high)}
              </span>
              <span>
                <Droplets size={12} />
                降水 {precipitation(daily?.precipitation)}
              </span>
            </div>
            <div className={styles.forecast} aria-label="未来三天天气">
              {Array.from({ length: 3 }, (_, index) => {
                const date = addDays(today, index + 1);
                const day = data.days.find((item) => item.date === date);
                const condition = weatherCondition(day?.code);
                return (
                  <div key={date} className={styles.day}>
                    <strong>
                      {index === 0
                        ? '明天'
                        : index === 1
                          ? '后天'
                          : `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`}
                    </strong>
                    <condition.Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                    <span>{condition.label}</span>
                    <span className={styles.temperatures}>
                      {temperature(day?.low)} / {temperature(day?.high)}
                    </span>
                    <small>降水 {precipitation(day?.precipitation)}</small>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <CloudSun size={35} strokeWidth={1.2} />
            <p>{weather.location ? '等待天气数据' : '看看今天的天气，再安排出发。'}</p>
          </div>
        )}
        <div className={styles.status} aria-live="polite">
          {busy && <p>{weather.locating ? '正在获取位置…' : '正在更新天气…'}</p>}
          {weather.error && (
            <p className={styles.error}>
              {weather.error}
              {weather.location && !busy && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void weather.refresh()}
                >
                  重试
                </button>
              )}
            </p>
          )}
          {weather.storageWarning && <p className={styles.error}>{weather.storageWarning}</p>}
        </div>
        <div className={styles.bottomActions}>
          <button
            type="button"
            className="text-button"
            disabled={weather.locating}
            onClick={weather.locate}
          >
            <LocateFixed size={13} />
            使用当前位置
          </button>
          {!weather.location && (
            <button
              type="button"
              className="text-button"
              onClick={(event) => openPicker(event.currentTarget)}
            >
              手动选择城市
            </button>
          )}
        </div>
        <div className={styles.footer}>
          <span>
            {data
              ? `${new Intl.DateTimeFormat('zh-CN', { timeZone: data.timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(data.fetchedAt)} 更新`
              : '温度单位 °C'}
          </span>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
        </div>
      </Card>
      {picker && (
        <CityPicker
          onClose={() => setPicker(null)}
          returnFocus={picker}
          onSelect={(location) => {
            weather.selectLocation(location);
            setPicker(null);
          }}
        />
      )}
    </>
  );
}
