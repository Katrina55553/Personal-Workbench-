import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudRepository } from './cloud-repository';
import { CloudError } from './cloud-api';
import type { CloudApi } from './cloud-api';
import type { CloudSnapshot } from './cloud-schema';
import { createInitialSnapshot } from './defaults';

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
}
function server() {
  let state: CloudSnapshot = {
    data: createInitialSnapshot().data,
    revision: 0,
    timerEpoch: 0,
    updatedAt: 0,
  };
  const changed = new Set<() => void>();
  const receipts = new Set<string>();
  const announce = () => queueMicrotask(() => changed.forEach((fn) => fn()));
  const api: CloudApi = {
    load: vi.fn(async () => structuredClone(state)),
    save: vi.fn(async (data, revision, replace) => {
      if (revision !== state.revision) throw new CloudError('WORKBENCH_CONFLICT', 'conflict');
      state = {
        data: structuredClone(data),
        revision: revision + 1,
        timerEpoch: state.timerEpoch + Number(replace),
        updatedAt: Date.now(),
      };
      announce();
      return structuredClone(state);
    }),
    complete: vi.fn(async (record, epoch) => {
      if (epoch !== state.timerEpoch) throw new CloudError('WORKBENCH_TIMER_RESET', 'reset');
      const receipt = `${epoch}:${record.sessionId}`;
      if (!receipts.has(receipt)) {
        state.data.studyRecords.unshift(structuredClone(record));
        state.revision++;
        receipts.add(receipt);
        announce();
      }
      return structuredClone(state);
    }),
    subscribe: (_id, fn) => {
      changed.add(fn);
      return () => {
        changed.delete(fn);
      };
    },
  };
  return { api, state: () => structuredClone(state), subscribers: changed };
}
const repos: CloudRepository[] = [];
function device(api: CloudApi, storage = memory()) {
  const repo = new CloudRepository(api, 'test-project', () => storage);
  repos.push(repo);
  return { repo, storage };
}
async function start(repo: CloudRepository, deadline = Date.now() + 10000) {
  await repo.updateTimer((draft) => {
    draft.timer = {
      phase: 'focus',
      status: 'running',
      remainingMs: 1500000,
      deadline,
      subjectId: draft.data.subjects[0]!.id,
      sessionId: crypto.randomUUID(),
    };
  });
}

describe('cloud repository across devices and offline timers', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    repos.splice(0).forEach((repo) => repo.disconnect());
    vi.restoreAllMocks();
  });

  it('publishes committed data to another device without sharing timer state', async () => {
    const { api } = server();
    const a = device(api).repo;
    const b = device(api).repo;
    await a.connect('a');
    await b.connect('a');
    await start(a);
    await a.update((draft) => {
      draft.data.subjects[0]!.name = '跨电脑科目';
    });
    await vi.waitFor(() => expect(b.read().data.subjects[0]?.name).toBe('跨电脑科目'));
    expect(a.read().timer.status).toBe('running');
    expect(b.read().timer.status).toBe('ready');
  });
  it('refreshes a stale revision on conflict while rejecting the attempted save', async () => {
    const s = server();
    const { repo } = device({ ...s.api, subscribe: () => () => {} });
    await repo.connect('a');
    const data = s.state().data;
    data.subjects[0]!.name = '另一个设备已保存';
    await s.api.save(data, 0, false);
    await expect(
      repo.update((draft) => {
        draft.data.subjects[0]!.name = '过期修改';
      }),
    ).rejects.toThrow('已刷新列表');
    expect(repo.read().data.subjects[0]?.name).toBe('另一个设备已保存');
    expect(repo.status).toBe('synced');
  });
  it('rejects an editor opened before a background refresh', async () => {
    const s = server();
    const { repo } = device(s.api);
    await repo.connect('a');
    const revision = repo.revision;
    const data = s.state().data;
    data.subjects[0]!.name = '后台同步';
    await s.api.save(data, 0, false);
    await repo.refresh();
    await expect(
      repo.update((draft) => {
        draft.data.subjects[0]!.name = '旧表单';
      }, revision),
    ).rejects.toThrow('重新保存');
    expect(repo.read().data.subjects[0]?.name).toBe('后台同步');
  });
  it('durably queues offline completion and submits once on reconnect', async () => {
    const s = server();
    const { repo, storage } = device(s.api);
    await repo.connect('a');
    await start(repo, 10000);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(await repo.settle(10000)).toBe('focus');
    expect(await repo.settle(20000)).toBeNull();
    expect(repo.pendingCount).toBe(1);
    expect(repo.read().timer.phase).toBe('break');
    expect(s.api.complete).not.toHaveBeenCalled();
    expect([...storage.map.values()].join()).toContain('sessionId');
    await expect(repo.update(() => {})).rejects.toThrow('仅供查看');
    await expect(start(repo)).rejects.toThrow('联网');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await repo.refresh();
    await vi.waitFor(() => expect(repo.pendingCount).toBe(0));
    expect(s.state().data.studyRecords).toHaveLength(1);
  });
  it('recovers an offline pending completion after a reload', async () => {
    const s = server();
    const { repo, storage } = device(s.api);
    await repo.connect('a');
    await start(repo, 10000);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await repo.settle(10000);
    repo.disconnect();
    const next = device(s.api, storage).repo;
    await next.connect('a');
    expect(next.pendingCount).toBe(1);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await next.refresh();
    await vi.waitFor(() => expect(next.pendingCount).toBe(0));
    expect(s.state().data.studyRecords).toHaveLength(1);
  });
  it('import on another device invalidates timers and old offline queues', async () => {
    const s = server();
    const { repo } = device({ ...s.api, subscribe: () => () => {} });
    await repo.connect('a');
    await start(repo, 10000);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await repo.settle(10000);
    await s.api.save(createInitialSnapshot().data, 0, true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await repo.refresh();
    expect(repo.pendingCount).toBe(0);
    expect(repo.read().timer.phase).toBe('focus');
    expect(s.api.complete).not.toHaveBeenCalled();
  });
  it('keeps timer unchanged when durable local storage fails', async () => {
    const s = server();
    const { repo, storage } = device(s.api);
    await repo.connect('a');
    await start(repo, 10000);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(repo.settle(10000)).rejects.toThrow('计时保存失败');
    expect(repo.read().timer.status).toBe('running');
    expect(repo.pendingCount).toBe(0);
    expect(s.api.complete).not.toHaveBeenCalled();
  });
  it('isolates cached records and timers by user and cleans up subscriptions', async () => {
    const s = server();
    const { repo } = device(s.api);
    await repo.connect('a');
    await start(repo);
    expect(s.subscribers.size).toBe(1);
    repo.disconnect();
    expect(repo.read().timer.status).toBe('ready');
    expect(s.subscribers.size).toBe(0);
    await repo.connect('b');
    expect(repo.read().timer.status).toBe('ready');
    await repo.connect('a');
    expect(repo.read().timer.status).toBe('running');
  });
  it('ignores responses from a previous account after logout', async () => {
    const s = server();
    let resolve: (state: CloudSnapshot) => void = () => {};
    const api = {
      ...s.api,
      load: () =>
        new Promise<CloudSnapshot>((done) => {
          resolve = done;
        }),
    };
    const { repo } = device(api);
    const connecting = repo.connect('a');
    await Promise.resolve();
    repo.disconnect();
    const state = s.state();
    state.data.subjects[0]!.name = '上一个账号';
    resolve(state);
    await connecting;
    expect(repo.read().data.subjects[0]?.name).toBe('语文');
  });
  it('preserves a corrupt cache for raw export while reloading valid cloud data', async () => {
    const s = server();
    const storage = memory();
    storage.setItem('personal-workbench-cloud-v1:test-project:a', '{corrupt');
    const { repo } = device(s.api, storage);
    await repo.connect('a');
    expect(repo.exportRaw()).toBe('{corrupt');
    expect(repo.read().data).toEqual(createInitialSnapshot().data);
    expect(repo.status).toBe('synced');
  });
});
