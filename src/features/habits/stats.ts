import { addDays } from '../../shared/date';

export function currentStreak(log: Record<string, true>, today: string): number {
  let day = log[today] ? today : addDays(today, -1);
  let count = 0;
  while (log[day]) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

export function longestStreak(log: Record<string, true>): number {
  const days = Object.keys(log).sort();
  let best = 0;
  let count = 0;
  let previous = '';
  for (const day of days) {
    count = previous && addDays(previous, 1) === day ? count + 1 : 1;
    best = Math.max(best, count);
    previous = day;
  }
  return best;
}
