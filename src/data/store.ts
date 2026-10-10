import { create } from 'zustand';
import { Repository } from './repository';
import type { Snapshot } from './schema';
import type { SyncStatus } from './cloud-schema';
import { CloudRepository } from './cloud-repository';
import { cloudClient, cloudProject } from './cloud-client';
import { createCloudApi } from './cloud-api';

export const repository = cloudClient
  ? new CloudRepository(createCloudApi(cloudClient), cloudProject)
  : new Repository();
interface AppStore {
  snapshot: Snapshot;
  problem: string | null;
  syncStatus: SyncStatus;
  canWrite: boolean;
  pendingCount: number;
  revision: number;
}
export const useAppStore = create<AppStore>(() => ({
  snapshot: repository.read(),
  problem: repository.problem,
  syncStatus: repository.status,
  canWrite: repository.canWrite,
  pendingCount: repository.pendingCount,
  revision: repository.revision,
}));
repository.subscribe((snapshot, problem) =>
  useAppStore.setState({
    snapshot,
    problem,
    syncStatus: repository.status,
    canWrite: repository.canWrite,
    pendingCount: repository.pendingCount,
    revision: repository.revision,
  }),
);
