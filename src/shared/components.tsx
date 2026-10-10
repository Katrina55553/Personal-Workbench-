import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X, ArrowUpRight, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './ui.module.css';
import { useAppStore } from '../data/store';

export function Modal({
  title,
  description,
  children,
  onClose,
  returnFocus,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.modal}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus?.isConnected) returnFocus.focus();
            else document.querySelector<HTMLElement>('main h1')?.focus();
          }}
        >
          <div className={styles.modalHeading}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭弹窗">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1 tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function NewButton({
  children = '新建',
  onClick,
}: {
  children?: ReactNode;
  onClick: () => void;
}) {
  const canWrite = useAppStore((state) => state.canWrite);
  return (
    <button className="button primary" disabled={!canWrite} onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Card({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className}`}>
      {title && (
        <div className={styles.cardHeading}>
          <div className={styles.cardTitle}>
            {Icon && <Icon size={18} />}
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'amber' | 'violet';
}) {
  return (
    <div className={`${styles.stat} ${styles[color]}`}>
      <div className={styles.statTop}>
        <span>{title}</span>
        <Icon size={20} />
      </div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statDetail}>{detail}</div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ViewLink({ to, children = '查看全部' }: { to: string; children?: ReactNode }) {
  return (
    <a className={styles.viewLink} href={`#${to}`}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <p className={styles.formError} role="alert">
      {message}
    </p>
  ) : null;
}
export function FormActions({
  onCancel,
  busy,
  label = '保存',
}: {
  onCancel: () => void;
  busy?: boolean;
  label?: string;
}) {
  const canWrite = useAppStore((state) => state.canWrite);
  return (
    <div className={styles.formActions}>
      <button type="button" className="button" onClick={onCancel} disabled={busy}>
        取消
      </button>
      <button className="button primary" type="submit" disabled={busy || !canWrite}>
        {busy ? '保存中…' : label}
      </button>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索标题或备注…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="search-input"
      type="search"
      aria-label="搜索记录"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
export function Distribution({
  rows,
  empty = '记录后，这里会显示分布',
}: {
  rows: { name: string; value: number; label: string }[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.length ? (
    <div className={styles.distribution}>
      {rows.map((row, index) => (
        <div key={row.name} className={styles.distributionRow}>
          <div>
            <span>{row.name}</span>
            <strong>{row.label}</strong>
          </div>
          <div className={styles.barTrack}>
            <span
              style={{
                width: `${(row.value / max) * 100}%`,
                background: ['#6b8ddb', '#7eaf9d', '#c5a56c', '#a899c9'][index % 4],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className={styles.smallEmpty}>{empty}</p>
  );
}
