import { expect, it } from 'vitest';
import { studyStats } from './stats';
import type { StudyRecord } from '../../data/schema';

it('区分今日、本周和累计，并生成连续七天的零值', () => {
  const base = {
    id: crypto.randomUUID(),
    title: '自习',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    subjectId: crypto.randomUUID(),
    source: 'manual' as const,
    sessionId: null,
  };
  const records: StudyRecord[] = [
    { ...base, date: '2026-10-10', minutes: 25 },
    { ...base, date: '2026-10-05', minutes: 30 },
    { ...base, date: '2026-10-04', minutes: 40 },
  ];
  const stats = studyStats(records, '2026-10-10');
  expect(stats).toMatchObject({ today: 25, week: 55, total: 95 });
  expect(stats.recent).toHaveLength(7);
  expect(stats.recent.find((day) => day.date === '2026-10-09')?.minutes).toBe(0);
});
