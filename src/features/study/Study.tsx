import { useState } from 'react';
import { BookOpen, Clock3, CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { repository, useAppStore } from '../../data/store';
import {
  Card,
  Distribution,
  EmptyState,
  NewButton,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../shared/components';
import { useUi } from '../../shared/ui-context';
import { useToday } from '../../shared/hooks';
import { shortDate } from '../../shared/date';
import { TimerCard } from './Timer';
import { duration, studyStats } from './stats';
import styles from '../features.module.css';

export function StudyChart() {
  const records = useAppStore((state) => state.snapshot.data.studyRecords);
  const today = useToday();
  const stats = studyStats(records, today);
  const max = Math.max(30, ...stats.recent.map((day) => day.minutes));
  return (
    <div
      className={styles.studyChart}
      role="img"
      aria-label={`近七天自习时长：${stats.recent.map((day) => `${day.date} ${day.minutes} 分钟`).join('，')}`}
    >
      {stats.recent.map((day) => (
        <div key={day.date} className={styles.chartColumn}>
          <div className={styles.chartBarArea}>
            <span className={styles.chartValue}>{day.minutes > 0 ? day.minutes : ''}</span>
            <div
              className={`${styles.chartBar} ${day.date === today ? styles.chartToday : ''}`}
              style={{ height: `${Math.max(3, (day.minutes / max) * 100)}%` }}
            />
          </div>
          <span>{day.date === today ? '今天' : shortDate(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

export function StudyPage() {
  const data = useAppStore((state) => state.snapshot.data);
  const today = useToday();
  const stats = studyStats(data.studyRecords, today);
  const { edit, confirm } = useUi();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('all');
  const q = query.trim().toLocaleLowerCase();
  const records = data.studyRecords
    .filter(
      (item) =>
        (subject === 'all' || item.subjectId === subject) &&
        `${item.title} ${item.note}`.toLocaleLowerCase().includes(q),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return (
    <>
      <PageHeader
        eyebrow="FOCUS & LEARNING"
        title="自习记录"
        description="每一段认真投入的时间，都在让你向前。"
        action={<NewButton onClick={() => edit({ kind: 'study' })}>记录自习</NewButton>}
      />
      <div className="stats-grid three">
        <StatCard
          title="今日自习"
          value={duration(stats.today)}
          detail="把专注留给值得的事"
          icon={Clock3}
        />
        <StatCard
          title="本周自习"
          value={duration(stats.week)}
          detail="周一至周日"
          icon={CalendarDays}
          color="green"
        />
        <StatCard
          title="累计自习"
          value={duration(stats.total)}
          detail={`共 ${data.studyRecords.length} 次学习记录`}
          icon={BookOpen}
          color="violet"
        />
      </div>
      <div className="split-grid">
        <div className="stack">
          <Card title="学习足迹" subtitle="近七天 · 分钟">
            <StudyChart />
          </Card>
          <Card title="自习明细">
            <div className="toolbar">
              <select
                className="filter-select"
                aria-label="筛选科目"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option value="all">所有科目</option>
                {data.subjects
                  .filter(
                    (item) =>
                      item.active ||
                      data.studyRecords.some((record) => record.subjectId === item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {!item.active ? '（已停用）' : ''}
                    </option>
                  ))}
              </select>
              <SearchInput value={query} onChange={setQuery} />
            </div>
            {records.length ? (
              <div className={styles.studyList}>
                {records.map((item) => (
                  <article key={item.id} className={styles.studyRow}>
                    <span className={styles.studyIcon}>
                      <BookOpen size={18} />
                    </span>
                    <div className={styles.studyMain}>
                      <h3>{item.title}</h3>
                      <div className={styles.studyMeta}>
                        <span>{item.date}</span>
                        <span>
                          {data.subjects.find((entry) => entry.id === item.subjectId)?.name}
                        </span>
                        <span className="badge gray">
                          {item.source === 'pomodoro' ? '番茄钟' : '手动记录'}
                        </span>
                      </div>
                      {item.note && <p>{item.note}</p>}
                    </div>
                    <strong className={styles.studyDuration}>{duration(item.minutes)}</strong>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`编辑 ${item.title}`}
                        onClick={() => edit({ kind: 'study', item })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label={`删除 ${item.title}`}
                        onClick={() =>
                          confirm({
                            title: '删除自习记录',
                            description: `确定删除「${item.title}」？统计时长将同步更新。`,
                            action: async () => {
                              await repository.update((draft) => {
                                draft.data.studyRecords = draft.data.studyRecords.filter(
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
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title={query || subject !== 'all' ? '没有匹配的自习记录' : '给自己一段专注时间'}
                description="手动记下学习，或开始一个 25 分钟番茄钟。"
                action={<NewButton onClick={() => edit({ kind: 'study' })}>记录自习</NewButton>}
              />
            )}
          </Card>
        </div>
        <div className="stack">
          <TimerCard />
          <Card title="科目分布" subtitle="累计学习时长">
            <Distribution
              rows={stats.bySubject.map(([id, value]) => ({
                name: data.subjects.find((item) => item.id === id)?.name ?? '其他',
                value,
                label: duration(value),
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
