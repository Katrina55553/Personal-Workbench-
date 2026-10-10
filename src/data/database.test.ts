// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cloudSchema } from './cloud-schema';
import { createInitialSnapshot } from './defaults';
import type { AppData } from './schema';

const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
let db: PGlite;
const load = async () => {
  const result = await db.query<{ state: unknown }>('select public.read_workbench() as state');
  return cloudSchema.parse(result.rows[0]?.state);
};
const save = async (data: AppData, revision: number, replace = false) => {
  const name = replace ? 'replace_workbench' : 'commit_workbench';
  const result = await db.query<{ state: unknown }>(
    `select public.${name}($1::jsonb,$2) as state`,
    [JSON.stringify(data), revision],
  );
  return cloudSchema.parse(result.rows[0]?.state);
};
const completion = () => ({
  id: crypto.randomUUID(),
  title: '番茄钟专注',
  note: '',
  createdAt: 10000,
  updatedAt: 10000,
  subjectId: createInitialSnapshot().data.subjects[0]!.id,
  minutes: 25,
  date: '2026-10-10',
  source: 'pomodoro' as const,
  sessionId: crypto.randomUUID(),
});
const complete = async (record: ReturnType<typeof completion>, epoch = 0) => {
  const result = await db.query<{ state: unknown }>(
    'select public.complete_pomodoro($1::jsonb,$2) as state',
    [JSON.stringify(record), epoch],
  );
  return cloudSchema.parse(result.rows[0]?.state);
};
async function asUser(id: string) {
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`);
}

describe('PostgreSQL migration, RPC transactions and row permissions', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(
      await readFile(
        new URL('../../supabase/migrations/202610100001_workbench.sql', import.meta.url),
        'utf8',
      ),
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      `reset role; truncate auth.users cascade; insert into auth.users values('${a}'),('${b}');`,
    );
    await asUser(a);
  });
  afterAll(async () => {
    await db?.close();
  });

  it('initializes the same presets, scoped to each account', async () => {
    const state = await load();
    expect(state.data).toEqual(createInitialSnapshot().data);
    expect((await load()).revision).toBe(0);
    state.data.subjects[0]!.name = '我的科目';
    await save(state.data, 0);
    await asUser(b);
    expect((await load()).data).toEqual(createInitialSnapshot().data);
    expect((await db.query('select * from public.workbench_state')).rows).toHaveLength(1);
    expect((await db.query('select * from public.subjects where owner_id=$1', [a])).rows).toEqual(
      [],
    );
  });
  it('denies anonymous access, direct writes and private helper calls', async () => {
    await load();
    await expect(db.exec('update public.workbench_state set revision=99')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.exec('delete from public.todos')).rejects.toThrow(/permission denied/);
    await expect(db.query('select workbench_private.snapshot($1)', [b])).rejects.toThrow(
      /permission denied/,
    );
    await db.exec('reset role; set role anon;');
    await expect(db.exec('select * from public.subjects')).rejects.toThrow(/permission denied/);
    await expect(load()).rejects.toThrow(/permission denied/);
  });
  it('rejects stale writes without overwriting the winner', async () => {
    const state = await load();
    state.data.subjects[0]!.name = '先保存的修改';
    const saved = await save(state.data, 0);
    expect(saved.revision).toBe(1);
    await expect(save(createInitialSnapshot().data, 0)).rejects.toThrow('WORKBENCH_CONFLICT');
    expect((await load()).data.subjects[0]?.name).toBe('先保存的修改');
  });
  it('rolls back replacement on invalid references, amounts and duplicate ids', async () => {
    await load();
    const data = createInitialSnapshot().data;
    data.transactions.push({
      id: crypto.randomUUID(),
      title: '坏分类',
      note: '',
      createdAt: 1,
      updatedAt: 1,
      type: 'expense',
      amountCents: 100,
      categoryId: crypto.randomUUID(),
      date: '2026-10-10',
    });
    await expect(save(data, 0, true)).rejects.toThrow(/foreign key/);
    expect((await load()).timerEpoch).toBe(0);
    expect((await load()).data).toEqual(createInitialSnapshot().data);
    data.transactions[0]!.categoryId = data.categories[0]!.id;
    data.transactions[0]!.amountCents = 1.5;
    await expect(save(data, 0)).rejects.toThrow(/check constraint/);
    data.transactions = [];
    data.subjects.push({ ...data.subjects[0]! });
    await expect(save(data, 0)).rejects.toThrow(/unique constraint/);
    expect((await load()).revision).toBe(0);
  });
  it('does not erase data when an RPC receives null', async () => {
    await load();
    await expect(db.exec('select public.commit_workbench(null,0)')).rejects.toThrow(
      'WORKBENCH_INVALID_DATA',
    );
    expect((await load()).data.subjects).toHaveLength(7);
    await expect(db.exec('select public.complete_pomodoro(null,0)')).rejects.toThrow(
      'WORKBENCH_INVALID_COMPLETION',
    );
  });
  it('validates actual calendar dates, habit logs and category type', async () => {
    await load();
    const data = createInitialSnapshot().data;
    data.habits.push({
      id: crypto.randomUUID(),
      title: '习惯',
      note: '',
      createdAt: 1,
      updatedAt: 1,
      log: { '2026-02-30': true },
    });
    await expect(save(data, 0)).rejects.toThrow(/check constraint/);
    data.habits[0]!.log = { '2026-02-28': true };
    data.transactions.push({
      id: crypto.randomUUID(),
      title: '错类型',
      note: '',
      createdAt: 1,
      updatedAt: 1,
      type: 'income',
      amountCents: 10,
      categoryId: data.categories[0]!.id,
      date: '2026-10-10',
    });
    await expect(save(data, 0)).rejects.toThrow(/foreign key/);
  });
  it('records completions once, including retry after record deletion', async () => {
    await load();
    const record = completion();
    const saved = await complete(record);
    expect(saved.data.studyRecords).toHaveLength(1);
    expect((await complete({ ...record, id: crypto.randomUUID() })).revision).toBe(saved.revision);
    saved.data.studyRecords = [];
    const deleted = await save(saved.data, saved.revision);
    const retry = await complete(record);
    expect(retry.data.studyRecords).toEqual([]);
    expect(retry.revision).toBe(deleted.revision);
  });
  it('rejects delayed completions after import and invalid subjects', async () => {
    await load();
    const imported = await save(createInitialSnapshot().data, 0, true);
    expect(imported.timerEpoch).toBe(1);
    await expect(complete(completion(), 0)).rejects.toThrow('WORKBENCH_TIMER_RESET');
    await expect(complete({ ...completion(), subjectId: crypto.randomUUID() }, 1)).rejects.toThrow(
      /foreign key/,
    );
    expect((await load()).data.studyRecords).toEqual([]);
  });
});
