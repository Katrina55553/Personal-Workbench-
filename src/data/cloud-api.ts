import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudSchema } from './cloud-schema';
import type { CloudSnapshot } from './cloud-schema';
import type { AppData, StudyRecord } from './schema';

export class CloudError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface CloudApi {
  load(): Promise<CloudSnapshot>;
  save(data: AppData, revision: number, replace: boolean): Promise<CloudSnapshot>;
  complete(record: StudyRecord, epoch: number): Promise<CloudSnapshot>;
  subscribe(userId: string, changed: () => void, reconnected: () => void): () => void;
}

export function createCloudApi(client: SupabaseClient): CloudApi {
  const rpc = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
    if (error) throw new CloudError(error.message, error.message);
    return cloudSchema.parse(data);
  };
  return {
    load: () => rpc('read_workbench'),
    save: (data, revision, replace) =>
      rpc(replace ? 'replace_workbench' : 'commit_workbench', {
        p_data: data,
        p_expected_revision: revision,
      }),
    complete: (record, epoch) =>
      rpc('complete_pomodoro', { p_record: record, p_timer_epoch: epoch }),
    subscribe: (userId, changed, reconnected) => {
      const channel = client
        .channel(`workbench:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'workbench_state',
            filter: `owner_id=eq.${userId}`,
          },
          changed,
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') reconnected();
        });
      return () => void client.removeChannel(channel);
    },
  };
}
