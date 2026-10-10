import { describe, expect, it, vi } from 'vitest';
import { Repository, STORAGE_KEY } from './repository';
import { createInitialSnapshot } from './defaults';
import { backupSchema } from './schema';

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('数据仓储与备份', () => {
  it('空存储只有预设字典，没有演示业务数据', () => {
    const db = new Repository(() => storage());
    expect(db.read().data.todos).toEqual([]);
    expect(db.read().data.habits).toEqual([]);
    expect(db.read().data.subjects).toHaveLength(7);
  });
  it('更新后可重新载入，订阅得到已保存的快照', async () => {
    const memory = storage();
    const db = new Repository(() => memory);
    const listener = vi.fn();
    const unsubscribe = db.subscribe(listener);
    await db.update((draft) => {
      draft.data.todos.push({
        id: crypto.randomUUID(),
        title: '中文待办',
        note: '',
        priority: 'P1',
        done: false,
        pinned: true,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    expect(new Repository(() => memory).read().data.todos[0]?.title).toBe('中文待办');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it('保存失败不发布成功快照或丢弃原记录', async () => {
    const memory = storage();
    const db = new Repository(() => memory);
    await db.update((draft) => {
      draft.data.subjects[0]!.name = '原科目';
    });
    const original = memory.getItem(STORAGE_KEY);
    vi.spyOn(memory, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    await expect(
      db.update((draft) => {
        draft.data.subjects[0]!.name = '不应保存';
      }),
    ).rejects.toThrow('保存失败');
    expect(memory.getItem(STORAGE_KEY)).toBe(original);
    expect(db.read().data.subjects[0]?.name).toBe('原科目');
  });
  it('外部清理存储后不恢复已清除的数据', async () => {
    const memory = storage();
    let cleared = false;
    const db = new Repository(() => ({
      ...memory,
      getItem: (key) => (cleared ? null : memory.getItem(key)),
    }));
    await db.update((draft) => {
      draft.data.subjects[0]!.name = '清理前';
    });
    cleared = true;
    expect(db.read().data.subjects[0]?.name).toBe('语文');
    expect(db.read().timer.status).toBe('ready');
  });
  it('损坏原始数据可导出，禁止自动覆盖', async () => {
    const memory = storage();
    memory.setItem(STORAGE_KEY, '{broken');
    const db = new Repository(() => memory);
    expect(db.problem).not.toBeNull();
    expect(db.exportRaw()).toBe('{broken');
    await expect(db.update(() => {})).rejects.toThrow('原始数据未被覆盖');
    expect(memory.getItem(STORAGE_KEY)).toBe('{broken');
  });
  it('存储读取被浏览器禁止时保留明确错误', () => {
    const db = new Repository(() => {
      throw new DOMException('Security', 'SecurityError');
    });
    expect(db.problem).toContain('无法读取');
  });
  it('备份往返只替换业务与设置，计时恢复为未开始', async () => {
    const memory = storage();
    const db = new Repository(() => memory);
    await db.update((draft) => {
      draft.timer.status = 'running';
      draft.timer.deadline = Date.now() + 1000;
      draft.timer.subjectId = draft.data.subjects[0]!.id;
      draft.timer.sessionId = crypto.randomUUID();
      draft.data.categories[0]!.active = false;
    });
    const raw = db.export();
    expect(raw).not.toContain('deadline');
    await db.import(db.validateBackup(raw));
    expect(db.read().timer.status).toBe('ready');
    expect(db.read().data.categories[0]?.active).toBe(false);
  });
  it('拒绝未知版本、重复 ID 和无效引用，原数据不变', () => {
    const db = new Repository(() => storage());
    const data = createInitialSnapshot().data;
    expect(() =>
      db.validateBackup(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data })),
    ).toThrow('备份无效');
    data.subjects.push({ ...data.subjects[0]! });
    expect(
      backupSchema.safeParse({ version: 1, exportedAt: new Date().toISOString(), data }).success,
    ).toBe(false);
    const invalid = createInitialSnapshot().data;
    invalid.transactions.push({
      id: crypto.randomUUID(),
      title: '坏引用',
      note: '',
      createdAt: 1,
      updatedAt: 1,
      type: 'expense',
      amountCents: 10,
      categoryId: crypto.randomUUID(),
      date: '2026-10-10',
    });
    expect(() =>
      db.validateBackup(
        JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: invalid }),
      ),
    ).toThrow('备份无效');
  });
  it('自习备份拒绝零、负数、小数及超出一天的时长', () => {
    const db = new Repository(() => storage());
    for (const minutes of [0, -1, 1.5, 1441]) {
      const data = createInitialSnapshot().data;
      data.studyRecords.push({
        id: crypto.randomUUID(),
        title: '学习',
        note: '',
        createdAt: 1,
        updatedAt: 1,
        subjectId: data.subjects[0]!.id,
        minutes,
        date: '2026-10-10',
        source: 'manual',
        sessionId: null,
      });
      expect(() =>
        db.validateBackup(
          JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }),
        ),
      ).toThrow('备份无效');
    }
  });
});
