import { loadEnv } from 'vite';

const config = loadEnv('production', process.cwd(), 'VITE_');
const url = config.VITE_SUPABASE_URL;
const key = config.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error('云端构建需要 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY');
if (!['http:', 'https:'].includes(new URL(url).protocol))
  throw new Error('Supabase URL 必须使用 HTTP 或 HTTPS');
let role;
try {
  role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
} catch {
  /* Publishable keys are not JWTs. */
}
if (key.startsWith('sb_secret_') || role === 'service_role')
  throw new Error('前端只能使用 publishable key 或旧版 anon key，禁止使用管理密钥');
console.log('云端客户端配置检查通过。');
