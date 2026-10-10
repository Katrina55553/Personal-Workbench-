import { expect, it } from 'vitest';
import { financeStats, parseAmount } from './stats';
import type { Transaction } from '../../data/schema';

it('以分解析金额，拒绝精度溢出和非法输入', () => {
  expect(parseAmount('0.10')).toBe(10);
  expect(parseAmount('0.20')).toBe(20);
  expect(parseAmount('123.4')).toBe(12340);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1.001', '1e2', '900719925474099.99'])
    expect(parseAmount(value)).toBeNull();
});
it('只汇总指定月份，并保持整数金额精度', () => {
  const base = {
    id: crypto.randomUUID(),
    title: '记录',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    categoryId: crypto.randomUUID(),
  };
  const records: Transaction[] = [
    { ...base, type: 'expense', amountCents: 10, date: '2026-10-01' },
    { ...base, type: 'expense', amountCents: 20, date: '2026-10-31' },
    { ...base, type: 'income', amountCents: 100, date: '2026-10-10' },
    { ...base, type: 'expense', amountCents: 9999, date: '2026-09-30' },
  ];
  expect(financeStats(records, '2026-10')).toMatchObject({ income: 100, expense: 30, balance: 70 });
  expect(financeStats(records, '2026-11').records).toEqual([]);
});
