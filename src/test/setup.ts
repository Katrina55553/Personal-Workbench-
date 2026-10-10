import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unit tests must never connect to a project configured in the developer's .env.local.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');

afterEach(cleanup);
