import type { StudyRecord } from '../../data/schema';
import { addDays, weekDates } from '../../shared/date';

export function studyStats(items: StudyRecord[], today: string) {
  const week = new Set(weekDates(today));
  const sum = (records: StudyRecord[]) => records.reduce((total, item) => total + item.minutes, 0);
  const bySubject = new Map<string, number>();
  for (const item of items)
    bySubject.set(item.subjectId, (bySubject.get(item.subjectId) ?? 0) + item.minutes);
  return {
    today: sum(items.filter((item) => item.date === today)),
    week: sum(items.filter((item) => week.has(item.date))),
    total: sum(items),
    bySubject: [...bySubject.entries()].sort((a, b) => b[1] - a[1]),
    recent: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      return { date, minutes: sum(items.filter((item) => item.date === date)) };
    }),
  };
}

export function duration(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`
    : `${minutes} 分钟`;
}
