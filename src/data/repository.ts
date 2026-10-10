import { backupSchema, snapshotSchema } from './schema';
import type { Backup, Snapshot } from './schema';
import { createInitialSnapshot, newTimer } from './defaults';

export const STORAGE_KEY = 'personal-workbench-v1';
type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem'>;
type Listener = (snapshot: Snapshot, problem: string | null) => void;

export class Repository {
  private snapshot = createInitialSnapshot();
  private listeners = new Set<Listener>();
  private blocked = false;
  problem: string | null = null;

  constructor(private storage: StorageProvider = () => window.localStorage) {
    this.read();
  }

  read(): Snapshot {
    try {
      const raw = this.storage().getItem(STORAGE_KEY);
      this.snapshot =
        raw === null ? createInitialSnapshot() : snapshotSchema.parse(JSON.parse(raw));
      this.problem = null;
      this.blocked = false;
    } catch {
      this.problem =
        '无法读取或校验本机数据。原始数据未被覆盖，请到设置导出原始数据或导入有效备份。';
      this.blocked = true;
    }
    return this.snapshot;
  }

  private publish() {
    for (const listener of this.listeners) listener(this.snapshot, this.problem);
  }

  private write(snapshot: Snapshot): Snapshot {
    const next = snapshotSchema.parse({ ...snapshot, updatedAt: Date.now() });
    try {
      this.storage().setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error('保存失败：浏览器存储不可用或空间不足。请保留当前输入，并导出数据备份。');
    }
    this.snapshot = next;
    this.problem = null;
    this.blocked = false;
    this.publish();
    return next;
  }

  async update(change: (draft: Snapshot) => void): Promise<Snapshot> {
    const commit = () => {
      const current = this.read();
      if (this.blocked) throw new Error(this.problem ?? '无法保存数据');
      const draft = structuredClone(current);
      change(draft);
      return this.write(draft);
    };
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(STORAGE_KEY, commit);
    return commit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        this.read();
        this.publish();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }

  export(): string {
    this.read();
    if (this.blocked) throw new Error(this.problem ?? '无法导出数据');
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: this.snapshot.data,
      } satisfies Backup,
      null,
      2,
    );
  }
  exportRaw(): string {
    return this.storage().getItem(STORAGE_KEY) ?? '';
  }
  validateBackup(raw: string): Backup {
    try {
      return backupSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error('备份无效：请检查文件版本、记录字段及分类和科目引用。当前数据未改变。');
    }
  }
  async import(backup: Backup): Promise<Snapshot> {
    const commit = () =>
      this.write({
        version: 1,
        updatedAt: Date.now(),
        data: backupSchema.parse(backup).data,
        timer: newTimer(),
      });
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(STORAGE_KEY, commit);
    return commit();
  }
}
