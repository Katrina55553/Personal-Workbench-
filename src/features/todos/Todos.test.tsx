import { beforeEach, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UiProvider } from '../../shared/UiProvider';
import { TodosPage } from './Todos';
import { repository } from '../../data/store';
import { createInitialSnapshot } from '../../data/defaults';

beforeEach(async () => {
  localStorage.clear();
  await repository.import({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: createInitialSnapshot().data,
  });
});
it('可创建中文待办、完成筛选，Esc 关闭后恢复到打开按钮', async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <TodosPage />
    </UiProvider>,
  );
  const open = screen.getAllByRole('button', { name: '新建待办' })[0]!;
  await user.click(open);
  await user.type(screen.getByLabelText('标题'), '整理工作台');
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('整理工作台')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '完成 整理工作台' }));
  await user.click(screen.getByRole('button', { name: '已完成' }));
  await waitFor(() => expect(screen.getByText('整理工作台')).toBeInTheDocument());
  await user.click(open);
  await user.keyboard('{Escape}');
  expect(open).toHaveFocus();
});
it('空白标题给出错误并保留表单', async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <TodosPage />
    </UiProvider>,
  );
  await user.click(screen.getAllByRole('button', { name: '新建待办' })[0]!);
  await user.type(screen.getByLabelText('标题'), '   ');
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请填写标题');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
