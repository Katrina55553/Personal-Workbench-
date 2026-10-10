import { useState } from 'react';
import { CheckCheck, Check, Pencil, Pin, Trash2, ListTodo } from 'lucide-react';
import { repository, useAppStore } from '../../data/store';
import type { Todo } from '../../data/schema';
import {
  Card,
  EmptyState,
  NewButton,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../shared/components';
import { useUi } from '../../shared/ui-context';
import styles from '../features.module.css';

export function TodoList({ items, compact = false }: { items: Todo[]; compact?: boolean }) {
  const canWrite = useAppStore((state) => state.canWrite);
  const { edit, confirm, run } = useUi();
  const ordered = [...items].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
  return (
    <div className={styles.todoList}>
      {ordered.map((item) => (
        <div
          className={`${styles.todoRow} ${item.done ? styles.completed : ''}`}
          key={item.id}
          data-testid="todo-row"
        >
          <button
            className={`${styles.checkbox} ${item.done ? styles.checked : ''}`}
            disabled={!canWrite}
            aria-label={`${item.done ? '取消完成' : '完成'} ${item.title}`}
            aria-pressed={item.done}
            onClick={() =>
              void run(() =>
                repository.update((draft) => {
                  const found = draft.data.todos.find((entry) => entry.id === item.id);
                  if (found) {
                    found.done = !found.done;
                    found.updatedAt = Date.now();
                  }
                }),
              )
            }
          >
            {item.done && <Check size={13} strokeWidth={3} />}
          </button>
          <button
            className={styles.recordTitle}
            disabled={!canWrite}
            onClick={() => edit({ kind: 'todo', item })}
          >
            <span>{item.title}</span>
            {!compact && item.note && <small>{item.note}</small>}
          </button>
          <span
            className={`badge ${item.priority === 'P0' ? 'red' : item.priority === 'P1' ? 'amber' : 'gray'}`}
          >
            {item.priority === 'P0' ? '高' : item.priority === 'P1' ? '中' : '低'}优先级
          </span>
          <button
            className={`icon-button ${item.pinned ? styles.pinned : ''}`}
            disabled={!canWrite}
            aria-label={`${item.pinned ? '取消置顶' : '置顶'} ${item.title}`}
            aria-pressed={item.pinned}
            onClick={() =>
              void run(() =>
                repository.update((draft) => {
                  const found = draft.data.todos.find((entry) => entry.id === item.id);
                  if (found) found.pinned = !found.pinned;
                }),
              )
            }
          >
            <Pin size={16} />
          </button>
          {!compact && (
            <>
              <button
                className="icon-button"
                disabled={!canWrite}
                aria-label={`编辑 ${item.title}`}
                onClick={() => edit({ kind: 'todo', item })}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button danger"
                disabled={!canWrite}
                aria-label={`删除 ${item.title}`}
                onClick={() =>
                  confirm({
                    title: '删除待办',
                    description: `确定删除「${item.title}」？此操作不可撤销。`,
                    action: async () => {
                      await repository.update((draft) => {
                        draft.data.todos = draft.data.todos.filter((entry) => entry.id !== item.id);
                      });
                    },
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function TodosPage() {
  const todos = useAppStore((state) => state.snapshot.data.todos);
  const { edit } = useUi();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('pending');
  const done = todos.filter((item) => item.done).length;
  const q = query.trim().toLocaleLowerCase();
  const items = todos.filter(
    (item) =>
      (filter === 'all' || item.done === (filter === 'done')) &&
      `${item.title} ${item.note}`.toLocaleLowerCase().includes(q),
  );
  return (
    <>
      <PageHeader
        eyebrow="TASKS"
        title="待办清单"
        description="清空脑中的杂事，把注意力留给眼前的一件。"
        action={<NewButton onClick={() => edit({ kind: 'todo' })}>新建待办</NewButton>}
      />
      <div className="stats-grid three">
        <StatCard
          title="待完成"
          value={todos.length - done}
          detail="一步一步，把事情做好"
          icon={ListTodo}
        />
        <StatCard
          title="已完成"
          value={done}
          detail={`累计 ${todos.length} 项待办`}
          icon={CheckCheck}
          color="green"
        />
        <StatCard
          title="置顶事项"
          value={todos.filter((item) => item.pinned).length}
          detail="让重要的事情先被看见"
          icon={Pin}
          color="amber"
        />
      </div>
      <Card>
        <div className="toolbar">
          <div className="tabs" aria-label="完成状态">
            {[
              ['pending', '未完成'],
              ['done', '已完成'],
              ['all', '全部'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key ?? 'all')}
                aria-pressed={filter === key}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput value={query} onChange={setQuery} />
        </div>
        {items.length ? (
          <TodoList items={items} />
        ) : (
          <EmptyState
            title={
              query
                ? '没有找到匹配待办'
                : filter === 'pending' && todos.length
                  ? '待办已全部完成'
                  : '给今天一个小目标'
            }
            description={query ? '试试其他关键词。' : '从一件具体的小事开始。'}
            action={<NewButton onClick={() => edit({ kind: 'todo' })}>新建待办</NewButton>}
          />
        )}
      </Card>
    </>
  );
}
