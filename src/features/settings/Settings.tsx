import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  Plus,
  Pencil,
  Tag,
  BookOpen,
  HardDrive,
} from 'lucide-react';
import { repository, useAppStore } from '../../data/store';
import { Card, Modal, Field, FormActions, FormError, PageHeader } from '../../shared/components';
import { useUi } from '../../shared/ui-context';
import { localDate } from '../../shared/date';
import { downloadFile } from '../../shared/download';
import type { Category } from '../../data/schema';
import styles from '../features.module.css';

interface DictionaryEditor {
  kind: 'category' | 'subject';
  id?: string;
  type?: Category['type'];
  name: string;
}

export function SettingsPage() {
  const { snapshot, problem } = useAppStore();
  const { data } = snapshot;
  const { run, notify, confirm } = useUi();
  const [editor, setEditor] = useState<DictionaryEditor | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Category['type']>('expense');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const open = (next: DictionaryEditor) => {
    setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setName(next.name);
    setType(next.type ?? 'expense');
    setError('');
    setEditor(next);
  };
  const exportData = () => {
    try {
      downloadFile(`workbench-${localDate()}.json`, repository.export());
      notify('备份文件已导出');
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '导出失败', true);
    }
  };
  const toggle = (kind: 'category' | 'subject', id: string) =>
    void run(
      () =>
        repository.update((draft) => {
          const items = kind === 'category' ? draft.data.categories : draft.data.subjects;
          const item = items.find((entry) => entry.id === id);
          if (item) item.active = !item.active;
        }),
      '设置已保存',
    );
  return (
    <>
      <PageHeader
        eyebrow="PREFERENCES"
        title="工作台设置"
        description="整理你的分类，照顾好你的数据。"
      />
      <div className={styles.settingsIntro}>
        <span>
          <ShieldCheck size={23} />
        </span>
        <div>
          <h2>数据留在你的浏览器</h2>
          <p>无需登录。清理浏览器数据或更换电脑前，请先导出备份。</p>
        </div>
        <span className="badge green">仅本机存储</span>
      </div>
      <Card title="数据备份" icon={HardDrive} subtitle="JSON 格式">
        <div className={styles.backupGrid}>
          <div>
            <h3>保存一份安心</h3>
            <p>备份包含四个模块的数据、记账分类和自习科目。正在运行的计时不会写入备份。</p>
            <div className={styles.backupActions}>
              <button className="button primary" onClick={exportData} disabled={!!problem}>
                <Download size={16} />
                导出备份
              </button>
              <button className="button" onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                导入备份
              </button>
              <input
                ref={fileInput}
                aria-label="导入备份文件"
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  try {
                    if (file.size > 20 * 1024 * 1024)
                      throw new Error('备份文件超过 20 MB，请选择工作台导出的 JSON 文件');
                    const backup = repository.validateBackup(await file.text());
                    const counts = backup.data;
                    confirm({
                      title: '导入数据备份',
                      description: `备份包含 ${counts.todos.length} 项待办、${counts.habits.length} 个习惯、${counts.transactions.length} 笔收支、${counts.studyRecords.length} 条自习。确认后将替换当前全部数据和设置，并重置计时。建议先导出当前数据。`,
                      label: '确认替换',
                      action: async () => {
                        await repository.import(backup);
                      },
                    });
                  } catch (reason) {
                    notify(reason instanceof Error ? reason.message : '无法读取备份文件', true);
                  }
                }}
              />
            </div>
            {problem && (
              <div className={styles.recovery}>
                <p>{problem}</p>
                <button
                  className="button"
                  onClick={() => {
                    try {
                      downloadFile(`workbench-raw-${localDate()}.json`, repository.exportRaw());
                    } catch {
                      notify('浏览器不允许读取存储，请检查浏览器设置', true);
                    }
                  }}
                >
                  导出原始数据
                </button>
              </div>
            )}
          </div>
          <div className={styles.backupSummary}>
            <span>
              <strong>
                {data.todos.length +
                  data.habits.length +
                  data.transactions.length +
                  data.studyRecords.length}
              </strong>
              条业务记录
            </span>
            <span>
              <strong>
                {snapshot.updatedAt
                  ? new Date(snapshot.updatedAt).toLocaleDateString('zh-CN')
                  : '—'}
              </strong>
              最近保存日期
            </span>
          </div>
        </div>
      </Card>
      <div className="equal-grid">
        <Card
          title="记账分类"
          icon={Tag}
          action={
            <button className="text-button" onClick={() => open({ kind: 'category', name: '' })}>
              <Plus size={15} />
              新增分类
            </button>
          }
        >
          <div className={styles.dictionary}>
            {(['expense', 'income'] as const).map((categoryType) => (
              <div key={categoryType}>
                <h3 className={styles.dictionaryGroup}>
                  {categoryType === 'expense' ? '支出分类' : '收入分类'}
                </h3>
                {data.categories
                  .filter((item) => item.type === categoryType)
                  .map((item) => (
                    <div
                      key={item.id}
                      className={`${styles.dictionaryRow} ${!item.active ? styles.inactive : ''}`}
                    >
                      <span>{item.name}</span>
                      {!item.active && <small>已停用</small>}
                      <button
                        className="icon-button"
                        aria-label={`改名 ${item.type === 'income' ? '收入' : '支出'} ${item.name}`}
                        onClick={() =>
                          open({ kind: 'category', id: item.id, name: item.name, type: item.type })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => toggle('category', item.id)}
                        aria-label={`${item.active ? '停用' : '启用'} ${item.type === 'income' ? '收入' : '支出'} ${item.name}`}
                      >
                        {item.active ? '停用' : '启用'}
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Card>
        <Card
          title="自习科目"
          icon={BookOpen}
          action={
            <button className="text-button" onClick={() => open({ kind: 'subject', name: '' })}>
              <Plus size={15} />
              新增科目
            </button>
          }
        >
          <div className={styles.dictionary}>
            {data.subjects.map((item) => (
              <div
                key={item.id}
                className={`${styles.dictionaryRow} ${!item.active ? styles.inactive : ''}`}
              >
                <span>{item.name}</span>
                {!item.active && <small>已停用</small>}
                <button
                  className="icon-button"
                  aria-label={`改名科目 ${item.name}`}
                  onClick={() => open({ kind: 'subject', id: item.id, name: item.name })}
                >
                  <Pencil size={14} />
                </button>
                <button className="text-button" onClick={() => toggle('subject', item.id)}>
                  {item.active ? '停用' : '启用'}
                </button>
              </div>
            ))}
          </div>
          <div className={styles.sideTip}>
            改名会同步更新历史记录的显示；停用只影响新记录，可随时重新启用。
          </div>
        </Card>
      </div>
      {editor && (
        <Modal
          title={`${editor.id ? '修改' : '新增'}${editor.kind === 'category' ? '记账分类' : '自习科目'}`}
          description="名称保持简短，方便记录时选择。"
          returnFocus={opener}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              if (!name.trim()) {
                setError('请填写名称');
                return;
              }
              setBusy(true);
              try {
                await repository.update((draft) => {
                  const items =
                    editor.kind === 'category' ? draft.data.categories : draft.data.subjects;
                  if (
                    items.some(
                      (item) =>
                        item.id !== editor.id &&
                        item.name === name.trim() &&
                        (editor.kind === 'subject' || ('type' in item && item.type === type)),
                    )
                  )
                    throw new Error('同一类型中已存在这个名称');
                  if (editor.id) {
                    const item = items.find((entry) => entry.id === editor.id);
                    if (!item) throw new Error('设置已改变，请重新打开');
                    item.name = name.trim();
                  } else if (editor.kind === 'category')
                    draft.data.categories.push({
                      id: crypto.randomUUID(),
                      name: name.trim(),
                      type,
                      active: true,
                    });
                  else
                    draft.data.subjects.push({
                      id: crypto.randomUUID(),
                      name: name.trim(),
                      active: true,
                    });
                });
                setEditor(null);
                notify('设置已保存');
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '保存失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="名称" id="dictionary-name">
              <input
                id="dictionary-name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {editor.kind === 'category' && !editor.id && (
              <Field label="类型" id="dictionary-type">
                <select
                  id="dictionary-type"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value === 'income' ? 'income' : 'expense')
                  }
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </Field>
            )}
            <FormError message={error} />
            <FormActions busy={busy} onCancel={() => setEditor(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}
