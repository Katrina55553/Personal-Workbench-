import { backupSchema, snapshotSchema } from './schema';
import type { Backup, Snapshot } from './schema';
import { createInitialSnapshot, newTimer } from './defaults';
import { settleTimer } from './timer';
import { CloudError } from './cloud-api';
import type { CloudApi } from './cloud-api';
import { localCloudSchema } from './cloud-schema';
import type { CloudSnapshot, LocalCloudSnapshot, SyncStatus } from './cloud-schema';

type Listener = (snapshot: Snapshot, problem: string | null) => void;
type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;
const conflictMessage = '数据已在另一台电脑或页面改变。已刷新列表，请检查当前输入后重新保存。';
const emptyLocal = (): LocalCloudSnapshot => ({
  cloud: { data: createInitialSnapshot().data, revision: 0, timerEpoch: 0, updatedAt: 0 },
  timer: newTimer(),
  pending: [],
});

export class CloudRepository {
  readonly mode = 'cloud' as const;
  status: SyncStatus = 'loading';
  problem: string | null = null;
  private local = emptyLocal();
  private userId: string | null = null;
  private generation = 0;
  private loaded = false;
  private hasCache = false;
  private corruptRaw: string | null = null;
  private listeners = new Set<Listener>();
  private cleanup: (() => void) | null = null;
  private refreshing: Promise<void> | null = null;
  private flushing = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private api: CloudApi,
    private project: string,
    private storage: StorageProvider = () => window.localStorage,
  ) {}

  get revision() {
    return this.local.cloud.revision;
  }
  get pendingCount() {
    return this.local.pending.length;
  }
  get canWrite() {
    return (
      this.userId !== null &&
      this.loaded &&
      navigator.onLine &&
      (this.status === 'synced' || this.status === 'saving')
    );
  }
  private get key() {
    return `personal-workbench-cloud-v1:${encodeURIComponent(this.project)}:${this.userId}`;
  }
  read(): Snapshot {
    return {
      version: 1,
      updatedAt: this.local.cloud.updatedAt,
      data: this.local.cloud.data,
      timer: this.local.timer,
    };
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish() {
    const snapshot = this.read();
    for (const listener of this.listeners) listener(snapshot, this.problem);
  }
  private readLocal() {
    let raw: string | null = null;
    try {
      raw = this.storage().getItem(this.key);
      if (raw) {
        const next = localCloudSchema.parse(JSON.parse(raw));
        if (next.cloud.revision >= this.revision) this.local = next;
        this.hasCache = true;
      }
    } catch {
      if (raw) this.corruptRaw = raw;
      this.problem = '本机缓存无法读取或校验。原始数据保留，可在设置中导出；云端数据仍可重新加载。';
    }
  }
  private persist(next: LocalCloudSnapshot, required = false) {
    try {
      if (this.corruptRaw && !this.storage().getItem(`${this.key}:recovery`))
        this.storage().setItem(`${this.key}:recovery`, this.corruptRaw);
      this.storage().setItem(this.key, JSON.stringify(next));
    } catch {
      if (required) throw new Error('计时保存失败：浏览器存储不可用或空间不足。请保留当前页面。');
      this.problem = '云端已保存，但本机缓存保存失败；断网查看和计时恢复可能不可用。';
    }
    this.local = next;
    this.publish();
  }
  private async lock<T>(action: () => Promise<T> | T): Promise<T> {
    const key = this.key;
    const generation = this.generation;
    const guarded = () => {
      if (generation !== this.generation || !this.userId)
        throw new Error('登录状态已改变，请重新操作');
      this.readLocal();
      return action();
    };
    if (navigator.locks) return await navigator.locks.request(key, guarded);
    const result = this.queue.then(guarded, guarded);
    this.queue = result.catch(() => {});
    return await result;
  }
  private accept(remote: CloudSnapshot) {
    if (remote.revision < this.revision) return;
    const reset = remote.timerEpoch !== this.local.cloud.timerEpoch;
    let timer = reset ? newTimer() : this.local.timer;
    if (timer.subjectId && !remote.data.subjects.some((item) => item.id === timer.subjectId))
      timer = newTimer();
    this.loaded = true;
    this.status = navigator.onLine ? 'synced' : 'offline';
    this.problem = navigator.onLine ? null : '当前离线，显示已缓存数据。恢复网络后自动同步。';
    this.persist({ cloud: remote, timer, pending: reset ? [] : this.local.pending });
  }
  async connect(userId: string) {
    if (this.userId === userId) return;
    this.disconnect();
    this.userId = userId;
    this.status = 'loading';
    this.readLocal();
    this.publish();
    const generation = this.generation;
    const active = () => generation === this.generation;
    const refresh = () => {
      if (active()) void this.refresh();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const offline = () => {
      if (!active()) return;
      this.status = 'offline';
      this.problem = '当前离线，显示已缓存数据。恢复网络后自动同步。';
      this.publish();
    };
    const storage = (event: StorageEvent) => {
      if (!active() || (event.key !== this.key && event.key !== null)) return;
      this.readLocal();
      this.publish();
      void this.flushPending();
    };
    const unsubscribe = this.api.subscribe(userId, refresh, refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility);
    const interval = window.setInterval(refresh, 30000);
    this.cleanup = () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
    };
    await this.refresh();
  }
  disconnect() {
    this.generation++;
    this.cleanup?.();
    this.cleanup = null;
    this.refreshing = null;
    this.flushing = false;
    this.loaded = false;
    this.hasCache = false;
    this.corruptRaw = null;
    this.userId = null;
    this.local = emptyLocal();
    this.status = 'loading';
    this.problem = null;
    this.publish();
  }
  refresh(): Promise<void> {
    if (!this.userId) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const work = async () => {
      try {
        if (!navigator.onLine) throw new Error('offline');
        const remote = await this.api.load();
        if (generation !== this.generation) return;
        await this.lock(() => this.accept(remote));
        void this.flushPending();
      } catch {
        if (generation !== this.generation) return;
        this.status = navigator.onLine ? 'error' : 'offline';
        this.problem = navigator.onLine
          ? '云端加载失败，当前数据仅供查看。请检查网络或登录状态，然后重试同步。'
          : '当前离线，显示已缓存数据。恢复网络后自动同步。';
        this.publish();
      } finally {
        if (generation === this.generation) this.refreshing = null;
      }
    };
    this.refreshing = Promise.resolve().then(work);
    return this.refreshing;
  }
  private async save(data: Snapshot['data'], revision: number, replace: boolean) {
    const generation = this.generation;
    this.status = 'saving';
    this.publish();
    try {
      const remote = await this.api.save(data, revision, replace);
      if (generation !== this.generation) throw new Error('登录状态已改变');
      this.accept(remote);
      return this.read();
    } catch (reason) {
      if (generation !== this.generation) throw reason;
      if (reason instanceof CloudError && reason.code.includes('WORKBENCH_CONFLICT')) {
        let remote: CloudSnapshot;
        try {
          remote = await this.api.load();
        } catch {
          if (generation === this.generation) {
            this.status = navigator.onLine ? 'error' : 'offline';
            this.problem = '发现其他设备的修改，但刷新失败。请保留输入，重试同步后再保存。';
            this.publish();
          }
          throw new Error(this.problem ?? '登录状态已改变');
        }
        if (generation !== this.generation) throw new Error('登录状态已改变');
        this.accept(remote);
        throw new Error(conflictMessage);
      }
      this.status = navigator.onLine ? 'error' : 'offline';
      this.problem = '保存未能确认，请保留输入并重试同步，确认最新数据后再保存。';
      this.publish();
      throw new Error(this.problem);
    }
  }
  async update(change: (draft: Snapshot) => void, expectedRevision = this.revision) {
    return this.lock(async () => {
      if (!this.canWrite) throw new Error('当前数据仅供查看，请联网并完成同步后再保存');
      if (expectedRevision !== this.revision) {
        this.publish();
        throw new Error(conflictMessage);
      }
      const draft = structuredClone(this.read());
      change(draft);
      const parsed = snapshotSchema.parse(draft);
      if (JSON.stringify(parsed.timer) !== JSON.stringify(this.local.timer))
        throw new Error('请通过本机计时接口更新番茄钟');
      return this.save(parsed.data, expectedRevision, false);
    });
  }
  async updateTimer(change: (draft: Snapshot) => void) {
    return this.lock(() => {
      const draft = structuredClone(this.read());
      change(draft);
      const parsed = snapshotSchema.parse(draft);
      if (JSON.stringify(parsed.data) !== JSON.stringify(this.local.cloud.data))
        throw new Error('计时操作不能修改云端业务数据');
      if (
        parsed.timer.status === 'running' &&
        this.local.timer.status !== 'running' &&
        !this.canWrite
      )
        throw new Error('请联网并完成同步后再开始计时');
      this.persist({ ...this.local, timer: parsed.timer }, true);
      return this.read();
    });
  }
  async settle(now: number): Promise<'focus' | 'break' | null> {
    const phase = await this.lock(() => {
      const draft = structuredClone(this.read());
      const phase = settleTimer(draft, now);
      if (!phase) return null;
      const pending = [...this.local.pending];
      const record = draft.data.studyRecords.find(
        (item) => item.sessionId === this.local.timer.sessionId,
      );
      if (
        phase === 'focus' &&
        record &&
        !this.local.cloud.data.studyRecords.some((item) => item.sessionId === record.sessionId) &&
        !pending.some((item) => item.sessionId === record.sessionId)
      )
        pending.push(record);
      this.persist({ ...this.local, timer: draft.timer, pending }, true);
      return phase;
    });
    void this.flushPending();
    return phase;
  }
  private async flushPending() {
    if (!this.canWrite || this.flushing || !this.pendingCount) return;
    const generation = this.generation;
    this.flushing = true;
    try {
      while (generation === this.generation && this.canWrite && this.pendingCount) {
        await this.lock(async () => {
          const record = this.local.pending[0];
          if (!record || !this.canWrite) return;
          const epoch = this.local.cloud.timerEpoch;
          const remote = await this.api.complete(record, epoch);
          if (generation !== this.generation) return;
          this.accept(remote);
          this.persist(
            {
              ...this.local,
              pending: this.local.pending.filter((item) => item.sessionId !== record.sessionId),
            },
            true,
          );
        });
      }
    } catch (reason) {
      if (generation !== this.generation) return;
      if (reason instanceof CloudError && reason.code.includes('WORKBENCH_TIMER_RESET')) {
        // Import won the database lock. Refresh its epoch before attempting another upload.
        void this.refresh();
      } else {
        this.problem = '计时完成已保存在本机，暂未上传。恢复连接或重试同步后自动补交。';
        this.publish();
      }
    } finally {
      if (generation === this.generation) this.flushing = false;
    }
  }
  export(): string {
    if (!this.loaded && !this.hasCache)
      throw new Error('尚未载入有效云端数据或缓存，无法导出业务备份');
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), data: this.read().data } satisfies Backup,
      null,
      2,
    );
  }
  exportRaw(): string {
    return (
      this.corruptRaw ??
      this.storage().getItem(`${this.key}:recovery`) ??
      this.storage().getItem(this.key) ??
      ''
    );
  }
  validateBackup(raw: string): Backup {
    try {
      return backupSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error('备份无效：请检查文件版本、记录字段及分类和科目引用。当前数据未改变。');
    }
  }
  async import(backup: Backup, expectedRevision = this.revision): Promise<Snapshot> {
    const data = backupSchema.parse(backup).data;
    return this.lock(() => {
      if (!this.canWrite) throw new Error('请联网并完成同步后再导入');
      if (expectedRevision !== this.revision) throw new Error(conflictMessage);
      return this.save(data, expectedRevision, true);
    });
  }
}
