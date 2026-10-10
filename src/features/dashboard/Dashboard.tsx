import {
  CalendarDays,
  CheckCheck,
  Clock3,
  Leaf,
  ListTodo,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useAppStore } from '../../data/store';
import {
  Card,
  EmptyState,
  NewButton,
  PageHeader,
  StatCard,
  ViewLink,
  Distribution,
} from '../../shared/components';
import { useToday } from '../../shared/hooks';
import { dateLabel } from '../../shared/date';
import { useUi } from '../../shared/ui-context';
import { TodoList } from '../todos/Todos';
import { HabitTable } from '../habits/Habits';
import { financeStats, money } from '../finance/stats';
import { studyStats, duration } from '../study/stats';
import { StudyChart } from '../study/Study';
import { TimerCard } from '../study/Timer';
import type { EditorRequest } from '../../shared/ui-context';
import styles from '../features.module.css';

export function DashboardPage() {
  const data = useAppStore((state) => state.snapshot.data);
  const today = useToday();
  const { edit } = useUi();
  const pending = data.todos.filter((item) => !item.done);
  const focus = [...pending]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
    .slice(0, 6);
  const doneHabits = data.habits.filter((item) => item.log[today]).length;
  const finance = financeStats(data.transactions, today.slice(0, 7));
  const study = studyStats(data.studyRecords, today);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const quick: {
    kind: EditorRequest['kind'];
    label: string;
    description: string;
    icon: typeof ListTodo;
    color: string;
  }[] = [
    {
      kind: 'todo',
      label: '新建待办',
      description: '记下接下来要做的事',
      icon: ListTodo,
      color: 'blue',
    },
    {
      kind: 'habit',
      label: '添加习惯',
      description: '给生活一个小小惯例',
      icon: Leaf,
      color: 'green',
    },
    {
      kind: 'finance',
      label: '记一笔',
      description: '收入或支出，随手记录',
      icon: Wallet,
      color: 'amber',
    },
    {
      kind: 'study',
      label: '记录自习',
      description: '让投入的时间被看见',
      icon: Clock3,
      color: 'violet',
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR DAILY SPACE"
        title="今天，也向前一点。"
        description={`${greeting}，欢迎回到你的工作台。`}
        action={
          <span className={styles.dateChip}>
            <CalendarDays size={16} />
            {dateLabel(today)}
          </span>
        }
      />
      <div className={styles.welcomeStrip}>
        <Sparkles size={16} />
        <span>不必一次做好所有事。从眼前的一件开始。</span>
        <span className={styles.welcomeCount}>
          {data.todos.filter((item) => item.done).length} 件事已经完成 <CheckCheck size={14} />
        </span>
      </div>
      <div className="stats-grid">
        <StatCard
          title="待完成事项"
          value={pending.length}
          detail={`${data.todos.filter((item) => item.pinned && !item.done).length} 项已置顶 · 保持一点余地`}
          icon={ListTodo}
        />
        <StatCard
          title="今日习惯"
          value={
            <>
              {doneHabits}
              <span className={styles.statSuffix}> / {data.habits.length}</span>
            </>
          }
          detail="每天一个小小的进步"
          icon={Leaf}
          color="green"
        />
        <StatCard
          title="本月支出"
          value={money(finance.expense)}
          detail={`收入 ${money(finance.income)} · 结余 ${money(finance.balance)}`}
          icon={Wallet}
          color="amber"
        />
        <StatCard
          title="今日自习"
          value={duration(study.today)}
          detail={`本周累计 ${duration(study.week)}`}
          icon={Clock3}
          color="violet"
        />
      </div>
      <div className={styles.dashboardGrid}>
        <div className="stack">
          <Card
            title="眼前的事"
            subtitle={`${pending.length} 项待完成`}
            icon={ListTodo}
            action={<ViewLink to="/todos" />}
          >
            {focus.length ? (
              <TodoList items={focus} compact />
            ) : (
              <EmptyState
                title="留一点空间，开始新的事"
                description="重要事项可以置顶，在这里先被看见。"
                action={<NewButton onClick={() => edit({ kind: 'todo' })}>新建待办</NewButton>}
              />
            )}
          </Card>
          <Card title="本周习惯" icon={Leaf} action={<ViewLink to="/habits" />}>
            {data.habits.length ? (
              <HabitTable items={data.habits.slice(0, 5)} date={today} compact />
            ) : (
              <EmptyState
                title="小小的坚持，从今天开始"
                description="建立一个习惯，每天来这里打个勾。"
                action={<NewButton onClick={() => edit({ kind: 'habit' })}>添加习惯</NewButton>}
              />
            )}
          </Card>
          <Card
            title="学习足迹"
            subtitle="近七天 · 分钟"
            icon={Clock3}
            action={<ViewLink to="/study" />}
          >
            <StudyChart />
          </Card>
        </div>
        <div className="stack">
          <TimerCard />
          <Card title="快速记录" icon={Plus}>
            <div className={styles.quickGrid}>
              {quick.map(({ kind, label, description, icon: Icon, color }) => (
                <button key={kind} onClick={() => edit({ kind })} className={styles.quickButton}>
                  <span className={`${styles.quickIcon} ${styles[color]}`}>
                    <Icon size={19} />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </div>
                  <Plus size={14} />
                </button>
              ))}
            </div>
          </Card>
          <Card
            title="这个月，花在哪里"
            subtitle="支出分类"
            icon={Wallet}
            action={<ViewLink to="/finance" />}
          >
            <Distribution
              rows={finance.categories.slice(0, 5).map(([id, value]) => ({
                name: data.categories.find((item) => item.id === id)?.name ?? '其他',
                value,
                label: money(value),
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
