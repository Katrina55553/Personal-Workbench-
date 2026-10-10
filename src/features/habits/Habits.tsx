import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flame, Leaf, Pencil, Trash2 } from 'lucide-react';
import { useAppStore, repository } from '../../data/store';
import type { Habit } from '../../data/schema';
import { addDays, shortDate, weekDates } from '../../shared/date';
import { useToday } from '../../shared/hooks';
import {
  Card,
  EmptyState,
  NewButton,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../shared/components';
import { useUi } from '../../shared/ui-context';
import { currentStreak, longestStreak } from './stats';
import styles from '../features.module.css';

export function HabitTable({
  items,
  date,
  compact = false,
}: {
  items: Habit[];
  date: string;
  compact?: boolean;
}) {
  const today = useToday();
  const days = weekDates(date);
  const { run, edit, confirm } = useUi();
  const toggle = (id: string, day: string) =>
    void run(() =>
      repository.update((draft) => {
        if (day > today) throw new Error('不能提前打卡未来日期');
        const item = draft.data.habits.find((entry) => entry.id === id);
        if (item) {
          if (item.log[day]) delete item.log[day];
          else item.log[day] = true;
          item.updatedAt = Date.now();
        }
      }),
    );
  return (
    <div className={styles.tableScroll}>
      <table className={styles.habitTable}>
        <thead>
          <tr>
            <th>习惯</th>
            {days.map((day, i) => (
              <th key={day} className={day === today ? styles.todayCol : ''}>
                <span>{['一', '二', '三', '四', '五', '六', '日'][i]}</span>
                <small>{day.slice(8)}</small>
              </th>
            ))}
            <th>连续</th>
            {!compact && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button className={styles.habitTitle} onClick={() => edit({ kind: 'habit', item })}>
                  <span className={styles.habitDot} />
                  {item.title}
                </button>
                {!compact && item.note && <small className={styles.cellNote}>{item.note}</small>}
              </td>
              {days.map((day) => (
                <td key={day} className={day === today ? styles.todayCol : ''}>
                  <button
                    className={`${styles.habitCheck} ${item.log[day] ? styles.habitOn : ''}`}
                    aria-label={`${item.title} ${day} ${item.log[day] ? '撤销打卡' : '打卡'}`}
                    aria-pressed={!!item.log[day]}
                    disabled={day > today}
                    onClick={() => toggle(item.id, day)}
                  >
                    {item.log[day] ? <Check size={15} strokeWidth={2.8} /> : <span />}
                  </button>
                </td>
              ))}
              <td>
                <span className={styles.streak}>
                  <Flame size={13} />
                  {currentStreak(item.log, today)} 天
                </span>
                {!compact && (
                  <small className={styles.cellNote}>最长 {longestStreak(item.log)} 天</small>
                )}
              </td>
              {!compact && (
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`编辑 ${item.title}`}
                      onClick={() => edit({ kind: 'habit', item })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`删除 ${item.title}`}
                      onClick={() =>
                        confirm({
                          title: '删除习惯',
                          description: `删除「${item.title}」及其全部打卡记录？`,
                          action: async () => {
                            await repository.update((draft) => {
                              draft.data.habits = draft.data.habits.filter(
                                (entry) => entry.id !== item.id,
                              );
                            });
                          },
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HabitsPage() {
  const habits = useAppStore((state) => state.snapshot.data.habits);
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const days = weekDates(addDays(today, offset * 7));
  const { edit } = useUi();
  const completed = habits.filter((item) => item.log[today]).length;
  const q = query.trim().toLocaleLowerCase();
  const items = habits.filter((item) =>
    `${item.title} ${item.note}`.toLocaleLowerCase().includes(q),
  );
  return (
    <>
      <PageHeader
        eyebrow="DAILY HABITS"
        title="习惯打卡"
        description="每天一点点，时间会看见你的积累。"
        action={<NewButton onClick={() => edit({ kind: 'habit' })}>新建习惯</NewButton>}
      />
      <div className="stats-grid three">
        <StatCard
          title="今日已打卡"
          value={`${completed} / ${habits.length}`}
          detail="每个小小的勾选，都有意义"
          icon={Check}
          color="green"
        />
        <StatCard
          title="当前最长连续"
          value={`${Math.max(0, ...habits.map((item) => currentStreak(item.log, today)))} 天`}
          detail="今天未打卡时，延续昨天的连续记录"
          icon={Flame}
          color="amber"
        />
        <StatCard
          title="历史最长连续"
          value={`${Math.max(0, ...habits.map((item) => longestStreak(item.log)))} 天`}
          detail="给坚持留下一份记录"
          icon={Leaf}
        />
      </div>
      <Card title="每周习惯追踪" subtitle="点击日期格即可打卡或撤销">
        <div className="toolbar">
          <div className={styles.weekSwitcher}>
            <button
              className="icon-button"
              aria-label="上一周"
              onClick={() => setOffset(offset - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>
              {shortDate(days[0] ?? today)} — {shortDate(days[6] ?? today)}
            </strong>
            <button
              className="icon-button"
              aria-label="下一周"
              disabled={offset === 0}
              onClick={() => setOffset(offset + 1)}
            >
              <ChevronRight size={17} />
            </button>
            {offset !== 0 && (
              <button className="text-button" onClick={() => setOffset(0)}>
                回到本周
              </button>
            )}
          </div>
          <SearchInput value={query} onChange={setQuery} />
        </div>
        {items.length ? (
          <HabitTable items={items} date={days[0] ?? today} />
        ) : (
          <EmptyState
            title={query ? '没有匹配的习惯' : '从一个好习惯开始'}
            description="比如喝水、阅读，或者出门走一走。"
            action={<NewButton onClick={() => edit({ kind: 'habit' })}>新建习惯</NewButton>}
          />
        )}
      </Card>
    </>
  );
}
