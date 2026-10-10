import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const output = execFileSync('supabase', ['status', '-o', 'env'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const values = Object.fromEntries(
  [...output.matchAll(/^(\w+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]),
);
if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY)
  throw new Error('本地 Supabase 未启动或缺少测试凭据');
if (!['127.0.0.1', 'localhost'].includes(new URL(values.API_URL).hostname))
  throw new Error('自动配置只允许本地 Supabase 测试项目');
const config = {
  VITE_SUPABASE_URL: values.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: values.ANON_KEY,
  SUPABASE_TEST_URL: values.API_URL,
  SUPABASE_TEST_ANON_KEY: values.ANON_KEY,
  SUPABASE_TEST_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
};
writeFileSync(
  '.env.cloud-test.local',
  Object.entries(config)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
console.log('本地云端测试配置已写入 .env.cloud-test.local。该文件已被 Git 忽略。');
