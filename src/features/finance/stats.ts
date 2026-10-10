import type { Transaction } from '../../data/schema';

export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [integer = '0', decimal = ''] = value.trim().split('.');
  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function money(cents: number): string {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
}

export function financeStats(items: Transaction[], month: string) {
  const records = items.filter((item) => item.date.startsWith(`${month}-`));
  const income = records
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const expense = records
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const categories = new Map<string, number>();
  for (const item of records.filter((item) => item.type === 'expense'))
    categories.set(item.categoryId, (categories.get(item.categoryId) ?? 0) + item.amountCents);
  return {
    records,
    income,
    expense,
    balance: income - expense,
    categories: [...categories.entries()].sort((a, b) => b[1] - a[1]),
  };
}
