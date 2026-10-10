import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
function configure() {
  if (!!url !== !!key)
    return { client: null, error: '云端配置不完整：请同时配置 Supabase URL 和 publishable key。' };
  try {
    return { client: url && key ? createClient(url, key) : null, error: null };
  } catch {
    return { client: null, error: '云端配置无效，请检查 Supabase URL 和 publishable key。' };
  }
}
const configuration = configure();
export const cloudConfigurationError = configuration.error;
export const cloudProject = url ?? '';
export const cloudClient = configuration.client;
