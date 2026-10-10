import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

Object.assign(process.env, loadEnv('cloud-test', process.cwd(), 'SUPABASE_TEST_'));
if (
  !process.env.SUPABASE_TEST_URL ||
  !process.env.SUPABASE_TEST_ANON_KEY ||
  !process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
)
  throw new Error(
    '云端集成测试需要独立测试项目。启动本地 Supabase 并配置 .env.cloud-test.local，详见 docs/cloud-deployment.md。',
  );
export default defineConfig({
  testDir: './tests',
  testMatch: 'cloud.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'cloud-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
