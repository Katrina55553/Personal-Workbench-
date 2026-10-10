import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { AuthGate } from './AuthGate';

const auth = vi.hoisted(() => {
  const listeners = new Set<(event: string, session: Session | null) => void>();
  const session: Session = {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'owner@example.test',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-10T00:00:00Z',
    },
  };
  const state: { session: Session | null; fail: boolean } = { session: null, fail: false };
  return {
    state,
    session,
    listeners,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: (fn: (event: string, session: Session | null) => void) => {
      listeners.add(fn);
      return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
    },
    signInWithPassword: vi.fn(async () => {
      if (state.fail) return { error: new Error('invalid credentials') };
      state.session = session;
      listeners.forEach((fn) => fn('SIGNED_IN', session));
      return { error: null };
    }),
  };
});
vi.mock('../../data/cloud-client', () => ({
  cloudClient: { auth },
  cloudConfigurationError: null,
}));
vi.mock('../../data/store', async () => {
  const { CloudRepository } = await import('../../data/cloud-repository');
  const { createInitialSnapshot } = await import('../../data/defaults');
  const { create } = await import('zustand');
  const snapshot = { data: createInitialSnapshot().data, revision: 0, timerEpoch: 0, updatedAt: 0 };
  const repository = new CloudRepository(
    {
      load: async () => structuredClone(snapshot),
      save: async () => structuredClone(snapshot),
      complete: async () => structuredClone(snapshot),
      subscribe: () => () => {},
    },
    'auth-test',
  );
  const useAppStore = create(() => ({
    syncStatus: repository.status,
    canWrite: repository.canWrite,
  }));
  repository.subscribe(() =>
    useAppStore.setState({ syncStatus: repository.status, canWrite: repository.canWrite }),
  );
  return { repository, useAppStore };
});
beforeEach(() => {
  auth.state.session = null;
  auth.state.fail = false;
  auth.signInWithPassword.mockClear();
  localStorage.clear();
});
it('email/password login opens the workbench and logout hides it', async () => {
  const user = userEvent.setup();
  render(
    <AuthGate>
      <p>已登录内容</p>
    </AuthGate>,
  );
  await screen.findByRole('heading', { name: '登录我的工作台' });
  expect(screen.queryByText('已登录内容')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('邮箱'), 'owner@example.test');
  await user.type(screen.getByLabelText('密码'), 'test-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  await screen.findByText('已登录内容');
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'owner@example.test',
    password: 'test-password',
  });
  auth.state.session = null;
  auth.listeners.forEach((fn) => fn('SIGNED_OUT', null));
  await waitFor(() => expect(screen.queryByText('已登录内容')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: '登录我的工作台' })).toBeInTheDocument();
});
it('a failed login retains the form and displays an error', async () => {
  auth.state.fail = true;
  const user = userEvent.setup();
  render(
    <AuthGate>
      <p>已登录内容</p>
    </AuthGate>,
  );
  await screen.findByRole('heading', { name: '登录我的工作台' });
  await user.type(screen.getByLabelText('邮箱'), 'owner@example.test');
  await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('邮箱')).toHaveValue('owner@example.test');
  expect(screen.getByLabelText('密码')).toHaveValue('wrong-password');
});
it('restores an existing login and loads cloud data before displaying content', async () => {
  auth.state.session = auth.session;
  render(
    <AuthGate>
      <p>已登录内容</p>
    </AuthGate>,
  );
  await screen.findByText('已登录内容');
  expect(screen.queryByRole('heading', { name: '登录我的工作台' })).not.toBeInTheDocument();
});
