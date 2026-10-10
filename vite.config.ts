import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  define:
    mode === 'local-test'
      ? {
          'import.meta.env.VITE_SUPABASE_URL': '""',
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
        }
      : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/data/**/*.ts', 'src/shared/date.ts', 'src/features/**/stats.ts'],
    },
  },
}));
