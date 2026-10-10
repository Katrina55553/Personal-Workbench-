import { createContext, useContext } from 'react';
import type { Habit, StudyRecord, Todo, Transaction } from '../data/schema';

export type EditorRequest =
  | { kind: 'todo'; item?: Todo }
  | { kind: 'habit'; item?: Habit }
  | { kind: 'finance'; item?: Transaction }
  | { kind: 'study'; item?: StudyRecord };
export interface ConfirmRequest {
  title: string;
  description: string;
  action: () => Promise<void>;
  label?: string;
}
export interface UiContextValue {
  edit: (request: EditorRequest) => void;
  confirm: (request: ConfirmRequest) => void;
  notify: (message: string, error?: boolean) => void;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}
export const UiContext = createContext<UiContextValue | null>(null);
export function useUi(): UiContextValue {
  const context = useContext(UiContext);
  if (!context) throw new Error('UI provider missing');
  return context;
}
