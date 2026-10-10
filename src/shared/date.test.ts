import { describe, expect, it } from 'vitest';
import { addDays, isDate, localDate, shiftMonth, weekDates } from './date';
import { currentStreak, longestStreak } from '../features/habits/stats';

describe('本地日历与习惯', () => {
  it('凌晨和深夜都属于本地日历日期', () => {
    expect(localDate(new Date(2026, 9, 10, 0, 30))).toBe('2026-10-10');
    expect(localDate(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10');
  });
  it('验证闰日并拒绝日期溢出', () => {
    expect(isDate('2024-02-29')).toBe(true);
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2026-13-01')).toBe(false);
    expect(isDate('2026-1-01')).toBe(false);
  });
  it('跨年和跨月以周一作为起点', () => {
    expect(weekDates('2026-01-01')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('今天未打卡时延续昨天，缺一天则连续中断', () => {
    const log: Record<string, true> = {
      '2026-10-07': true,
      '2026-10-08': true,
      '2026-10-09': true,
    };
    expect(currentStreak(log, '2026-10-10')).toBe(3);
    expect(currentStreak(log, '2026-10-11')).toBe(0);
    expect(longestStreak({ ...log, '2026-10-11': true })).toBe(3);
    expect(longestStreak({})).toBe(0);
  });
});
