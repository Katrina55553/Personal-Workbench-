import { z } from 'zod';
import { businessSchema, studySchema, timerSchema } from './schema';

export const cloudSchema = z.strictObject({
  data: businessSchema,
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  timerEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const localCloudSchema = z.strictObject({
  cloud: cloudSchema,
  timer: timerSchema,
  pending: z.array(studySchema),
});
export type CloudSnapshot = z.infer<typeof cloudSchema>;
export type LocalCloudSnapshot = z.infer<typeof localCloudSchema>;
export type SyncStatus = 'local' | 'loading' | 'saving' | 'synced' | 'offline' | 'error';
