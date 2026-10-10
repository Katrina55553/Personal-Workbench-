import { localDate } from '../shared/date';
import { BREAK_MS, FOCUS_MS } from './defaults';
import type { Snapshot } from './schema';

export function settleTimer(snapshot: Snapshot, now: number): 'focus' | 'break' | null {
  const timer = snapshot.timer;
  if (timer.status !== 'running' || timer.deadline === null || timer.deadline > now) return null;
  const phase = timer.phase;
  if (
    phase === 'focus' &&
    timer.sessionId &&
    timer.subjectId &&
    !snapshot.data.studyRecords.some((record) => record.sessionId === timer.sessionId)
  ) {
    snapshot.data.studyRecords.unshift({
      id: crypto.randomUUID(),
      title: '番茄钟专注',
      note: '',
      createdAt: timer.deadline,
      updatedAt: timer.deadline,
      subjectId: timer.subjectId,
      minutes: 25,
      date: localDate(new Date(timer.deadline)),
      source: 'pomodoro',
      sessionId: timer.sessionId,
    });
  }
  snapshot.timer = {
    phase: phase === 'focus' ? 'break' : 'focus',
    status: 'ready',
    remainingMs: phase === 'focus' ? BREAK_MS : FOCUS_MS,
    deadline: null,
    sessionId: null,
    subjectId: timer.subjectId,
  };
  return phase;
}
