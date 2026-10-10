export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function weekDates(value = localDate()): string[] {
  const date = new Date(`${value}T12:00:00`);
  const monday = addDays(value, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function shortDate(value: string): string {
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
}

export function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${value}T12:00:00`));
}

export function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年 ${Number(month.slice(5))}月`;
}

export function shiftMonth(month: string, amount: number): string {
  const date = new Date(`${month}-15T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return localDate(date).slice(0, 7);
}
