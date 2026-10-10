import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAppStore, repository } from '../../data/store';
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
import { monthLabel, shiftMonth } from '../../shared/date';
import { financeStats, money } from './stats';
import styles from '../features.module.css';

export function FinancePage() {
  const canWrite = useAppStore((state) => state.canWrite);
  const data = useAppStore((state) => state.snapshot.data);
  const today = useToday();
  const [monthOverride, setMonth] = useState<string | null>(null);
  const month = monthOverride ?? today.slice(0, 7);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const { edit, confirm } = useUi();
  const stats = financeStats(data.transactions, month);
  const q = query.trim().toLocaleLowerCase();
  const items = stats.records
    .filter(
      (item) =>
        (filter === 'all' || item.type === filter) &&
        (category === 'all' || item.categoryId === category) &&
        `${item.title} ${item.note}`.toLocaleLowerCase().includes(q),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const categories = data.categories.filter(
    (item) => item.active || stats.records.some((record) => record.categoryId === item.id),
  );
  return (
    <>
      <PageHeader
        eyebrow="PERSONAL FINANCE"
        title="收支账本"
        description="每一笔都心中有数，把生活过得从容一些。"
        action={<NewButton onClick={() => edit({ kind: 'finance' })}>记一笔</NewButton>}
      />
      <div className="stats-grid three">
        <StatCard
          title="当月收入"
          value={money(stats.income)}
          detail={`${monthLabel(month)} · 按记录日期统计`}
          icon={ArrowDownLeft}
          color="green"
        />
        <StatCard
          title="当月支出"
          value={money(stats.expense)}
          detail={`当月共 ${stats.records.length} 笔收支`}
          icon={ArrowUpRight}
          color="amber"
        />
        <StatCard
          title="当月结余"
          value={money(stats.balance)}
          detail="收入减去支出"
          icon={Wallet}
        />
      </div>
      <div className="split-grid">
        <Card
          title="收支明细"
          action={
            <div className={styles.weekSwitcher}>
              <button
                className="icon-button"
                aria-label="上一月"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                aria-label="选择月份"
                value={month}
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
                }}
              />
              <button
                className="icon-button"
                aria-label="下一月"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        >
          <div className="toolbar wrap">
            <div className="tabs">
              {[
                ['all', '全部'],
                ['expense', '支出'],
                ['income', '收入'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  className={filter === key ? 'active' : ''}
                  onClick={() => setFilter(key ?? 'all')}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="筛选分类"
              className="filter-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">所有分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.type === 'income' ? '收入 · ' : ''}
                  {item.name}
                  {!item.active ? '（已停用）' : ''}
                </option>
              ))}
            </select>
            <SearchInput value={query} onChange={setQuery} />
          </div>
          {items.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>项目 / 日期</th>
                    <th>分类</th>
                    <th className={styles.alignRight}>金额</th>
                    <th className={styles.alignRight}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.transactionTitle}>
                          <span
                            className={`${styles.flowIcon} ${item.type === 'income' ? styles.income : ''}`}
                          >
                            {item.type === 'income' ? (
                              <ArrowDownLeft size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.date}
                              {item.note && ` · ${item.note}`}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge gray">
                          {data.categories.find((entry) => entry.id === item.categoryId)?.name}
                        </span>
                      </td>
                      <td
                        className={`${styles.alignRight} ${item.type === 'income' ? styles.incomeAmount : ''}`}
                      >
                        <strong>
                          {item.type === 'income' ? '+' : '−'}
                          {money(item.amountCents)}
                        </strong>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            disabled={!canWrite}
                            aria-label={`编辑 ${item.title}`}
                            onClick={() => edit({ kind: 'finance', item })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            disabled={!canWrite}
                            aria-label={`删除 ${item.title}`}
                            onClick={() =>
                              confirm({
                                title: '删除收支记录',
                                description: `确定删除「${item.title}」？`,
                                action: async () => {
                                  await repository.update((draft) => {
                                    draft.data.transactions = draft.data.transactions.filter(
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                query || category !== 'all' || filter !== 'all'
                  ? '没有匹配的记录'
                  : '这个月还没有收支记录'
              }
              description="记下第一笔，慢慢了解自己的生活。"
              action={<NewButton onClick={() => edit({ kind: 'finance' })}>记一笔</NewButton>}
            />
          )}
        </Card>
        <Card title="支出分布" subtitle={monthLabel(month)}>
          <Distribution
            rows={stats.categories.map(([id, value]) => ({
              name: data.categories.find((item) => item.id === id)?.name ?? '其他',
              value,
              label: money(value),
            }))}
          />
          <div className={styles.sideTip}>
            分类可在设置中新增、改名或停用。停用后，历史记录依然保留。
          </div>
        </Card>
      </div>
    </>
  );
}
