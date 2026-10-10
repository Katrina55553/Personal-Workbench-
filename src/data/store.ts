import { create } from 'zustand';
import { Repository } from './repository';
import type { Snapshot } from './schema';

export const repository = new Repository();
interface AppStore {
  snapshot: Snapshot;
  problem: string | null;
}
export const useAppStore = create<AppStore>(() => ({
  snapshot: repository.read(),
  problem: repository.problem,
}));
repository.subscribe((snapshot, problem) => useAppStore.setState({ snapshot, problem }));
