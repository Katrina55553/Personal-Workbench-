import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal, FormActions, FormError } from './components';
import { UiContext } from './ui-context';
import type { ConfirmRequest, EditorRequest } from './ui-context';
import { RecordEditor } from '../features/RecordEditor';
import styles from './ui.module.css';
import { repository } from '../data/store';

export function UiProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, isError = false) => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast({ message, error: isError });
    timeout.current = setTimeout(() => setToast(null), isError ? 10000 : 5000);
  }, []);
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        if (success) notify(success);
        return true;
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : '操作失败，请重试', true);
        return false;
      }
    },
    [notify],
  );
  const edit = (request: EditorRequest) => {
    setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setEditor(request);
  };
  const confirm = (request: ConfirmRequest) => {
    let revision = repository.revision;
    setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError('');
    setConfirmation({
      ...request,
      action: async () => {
        if (revision !== repository.revision) {
          revision = repository.revision;
          throw new Error('数据已在其他电脑或页面改变，请检查最新数据后重新确认');
        }
        try {
          await request.action();
        } catch (reason) {
          revision = repository.revision;
          throw reason;
        }
      },
    });
  };
  return (
    <UiContext.Provider value={{ edit, confirm, notify, run }}>
      {children}
      {editor && (
        <RecordEditor request={editor} onClose={() => setEditor(null)} returnFocus={opener} />
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          description={confirmation.description}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          returnFocus={opener}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await confirmation.action();
                setConfirmation(null);
                notify('操作已完成');
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : '操作失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            <FormError message={error} />
            <FormActions
              onCancel={() => {
                if (!busy) setConfirmation(null);
              }}
              busy={busy}
              label={confirmation.label ?? '确认删除'}
            />
          </form>
        </Modal>
      )}
      {toast && (
        <div
          className={`${styles.toast} ${toast.error ? styles.toastError : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {toast.message}
          <button onClick={() => setToast(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
    </UiContext.Provider>
  );
}
