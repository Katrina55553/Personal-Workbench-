import type { PomodoroState, Snapshot } from './schema';

export const FOCUS_MS = 25 * 60 * 1000;
export const BREAK_MS = 5 * 60 * 1000;
const presetId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

export function newTimer(): PomodoroState {
  return {
    phase: 'focus',
    status: 'ready',
    remainingMs: FOCUS_MS,
    deadline: null,
    sessionId: null,
    subjectId: null,
  };
}

export function createInitialSnapshot(): Snapshot {
  const expenses = ['餐饮', '交通', '购物', '居住', '医疗', '学习', '娱乐', '其他'];
  const incomes = ['工资', '奖金', '其他'];
  return {
    version: 1,
    updatedAt: 0,
    timer: newTimer(),
    data: {
      todos: [],
      habits: [],
      transactions: [],
      studyRecords: [],
      categories: [
        ...expenses.map((name, i) => ({
          id: presetId(i + 1),
          name,
          type: 'expense' as const,
          active: true,
        })),
        ...incomes.map((name, i) => ({
          id: presetId(i + 20),
          name,
          type: 'income' as const,
          active: true,
        })),
      ],
      subjects: ['语文', '数学', '英语', '政治', '专业课', '阅读', '其他'].map((name, i) => ({
        id: presetId(i + 40),
        name,
        active: true,
      })),
    },
  };
}
