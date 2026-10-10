import { z } from 'zod';
import { isDate } from '../shared/date';

const id = z.uuid();
const date = z.string().refine(isDate, '请输入有效日期');
const name = z.string().trim().min(1, '请填写名称').max(120, '名称最多 120 字');
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base = {
  id,
  title: name,
  note: z.string().max(10000),
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const todoSchema = z.strictObject({
  ...base,
  priority: z.enum(['P0', 'P1', 'P2']),
  done: z.boolean(),
  pinned: z.boolean(),
});
export const habitSchema = z.strictObject({ ...base, log: z.record(date, z.literal(true)) });
export const transactionSchema = z.strictObject({
  ...base,
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  categoryId: id,
  date,
});
export const studySchema = z.strictObject({
  ...base,
  subjectId: id,
  minutes: z.number().int().positive().max(1440),
  date,
  source: z.enum(['manual', 'pomodoro']),
  sessionId: id.nullable(),
});
export const categorySchema = z.strictObject({
  id,
  name,
  type: z.enum(['income', 'expense']),
  active: z.boolean(),
});
export const subjectSchema = z.strictObject({ id, name, active: z.boolean() });
export const timerSchema = z
  .strictObject({
    phase: z.enum(['focus', 'break']),
    status: z.enum(['ready', 'running', 'paused']),
    remainingMs: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 60 * 1000),
    deadline: timestamp.nullable(),
    sessionId: id.nullable(),
    subjectId: id.nullable(),
  })
  .superRefine((timer, ctx) => {
    if (
      timer.status === 'running' &&
      (timer.deadline === null ||
        (timer.phase === 'focus' && (!timer.sessionId || !timer.subjectId)))
    ) {
      ctx.addIssue({ code: 'custom', message: '运行中的计时状态不完整' });
    }
    if (timer.status !== 'running' && timer.deadline !== null)
      ctx.addIssue({ code: 'custom', message: '非运行状态不能有截止时间' });
  });

export const businessSchema = z
  .strictObject({
    todos: z.array(todoSchema),
    habits: z.array(habitSchema),
    transactions: z.array(transactionSchema),
    studyRecords: z.array(studySchema),
    categories: z.array(categorySchema),
    subjects: z.array(subjectSchema),
  })
  .superRefine((data, ctx) => {
    for (const items of [
      data.todos,
      data.habits,
      data.transactions,
      data.studyRecords,
      data.categories,
      data.subjects,
    ]) {
      if (new Set(items.map((item) => item.id)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: '记录 ID 重复' });
    }
    for (const item of data.transactions) {
      if (
        !data.categories.some(
          (category) => category.id === item.categoryId && category.type === item.type,
        )
      )
        ctx.addIssue({ code: 'custom', message: '收支分类引用无效' });
    }
    for (const item of data.studyRecords) {
      if (!data.subjects.some((subject) => subject.id === item.subjectId))
        ctx.addIssue({ code: 'custom', message: '自习科目引用无效' });
      if (item.source === 'pomodoro' && !item.sessionId)
        ctx.addIssue({ code: 'custom', message: '专注记录缺少会话 ID' });
    }
    const sessions = data.studyRecords
      .filter((item) => item.sessionId)
      .map((item) => item.sessionId);
    if (new Set(sessions).size !== sessions.length)
      ctx.addIssue({ code: 'custom', message: '专注会话重复' });
  });

export const snapshotSchema = z
  .strictObject({
    version: z.literal(1),
    updatedAt: timestamp,
    data: businessSchema,
    timer: timerSchema,
  })
  .superRefine((snapshot, ctx) => {
    if (
      snapshot.timer.subjectId &&
      !snapshot.data.subjects.some((subject) => subject.id === snapshot.timer.subjectId)
    )
      ctx.addIssue({ code: 'custom', message: '计时科目引用无效' });
  });
export const backupSchema = z.strictObject({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: businessSchema,
});

export type Todo = z.infer<typeof todoSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type StudyRecord = z.infer<typeof studySchema>;
export type Category = z.infer<typeof categorySchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type PomodoroState = z.infer<typeof timerSchema>;
export type AppData = z.infer<typeof businessSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Backup = z.infer<typeof backupSchema>;
