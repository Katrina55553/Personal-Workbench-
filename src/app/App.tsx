import { useEffect } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import {
  Cat,
  LayoutDashboard,
  ListTodo,
  Leaf,
  Wallet,
  BookOpen,
  Settings2,
  ArrowUpRight,
  HardDrive,
  Moon,
  Sun,
  Cloud,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { DashboardPage } from '../features/dashboard/Dashboard';
import { TodosPage } from '../features/todos/Todos';
import { HabitsPage } from '../features/habits/Habits';
import { FinancePage } from '../features/finance/Finance';
import { StudyPage } from '../features/study/Study';
import { SettingsPage } from '../features/settings/Settings';
import { TimerController } from '../features/study/Timer';
import { UiProvider } from '../shared/UiProvider';
import { repository, useAppStore } from '../data/store';
import { cloudClient } from '../data/cloud-client';
import { CloudRepository } from '../data/cloud-repository';
import { AuthGate } from '../features/auth/AuthGate';
import { useToday } from '../shared/hooks';
import { useTheme } from '../shared/theme';
import { useUi } from '../shared/ui-context';
import styles from './App.module.css';

function WorkbenchLayout() {
  const location = useLocation();
  const problem = useAppStore((state) => state.problem);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const pendingCount = useAppStore((state) => state.pendingCount);
  const today = useToday();
  const { theme, toggleTheme } = useTheme();
  const { notify } = useUi();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  const nav = [
    { to: '/', name: '概览', icon: LayoutDashboard },
    { to: '/todos', name: '待办清单', icon: ListTodo },
    { to: '/habits', name: '习惯打卡', icon: Leaf },
    { to: '/finance', name: '收支账本', icon: Wallet },
    { to: '/study', name: '自习记录', icon: BookOpen },
  ];
  return (
    <>
      <a
        href="#main"
        className={styles.skipLink}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="#/">
          <span className={styles.brandIcon}>
            <Cat size={26} />
          </span>
          <div>
            <strong>
              我的工作台<span className={styles.brandDot}>.</span>
            </strong>
            <small>PERSONAL WORKBENCH</small>
          </div>
        </a>
        <div className={styles.navLabel}>工作空间</div>
        <nav aria-label="主导航">
          {nav.map(({ to, name, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
            >
              <Icon size={19} />
              <span>{name}</span>
              {to === '/' && <ArrowUpRight size={13} className={styles.navArrow} />}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarNote}>
            <span className={styles.noteRule} />
            <p>
              把生活整理好，
              <br />
              把时间留给喜欢的事。
            </p>
            <Cat size={33} strokeWidth={1.2} />
          </div>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
          >
            <Settings2 size={19} />
            <span>设置与备份</span>
          </NavLink>
          <div className={styles.localStatus} role="status">
            <span />
            {repository.mode === 'cloud' ? <Cloud size={12} /> : <HardDrive size={12} />}
            {
              {
                local: '数据保存在本机',
                loading: '正在加载云端数据',
                saving: '正在保存',
                synced: '云端已同步',
                offline: '离线 · 仅供查看',
                error: '同步失败 · 仅供查看',
              }[syncStatus]
            }
          </div>
          {pendingCount > 0 && (
            <div className={styles.localStatus}>{pendingCount} 条计时记录待上传</div>
          )}
          {repository instanceof CloudRepository && (
            <button
              className="text-button"
              onClick={() => {
                if (repository instanceof CloudRepository) void repository.refresh();
              }}
            >
              <RefreshCw size={12} /> 重试同步
            </button>
          )}
        </div>
      </aside>
      <div className={styles.workspace}>
        <div className={styles.topbar}>
          <span>
            个人空间 <span>/</span>{' '}
            {nav.find((item) => item.to === location.pathname)?.name ?? '设置与备份'}
          </span>
          <div>
            <span className={styles.statusDot} />
            保持自己的节奏 <span className={styles.topbarDate}>{today.replaceAll('-', '.')}</span>
            <button
              type="button"
              className={styles.themeToggle}
              aria-label={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
              title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
              onClick={() => {
                if (!toggleTheme())
                  notify('外观已切换，但偏好未能保存；刷新后可能恢复原来的外观。', true);
              }}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              <span>{theme === 'light' ? '暗色模式' : '亮色模式'}</span>
            </button>
            {cloudClient && (
              <button
                type="button"
                className={styles.themeToggle}
                onClick={() => {
                  void cloudClient?.auth.signOut({ scope: 'local' }).then(({ error }) => {
                    if (error) notify('退出失败，请重试', true);
                  });
                }}
              >
                <LogOut size={15} />
                退出登录
              </button>
            )}
          </div>
        </div>
        <main id="main" tabIndex={-1} className={styles.main}>
          {problem && (
            <div role="alert" className={styles.storageWarning}>
              {problem} <a href="#/settings">打开数据恢复</a>
            </div>
          )}
          <fieldset className={styles.businessArea}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/todos" element={<TodosPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="/study" element={<StudyPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </fieldset>
          <footer className={styles.footer}>
            <span>我的工作台 · 给日常留一点秩序</span>
            <span>一点记录，一点进步。</span>
          </footer>
        </main>
      </div>
      <TimerController />
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <AuthGate>
        <UiProvider>
          <WorkbenchLayout />
        </UiProvider>
      </AuthGate>
    </HashRouter>
  );
}
