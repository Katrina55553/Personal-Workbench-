import { useState } from 'react';
import { repository, useAppStore } from '../data/store';
import { Modal, Field, FormActions, FormError } from '../shared/components';
import { useUi } from '../shared/ui-context';
import type { EditorRequest } from '../shared/ui-context';
import { isDate, localDate } from '../shared/date';
import { parseAmount } from './finance/stats';
import type { Todo, Transaction } from '../data/schema';

const titles = { todo: '待办', habit: '习惯', finance: '收支', study: '自习' };

export function RecordEditor({
  request,
  onClose,
  returnFocus,
}: {
  request: EditorRequest;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const { data } = useAppStore((state) => state.snapshot);
  const { notify } = useUi();
  const item = request.item;
  const [title, setTitle] = useState(item?.title ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [date, setDate] = useState(
    request.kind === 'finance' || request.kind === 'study'
      ? (request.item?.date ?? localDate())
      : localDate(),
  );
  const [priority, setPriority] = useState<Todo['priority']>(
    request.kind === 'todo' ? (request.item?.priority ?? 'P1') : 'P1',
  );
  const [type, setType] = useState<Transaction['type']>(
    request.kind === 'finance' ? (request.item?.type ?? 'expense') : 'expense',
  );
  const [amount, setAmount] = useState(
    request.kind === 'finance' && request.item ? (request.item.amountCents / 100).toFixed(2) : '',
  );
  const [categoryId, setCategoryId] = useState(
    request.kind === 'finance'
      ? (request.item?.categoryId ??
          data.categories.find((category) => category.active && category.type === 'expense')?.id ??
          '')
      : '',
  );
  const [subjectId, setSubjectId] = useState(
    request.kind === 'study'
      ? (request.item?.subjectId ?? data.subjects.find((subject) => subject.active)?.id ?? '')
      : '',
  );
  const [minutes, setMinutes] = useState(
    request.kind === 'study' ? String(request.item?.minutes ?? '') : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseRevision, setBaseRevision] = useState(repository.revision);
  const categories = data.categories.filter(
    (category) =>
      category.type === type &&
      (category.active || (request.kind === 'finance' && category.id === request.item?.categoryId)),
  );
  const subjects = data.subjects.filter(
    (subject) =>
      subject.active || (request.kind === 'study' && subject.id === request.item?.subjectId),
  );

  return (
    <Modal
      title={`${item ? '编辑' : '新建'}${titles[request.kind]}`}
      description={
        request.kind === 'habit' ? '把每天的小事，变成长期的习惯。' : '记录一件事，让今天更有条理。'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      returnFocus={returnFocus}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setError('');
          if (!title.trim()) {
            setError('请填写标题');
            return;
          }
          if ((request.kind === 'finance' || request.kind === 'study') && !isDate(date)) {
            setError('请选择有效日期');
            return;
          }
          const cents = parseAmount(amount);
          if (request.kind === 'finance' && cents === null) {
            setError('金额须大于 0，且最多保留两位小数');
            return;
          }
          if (
            request.kind === 'study' &&
            (!/^\d+$/.test(minutes) || Number(minutes) <= 0 || Number(minutes) > 1440)
          ) {
            setError('时长须为 1–1440 的整数分钟');
            return;
          }
          setBusy(true);
          try {
            await repository.update((draft) => {
              const now = Date.now();
              const base = {
                id: item?.id ?? crypto.randomUUID(),
                title: title.trim(),
                note: note.trim(),
                createdAt: item?.createdAt ?? now,
                updatedAt: now,
              };
              if (request.kind === 'todo') {
                const index = draft.data.todos.findIndex((entry) => entry.id === base.id);
                const record = {
                  ...base,
                  priority,
                  done: draft.data.todos[index]?.done ?? false,
                  pinned: draft.data.todos[index]?.pinned ?? false,
                };
                if (item && index < 0) throw new Error('记录已在其他页面删除，请重新打开');
                if (index < 0) draft.data.todos.unshift(record);
                else draft.data.todos[index] = record;
              } else if (request.kind === 'habit') {
                const index = draft.data.habits.findIndex((entry) => entry.id === base.id);
                if (item && index < 0) throw new Error('记录已删除，请重新打开');
                const record = { ...base, log: draft.data.habits[index]?.log ?? {} };
                if (index < 0) draft.data.habits.unshift(record);
                else draft.data.habits[index] = record;
              } else if (request.kind === 'finance') {
                const category = draft.data.categories.find(
                  (entry) => entry.id === categoryId && entry.type === type,
                );
                if (!category || (!category.active && categoryId !== request.item?.categoryId))
                  throw new Error('请选择可用分类，也可先到设置添加');
                const record = { ...base, type, amountCents: cents ?? 0, categoryId, date };
                const index = draft.data.transactions.findIndex((entry) => entry.id === base.id);
                if (item && index < 0) throw new Error('记录已删除，请重新打开');
                if (index < 0) draft.data.transactions.unshift(record);
                else draft.data.transactions[index] = record;
              } else {
                const subject = draft.data.subjects.find((entry) => entry.id === subjectId);
                if (!subject || (!subject.active && subjectId !== request.item?.subjectId))
                  throw new Error('请选择可用科目，也可先到设置添加');
                const record = {
                  ...base,
                  subjectId,
                  date,
                  minutes: Number(minutes),
                  source: request.item?.source ?? ('manual' as const),
                  sessionId: request.item?.sessionId ?? null,
                };
                const index = draft.data.studyRecords.findIndex((entry) => entry.id === base.id);
                if (item && index < 0) throw new Error('记录已删除，请重新打开');
                if (index < 0) draft.data.studyRecords.unshift(record);
                else draft.data.studyRecords[index] = record;
              }
            }, baseRevision);
            notify('记录已保存');
            onClose();
          } catch (reason) {
            setBaseRevision(repository.revision);
            setError(reason instanceof Error ? reason.message : '保存失败');
          } finally {
            setBusy(false);
          }
        }}
      >
        {request.kind === 'finance' && (
          <Field label="收支类型" id="record-type">
            <select
              id="record-type"
              value={type}
              onChange={(event) => {
                const next = event.target.value === 'income' ? 'income' : 'expense';
                setType(next);
                setCategoryId(
                  data.categories.find((category) => category.active && category.type === next)
                    ?.id ?? '',
                );
              }}
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </Field>
        )}
        <Field label={request.kind === 'habit' ? '习惯名称' : '标题'} id="record-title">
          <input
            id="record-title"
            autoComplete="off"
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={request.kind === 'habit' ? '例如：每天阅读 20 分钟' : '写下这件事…'}
          />
        </Field>
        {request.kind === 'todo' && (
          <Field label="优先级" id="record-priority">
            <select
              id="record-priority"
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target.value === 'P0' ? 'P0' : event.target.value === 'P2' ? 'P2' : 'P1',
                )
              }
            >
              <option value="P0">高优先级</option>
              <option value="P1">中优先级</option>
              <option value="P2">低优先级</option>
            </select>
          </Field>
        )}
        {request.kind === 'finance' && (
          <div className="form-row">
            <Field label="金额（元）" id="record-amount">
              <input
                id="record-amount"
                inputMode="decimal"
                required
                value={amount}
                placeholder="0.00"
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="分类" id="record-category">
              <select
                id="record-category"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">请选择分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {!category.active ? '（已停用）' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {request.kind === 'study' && (
          <div className="form-row">
            <Field label="科目" id="record-subject">
              <select
                id="record-subject"
                required
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                <option value="">请选择科目</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {!subject.active ? '（已停用）' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="时长（分钟）" id="record-minutes">
              <input
                id="record-minutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                required
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                placeholder="25"
              />
            </Field>
          </div>
        )}
        {(request.kind === 'finance' || request.kind === 'study') && (
          <Field label="日期" id="record-date">
            <input
              id="record-date"
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        )}
        <Field
          label={request.kind === 'study' ? '学习内容（可选）' : '备注（可选）'}
          id="record-note"
        >
          <textarea
            id="record-note"
            rows={3}
            maxLength={10000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="补充一点细节…"
          />
        </Field>
        <FormError message={error} />
        <FormActions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}
