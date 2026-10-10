import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudClient, cloudConfigurationError } from '../../data/cloud-client';
import { CloudRepository } from '../../data/cloud-repository';
import { repository, useAppStore } from '../../data/store';
import { Field, FormError } from '../../shared/components';
import styles from './auth.module.css';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!cloudClient);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = useAppStore((state) => state.syncStatus);
  useEffect(() => {
    const client = cloudClient;
    if (!client || !(repository instanceof CloudRepository)) return;
    const cloud = repository;
    let active = true;
    let authEvent = 0;
    const apply = (next: Session | null) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
      if (next) void cloud.connect(next.user.id);
      else cloud.disconnect();
    };
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      authEvent++;
      // RPC calls must run after the auth callback releases the client's lock.
      window.setTimeout(() => apply(next), 0);
    });
    const initialEvent = authEvent;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active || initialEvent !== authEvent) return;
      if (error) setError('登录状态恢复失败，请重新登录');
      apply(data.session);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
      cloud.disconnect();
    };
  }, []);
  if (cloudConfigurationError)
    return (
      <div className={styles.container}>
        <p role="alert">{cloudConfigurationError}</p>
      </div>
    );
  if (!cloudClient) return children;
  if (loading || (session && status === 'loading'))
    return (
      <div className={styles.container}>
        <p role="status">正在加载工作台…</p>
      </div>
    );
  if (session) return <div key={session.user.id}>{children}</div>;
  return (
    <main className={styles.container}>
      <form
        className={styles.card}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          if (!cloudClient) return;
          setBusy(true);
          setError('');
          try {
            const result = await cloudClient.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (result.error) throw result.error;
            setPassword('');
          } catch {
            setError('登录失败，请检查邮箱、密码及网络连接');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>登录我的工作台</h1>
        <p>在不同电脑登录同一账号，即可查看相同的记录。</p>
        <Field label="邮箱" id="login-email">
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="密码" id="login-password">
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <FormError message={error} />
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? '正在登录…' : '登录'}
        </button>
        <small>账号由工作台管理员创建。忘记密码时，请联系管理员重置。</small>
      </form>
    </main>
  );
}
